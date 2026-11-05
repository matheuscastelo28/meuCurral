import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, FileText, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { CampoFiltro, CLASSE_SELECT_FILTRO, PainelFiltros } from "@/components/PainelFiltros";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, dataISO, hojeISO, moeda as formatarMoeda } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";
import {
  CATEGORIAS_DESPESA,
  CATEGORIAS_RECEITA,
  rotuloCategoriaFinanceira,
  textoLote,
} from "@/lib/rotulos";
import {
  gerarParcelas,
  statusExibicaoConta,
  statusExibicaoParcela,
  statusUnificadoLancamento,
  type StatusConta,
  type StatusParcela,
} from "@/lib/parcelamento";
import { cn } from "@/lib/utils";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Curral Online" },
      { name: "description", content: "Receitas e despesas da fazenda em um só lugar." },
      { property: "og:title", content: "Financeiro — Curral Online" },
      { property: "og:description", content: "Receitas e despesas da fazenda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { conta?: string; novo?: boolean } => {
    const conta = typeof search["conta"] === "string" ? search["conta"] : undefined;
    const novo = search["novo"] === true || search["novo"] === "1" ? true : undefined;
    return { ...(conta ? { conta } : {}), ...(novo ? { novo } : {}) };
  },
  component: Financeiro,
});

const SLOT_CATEGORIA: Record<string, number> = {
  racao: 1,
  sanidade: 2,
  compra: 3,
  mao_de_obra: 4,
  manutencao: 5,
  energia: 6,
  impostos: 7,
  outro: 8,
};

const FORMAS_PAGAMENTO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  boleto: "Boleto",
  transferencia: "Transferência",
};

const TIPO_LABEL: Record<string, string> = { a_receber: "A receber", a_pagar: "A pagar" };

const STATUS_INFO_CONTA: Record<StatusConta, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Pendente", classe: "bg-warning/15 text-warning" },
  parcial: { rotulo: "Parcial", classe: "bg-warning/15 text-warning" },
  pago: { rotulo: "Pago", classe: "bg-success/15 text-success" },
  atrasado: { rotulo: "Atrasado", classe: "bg-destructive/15 text-destructive" },
  cancelado: { rotulo: "Cancelado", classe: "bg-muted text-muted-foreground" },
};

const STATUS_INFO_PARCELA: Record<StatusParcela, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Pendente", classe: "bg-warning/15 text-warning" },
  pago: { rotulo: "Pago", classe: "bg-success/15 text-success" },
  atrasado: { rotulo: "Atrasado", classe: "bg-destructive/15 text-destructive" },
  cancelado: { rotulo: "Cancelado", classe: "bg-muted text-muted-foreground" },
};

function StatusBadge({
  status,
  info,
}: {
  status: string;
  info: Record<string, { rotulo: string; classe: string }>;
}) {
  const i = info[status] ?? { rotulo: status, classe: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", i.classe)}>
      {i.rotulo}
    </span>
  );
}

interface ParcelaRow {
  id: string;
  conta_id: string;
  numero: number;
  total_parcelas: number;
  valor: string | number;
  vencimento: string | Date;
  status: string;
  pago_em: string | Date | null;
  forma_pagamento: string | null;
}

interface ContaRow {
  id: string;
  tipo: "a_receber" | "a_pagar";
  descricao: string;
  valor_total: string | number;
  valor_restante: string | number;
  categoria: string | null;
  pessoa: string | null;
  animal_id: string | null;
  forma_pagamento: string | null;
  data_emissao: string | Date;
  observacoes: string | null;
  status: string;
  created_at: string | Date;
}

function Financeiro() {
  const prefs = usePreferencias();
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const hoje = hojeISO();
  const { conta: contaIdNaUrl, novo: novoNaUrl } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "despesa" | "receita">("todos");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusConta>("todos");
  const [filtroData, setFiltroData] = useState("");

  const lancamentos = useQuery({
    queryKey: ["financeiro", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("financeiro_lancamentos")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const marcarRecebido = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await db.leite.marcarRecebido(ids);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lançamentos marcados como recebidos.");
      setSelecionados(new Set());
      setLancamentoDetalhe(null);
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    },
    onError: () => toast.error("Não conseguimos confirmar o recebimento agora."),
  });

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  // ---------------------------------------------------------------------
  // Contas a receber/a pagar (com parcelas)
  // ---------------------------------------------------------------------

  const contas = useQuery({
    queryKey: ["contas", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("contas")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContaRow[];
    },
  });

  const parcelasConta = useQuery({
    queryKey: ["parcelas", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("parcelas")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ParcelaRow[];
    },
  });

  const parcelasPorConta = useMemo(() => {
    const mapa = new Map<string, ParcelaRow[]>();
    for (const p of parcelasConta.data ?? []) {
      const lista = mapa.get(p.conta_id) ?? [];
      lista.push(p);
      mapa.set(p.conta_id, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.numero - b.numero);
    return mapa;
  }, [parcelasConta.data]);

  const contasComDados = useMemo(() => {
    return (contas.data ?? []).map((c) => {
      const parcelasDaConta = parcelasPorConta.get(c.id) ?? [];
      const statusExibido = statusExibicaoConta(c, parcelasDaConta);
      const proximaPendente = parcelasDaConta
        .filter((p) => p.status === "pendente")
        .sort((a, b) => dataISO(a.vencimento).localeCompare(dataISO(b.vencimento)))[0];
      return { ...c, parcelas: parcelasDaConta, statusExibido, proximaPendente };
    });
  }, [contas.data, parcelasPorConta]);

  // Lançamentos simples e contas (com suas parcelas) entram na mesma lista,
  // em esquema de pilha: o que foi lançado por último aparece no topo,
  // mesmo que dois itens tenham a mesma data — por isso a ordenação usa
  // created_at (o instante real do registro), não a data escolhida no
  // formulário. Cada linha se comporta do jeito do seu tipo (lançamento
  // ganha a caixinha de seleção legada pra "marcar como recebido"; conta
  // ganha o badge de parcelas), mas as duas têm "Ver detalhes" e o mesmo
  // badge de status.
  const linhasFinanceiras = useMemo(() => {
    const doLancamentos = (lancamentos.data ?? []).map((l) => ({
      kind: "lancamento" as const,
      dataOrdenacao: dataISO(l.data),
      criadoEm: String(l.created_at ?? l.data),
      tipoBucket: (l.tipo === "receita" ? "receita" : "despesa") as "receita" | "despesa",
      statusUnificado: statusUnificadoLancamento(l, hoje),
      lancamento: l,
    }));
    const doContas = contasComDados.map((c) => ({
      kind: "conta" as const,
      dataOrdenacao: dataISO(c.data_emissao),
      criadoEm: String(c.created_at ?? c.data_emissao),
      tipoBucket: (c.tipo === "a_receber" ? "receita" : "despesa") as "receita" | "despesa",
      statusUnificado: c.statusExibido,
      conta: c,
    }));
    return [...doLancamentos, ...doContas].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }, [lancamentos.data, contasComDados, hoje]);

  const filtroAtivo = filtroTipo !== "todos" || filtroStatus !== "todos" || filtroData !== "";
  const linhasFiltradas = linhasFinanceiras.filter(
    (linha) =>
      (filtroTipo === "todos" || linha.tipoBucket === filtroTipo) &&
      (filtroStatus === "todos" || linha.statusUnificado === filtroStatus) &&
      (!filtroData || linha.dataOrdenacao === filtroData),
  );

  // ---------------------------------------------------------------------
  // Cards de resumo — uma linha só, somando lançamento simples e conta sem
  // contar o mesmo dinheiro duas vezes: "recebido"/"despesas" olham pra
  // parte já efetivada (lançamento confirmado + valor_total - valor_restante
  // de cada conta); "a receber"/"a pagar" olham só pro saldo ainda pendente.
  // ---------------------------------------------------------------------

  const recebidoUnificado =
    (lancamentos.data ?? [])
      .filter((l) => l.tipo === "receita" && l.status === "recebido")
      .reduce((s, l) => s + Number(l.valor), 0) +
    contasComDados
      .filter((c) => c.tipo === "a_receber")
      .reduce((s, c) => s + (Number(c.valor_total) - Number(c.valor_restante)), 0);

  const despesasUnificado =
    (lancamentos.data ?? [])
      .filter((l) => l.tipo === "despesa")
      .reduce((s, l) => s + Number(l.valor), 0) +
    contasComDados
      .filter((c) => c.tipo === "a_pagar")
      .reduce((s, c) => s + (Number(c.valor_total) - Number(c.valor_restante)), 0);

  const aReceberContas = contasComDados
    .filter(
      (c) =>
        c.tipo === "a_receber" && c.statusExibido !== "cancelado" && c.statusExibido !== "pago",
    )
    .reduce((s, c) => s + Number(c.valor_restante), 0);
  const aPagarContas = contasComDados
    .filter(
      (c) => c.tipo === "a_pagar" && c.statusExibido !== "cancelado" && c.statusExibido !== "pago",
    )
    .reduce((s, c) => s + Number(c.valor_restante), 0);
  const aReceberUnificado =
    (lancamentos.data ?? [])
      .filter((l) => l.tipo === "receita" && l.status === "a_receber")
      .reduce((s, l) => s + Number(l.valor), 0) + aReceberContas;

  const saldoRealizadoUnificado = recebidoUnificado - despesasUnificado;

  // Pra onde vai o dinheiro: despesa paga (lançamento + parte paga das
  // contas) agrupada por categoria.
  const despesasPorCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of lancamentos.data ?? []) {
      if (l.tipo !== "despesa") continue;
      const chave = l.categoria || "";
      mapa.set(chave, (mapa.get(chave) ?? 0) + Number(l.valor));
    }
    for (const c of contasComDados) {
      if (c.tipo !== "a_pagar") continue;
      const pago = Number(c.valor_total) - Number(c.valor_restante);
      if (pago <= 0) continue;
      const chave = c.categoria || "";
      mapa.set(chave, (mapa.get(chave) ?? 0) + pago);
    }
    // Cor presa à categoria (não à posição): filtrar ou mudar valores nunca
    // troca a cor de uma categoria. "Outro", sem categoria e qualquer
    // categoria antiga caem juntos no último slot.
    const agrupado = new Map<string, number>();
    for (const [cat, valor] of mapa) {
      const chave = SLOT_CATEGORIA[cat] ? cat : "outro";
      agrupado.set(chave, (agrupado.get(chave) ?? 0) + valor);
    }
    return Array.from(agrupado.entries())
      .map(([cat, valor]) => ({
        cat,
        valor,
        rotulo: cat === "outro" ? "Outros / sem categoria" : rotuloCategoriaFinanceira(cat),
        cor: `var(--serie-${SLOT_CATEGORIA[cat]})`,
      }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [lancamentos.data, contasComDados]);

  const emAtrasoLancamentos = (lancamentos.data ?? [])
    .filter((l) => l.tipo === "receita" && l.status === "a_receber" && dataISO(l.data) < hoje)
    .reduce((s, l) => s + Number(l.valor), 0);
  const emAtrasoContas = (parcelasConta.data ?? [])
    .filter((p) => statusExibicaoParcela(p) === "atrasado")
    .reduce((s, p) => s + Number(p.valor), 0);
  const emAtrasoUnificado = emAtrasoContas + emAtrasoLancamentos;

  // ---------------------------------------------------------------------
  // Formulário único de lançamento — um lançamento simples (já aconteceu,
  // sem parcelas reais) vira uma linha em financeiro_lancamentos; qualquer
  // coisa pendente ou parcelada vira uma conta (1 parcela quando à vista
  // mas ainda não recebida/paga).
  // ---------------------------------------------------------------------

  const [formAberto, setFormAberto] = useState(false);
  const [tipo, setTipo] = useState<"despesa" | "receita">("despesa");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [formaPagamento, setFormaPagamento] = useState("dinheiro");
  const [jaAconteceu, setJaAconteceu] = useState(true);
  const [pessoa, setPessoa] = useState("");
  const [parcelado, setParcelado] = useState(false);
  const [numParcelas, setNumParcelas] = useState("2");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hoje);
  const [intervaloDias, setIntervaloDias] = useState("30");
  const [categoria, setCategoria] = useState("");
  const [loteLanc, setLoteLanc] = useState("");

  // Lote de destino de uma despesa — mesmo texto livre de animais.lote.
  // Assim uma ração comprada aqui já entra no custo do lote no Confinamento.
  const lotesExistentes = useQuery({
    queryKey: ["lotes-existentes", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("lote, status")
        .eq("fazenda_id", fazenda!.id);
      if (error) throw error;
      const nomes = new Set<string>();
      for (const a of data ?? []) {
        const nome = String(a.lote ?? "").trim();
        if (nome && a.status !== "vendido" && a.status !== "morto") nomes.add(nome);
      }
      return Array.from(nomes).sort((x, y) => x.localeCompare(y, "pt-BR"));
    },
  });

  function limparForm() {
    setDescricao("");
    setValor("");
    setData(hoje);
    setFormaPagamento("dinheiro");
    setJaAconteceu(true);
    setPessoa("");
    setParcelado(false);
    setNumParcelas("2");
    setPrimeiroVencimento(hoje);
    setIntervaloDias("30");
    setCategoria("");
    setLoteLanc("");
  }

  const vaiVirarConta = parcelado || !jaAconteceu;

  const previewParcelas = useMemo(() => {
    if (!vaiVirarConta) return [];
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0) return [];
    const n = parcelado ? Math.max(1, Math.floor(Number(numParcelas) || 1)) : 1;
    const primeiraData = parcelado ? primeiroVencimento : data;
    if (!primeiraData) return [];
    const intervalo = parcelado ? Math.max(1, Math.floor(Number(intervaloDias) || 30)) : 0;
    return gerarParcelas(valorNum, n, primeiraData, intervalo);
  }, [vaiVirarConta, valor, parcelado, numParcelas, primeiroVencimento, intervaloDias, data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const valorNum = Number(valor);
      if (vaiVirarConta) {
        const { error } = await db.financeiro.criarConta({
          fazendaId: fazenda!.id,
          tipo: tipo === "receita" ? "a_receber" : "a_pagar",
          descricao: descricao.trim(),
          valorTotal: valorNum,
          dataEmissao: data,
          categoria: categoria || null,
          pessoa: pessoa.trim() || null,
          formaPagamento: formaPagamento || null,
          observacoes: null,
          parcelamento: parcelado
            ? {
                numParcelas: Math.max(1, Math.floor(Number(numParcelas) || 1)),
                primeiroVencimento,
                intervaloDias: Math.max(1, Math.floor(Number(intervaloDias) || 30)),
              }
            : null,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("financeiro_lancamentos").insert({
          fazenda_id: fazenda!.id,
          tipo,
          descricao: descricao.trim(),
          valor: valorNum,
          data,
          forma_pagamento: formaPagamento,
          parcelas: null,
          categoria: categoria || null,
          lote: tipo === "despesa" && loteLanc ? loteLanc : null,
          ...(tipo === "receita" ? { status: "recebido" } : {}),
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(vaiVirarConta ? "Conta criada." : "Lançamento registrado.");
      limparForm();
      setFormAberto(false);
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["contas"] });
      queryClient.invalidateQueries({ queryKey: ["parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["despesas-lote"] });
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não conseguimos salvar agora."),
  });

  // ----- Detalhe / pagamento / cancelamento de conta -----
  const [contaDetalhe, setContaDetalhe] = useState<string | null>(null);
  const [pagandoParcela, setPagandoParcela] = useState<ParcelaRow | null>(null);
  const [pagoEm, setPagoEm] = useState(hoje);
  const [formaPagamentoBaixa, setFormaPagamentoBaixa] = useState("dinheiro");
  const [cancelando, setCancelando] = useState<string | null>(null);

  // Permite abrir o detalhe de uma conta direto de outra tela (ex: "Ver em
  // Financeiro" na Agenda) navegando para /financeiro?conta=<id>.
  useEffect(() => {
    if (!contaIdNaUrl || !contas.data) return;
    const alvo = contas.data.find((c) => c.id === contaIdNaUrl);
    if (alvo) setContaDetalhe(alvo.id);
    navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaIdNaUrl, contas.data]);

  // Permite abrir o formulário de novo lançamento direto de outra tela (ex:
  // "Novo lançamento" no Início) navegando para /financeiro?novo=1.
  useEffect(() => {
    if (!novoNaUrl) return;
    setFormAberto(true);
    navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novoNaUrl]);

  const marcarPagaMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.financeiro.marcarParcelaPaga({
        fazendaId: fazenda!.id,
        parcelaId: pagandoParcela!.id,
        pagoEm,
        formaPagamento: formaPagamentoBaixa,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Parcela marcada como paga.");
      setPagandoParcela(null);
      queryClient.invalidateQueries({ queryKey: ["contas"] });
      queryClient.invalidateQueries({ queryKey: ["parcelas"] });
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não conseguimos confirmar o pagamento."),
  });

  const cancelarContaMutation = useMutation({
    mutationFn: async (contaId: string) => {
      const { error } = await db.financeiro.cancelarConta({ fazendaId: fazenda!.id, contaId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Conta cancelada.");
      setCancelando(null);
      queryClient.invalidateQueries({ queryKey: ["contas"] });
      queryClient.invalidateQueries({ queryKey: ["parcelas"] });
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não conseguimos cancelar a conta."),
  });

  const contaSelecionada = contasComDados.find((c) => c.id === contaDetalhe) ?? null;

  // ----- Detalhe de lançamento simples (mesma funcionalidade de conta) -----
  const [lancamentoDetalhe, setLancamentoDetalhe] = useState<string | null>(null);
  const lancamentoSelecionado =
    (lancamentos.data ?? []).find((l) => l.id === lancamentoDetalhe) ?? null;

  return (
    <AppShell
      titulo="Financeiro"
      acao={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/relatorios">
              <FileText className="size-4" aria-hidden="true" />
              Relatório PDF
            </Link>
          </Button>
          <Button onClick={() => setFormAberto(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Novo lançamento
          </Button>
        </div>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Resumo rotulo="Recebido" valor={moeda(recebidoUnificado)} classe="text-success" />
        <Resumo rotulo="A receber" valor={moeda(aReceberUnificado)} classe="text-warning" />
        <Resumo rotulo="Despesas" valor={moeda(despesasUnificado)} classe="text-destructive" />
        <Resumo rotulo="A pagar" valor={moeda(aPagarContas)} classe="text-warning" />
        <Resumo rotulo="Saldo realizado" valor={moeda(saldoRealizadoUnificado)} classe="" />
        <Resumo rotulo="Em atraso" valor={moeda(emAtrasoUnificado)} classe="text-destructive" />
      </div>

      {despesasPorCategoria.length > 0 ? (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-base font-semibold">Para onde foi o dinheiro</h2>
            <p className="text-xs text-muted-foreground">Despesas já pagas, por categoria.</p>
            <ul className="mt-3 space-y-2.5">
              {despesasPorCategoria.map(({ cat, valor, rotulo, cor }) => (
                <li key={cat}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: cor }}
                      />
                      <span className="truncate">{rotulo}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {moeda(valor)}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {despesasUnificado > 0 ? Math.round((valor / despesasUnificado) * 100) : 0}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: cor,
                        width: `${despesasUnificado > 0 ? (valor / despesasUnificado) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col rounded-xl border border-border bg-card p-4">
            <h2 className="text-base font-semibold">Despesas por categoria</h2>
            <p className="text-xs text-muted-foreground">Fatia de cada categoria no total pago.</p>
            <div className="relative mx-auto mt-2 w-full max-w-[260px] flex-1">
              <ChartContainer
                config={Object.fromEntries(
                  despesasPorCategoria.map((d) => [d.cat, { label: d.rotulo, color: d.cor }]),
                )}
                className="aspect-square w-full"
              >
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        nameKey="cat"
                        hideLabel
                        formatter={(valor, _nome, item) => (
                          <span className="flex w-full items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="size-2 rounded-full"
                                style={{ background: item.payload.cor }}
                              />
                              {item.payload.rotulo}
                            </span>
                            <span className="font-semibold tabular-nums">
                              {moeda(Number(valor))}
                            </span>
                          </span>
                        )}
                      />
                    }
                  />
                  <Pie
                    data={despesasPorCategoria}
                    dataKey="valor"
                    nameKey="cat"
                    innerRadius="62%"
                    outerRadius="95%"
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {despesasPorCategoria.map((d) => (
                      <Cell key={d.cat} fill={d.cor} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Total pago</span>
                <span className="font-display text-lg font-extrabold tabular-nums">
                  {moeda(despesasUnificado)}
                </span>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {selecionados.size > 0 ? (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-accent/40 px-4 py-2.5 text-sm">
          <span>{selecionados.size} selecionado(s)</span>
          <Button
            type="button"
            size="sm"
            disabled={marcarRecebido.isPending}
            onClick={() => marcarRecebido.mutate(Array.from(selecionados))}
          >
            <CircleCheck className="size-4" aria-hidden="true" />
            Marcar como recebido
          </Button>
        </div>
      ) : null}

      <Dialog
        open={formAberto}
        onOpenChange={(v) => {
          setFormAberto(v);
          if (!v) limparForm();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>Novo lançamento</DialogTitle>
            <DialogDescription>
              Registre uma despesa ou receita da fazenda — à vista ou parcelada.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate();
            }}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[140px] flex-1 space-y-1.5">
                <Label htmlFor="tipo-lanc">Tipo</Label>
                <select
                  id="tipo-lanc"
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value as "despesa" | "receita");
                    setCategoria("");
                    setLoteLanc("");
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>
              </div>
              <div className="min-w-[220px] flex-[2] space-y-1.5">
                <Label htmlFor="descricao">Descrição</Label>
                <Input
                  id="descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Compra de ração"
                  required
                />
              </div>
              <div className="min-w-[140px] flex-1 space-y-1.5">
                <Label htmlFor="valor">{parcelado ? "Valor total (R$)" : "Valor (R$)"}</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  required
                />
              </div>
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <Label htmlFor="data-lanc">Data</Label>
                <Input
                  id="data-lanc"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-start gap-3">
              <div className="min-w-[200px] flex-1 space-y-1.5">
                <Label htmlFor="categoria-lanc">Categoria</Label>
                <select
                  id="categoria-lanc"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sem categoria</option>
                  {(tipo === "despesa" ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA).map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              {tipo === "despesa" && !vaiVirarConta && (lotesExistentes.data?.length ?? 0) > 0 ? (
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label htmlFor="lote-lanc">Lote (opcional)</Label>
                  <select
                    id="lote-lanc"
                    value={loteLanc}
                    onChange={(e) => setLoteLanc(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Nenhum lote</option>
                    {lotesExistentes.data?.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Entra no custo desse lote no Confinamento.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-start gap-3">
              {!parcelado ? (
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label>Situação</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={jaAconteceu ? "default" : "outline"}
                      onClick={() => setJaAconteceu(true)}
                    >
                      {tipo === "receita" ? "Recebido" : "Pago"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={jaAconteceu ? "outline" : "default"}
                      onClick={() => setJaAconteceu(false)}
                    >
                      {tipo === "receita" ? "A receber" : "A pagar"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <Label htmlFor="forma-pagamento">Forma de pagamento</Label>
                <select
                  id="forma-pagamento"
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(FORMAS_PAGAMENTO).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[200px] flex-1 space-y-1.5">
                <Label htmlFor="pessoa-lanc">
                  {tipo === "receita" ? "Comprador (opcional)" : "Fornecedor (opcional)"}
                </Label>
                <Input
                  id="pessoa-lanc"
                  value={pessoa}
                  onChange={(e) => setPessoa(e.target.value)}
                  placeholder={tipo === "receita" ? "Quem comprou" : "Quem vendeu"}
                />
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <Label>Pagamento</Label>
              <div className="mt-1.5 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!parcelado ? "default" : "outline"}
                  onClick={() => setParcelado(false)}
                >
                  À vista
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={parcelado ? "default" : "outline"}
                  onClick={() => setParcelado(true)}
                >
                  Parcelado
                </Button>
              </div>

              {parcelado ? (
                <div className="mt-3 flex flex-wrap items-start gap-3">
                  <div className="min-w-[120px] space-y-1.5">
                    <Label htmlFor="num-parcelas">Número de parcelas</Label>
                    <Input
                      id="num-parcelas"
                      type="number"
                      min="1"
                      step="1"
                      value={numParcelas}
                      onChange={(e) => setNumParcelas(e.target.value)}
                    />
                  </div>
                  <div className="min-w-[160px] flex-1 space-y-1.5">
                    <Label htmlFor="primeiro-venc">Primeiro vencimento</Label>
                    <Input
                      id="primeiro-venc"
                      type="date"
                      value={primeiroVencimento}
                      onChange={(e) => setPrimeiroVencimento(e.target.value)}
                      required
                    />
                  </div>
                  <div className="min-w-[140px] space-y-1.5">
                    <Label htmlFor="intervalo-dias">Intervalo (dias)</Label>
                    <Input
                      id="intervalo-dias"
                      type="number"
                      min="1"
                      step="1"
                      value={intervaloDias}
                      onChange={(e) => setIntervaloDias(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {previewParcelas.length > 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-border p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {previewParcelas.length === 1
                      ? "Vencimento"
                      : `${previewParcelas.length} parcelas geradas`}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {previewParcelas.map((p) => (
                      <li key={p.numero} className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          {p.numero}/{p.totalParcelas} · {dataCurta(p.vencimento)}
                        </span>
                        <span className="font-medium">{moeda(p.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <DialogFooter className="mt-5 flex-row justify-end gap-2 sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-initial"
                onClick={() => setFormAberto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 sm:flex-initial" disabled={salvar.isPending}>
                <Plus className="size-4" aria-hidden="true" />
                Lançar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {linhasFinanceiras.length === 0 ? (
        <EmptyState
          icon={Wallet}
          titulo="Nenhum lançamento"
          descricao="Registre a primeira despesa ou receita pra acompanhar o resultado da fazenda."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <PainelFiltros
            className="border-b border-border p-4"
            titulo={<h2 className="text-base font-semibold">Lançamentos</h2>}
            ativos={
              (filtroTipo !== "todos" ? 1 : 0) +
              (filtroStatus !== "todos" ? 1 : 0) +
              (filtroData ? 1 : 0)
            }
            onLimpar={() => {
              setFiltroTipo("todos");
              setFiltroStatus("todos");
              setFiltroData("");
            }}
          >
            <CampoFiltro rotulo="Tipo">
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
                className={CLASSE_SELECT_FILTRO}
              >
                <option value="todos">Todos</option>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </CampoFiltro>
            <CampoFiltro rotulo="Status">
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
                className={CLASSE_SELECT_FILTRO}
              >
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="parcial">Parcial</option>
                <option value="pago">Pago</option>
                <option value="atrasado">Atrasado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </CampoFiltro>
            <CampoFiltro rotulo="Data">
              <Input
                type="date"
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
              />
            </CampoFiltro>
          </PainelFiltros>

          {linhasFiltradas.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum lançamento encontrado com esse filtro.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {linhasFiltradas.map((linha) =>
                linha.kind === "lancamento" ? (
                  <li
                    key={`l-${linha.lancamento.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {linha.lancamento.status === "a_receber" ? (
                        <input
                          type="checkbox"
                          checked={selecionados.has(linha.lancamento.id)}
                          onChange={() => alternarSelecao(linha.lancamento.id)}
                          aria-label={`Selecionar ${linha.lancamento.descricao}`}
                          className="size-4 shrink-0 accent-[var(--primary)]"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{linha.lancamento.descricao}</span>
                          <StatusBadge status={linha.statusUnificado} info={STATUS_INFO_CONTA} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dataCurta(linha.lancamento.data)} ·{" "}
                          {FORMAS_PAGAMENTO[linha.lancamento.forma_pagamento] ??
                            linha.lancamento.forma_pagamento}
                          {linha.lancamento.forma_pagamento === "cartao" &&
                          linha.lancamento.parcelas &&
                          linha.lancamento.parcelas > 1
                            ? ` em ${linha.lancamento.parcelas}x`
                            : ""}
                          {linha.lancamento.categoria
                            ? ` · ${rotuloCategoriaFinanceira(linha.lancamento.categoria)}`
                            : ""}
                          {linha.lancamento.lote ? ` · ${textoLote(linha.lancamento.lote)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "font-semibold",
                          linha.lancamento.tipo === "receita" ? "text-success" : "text-destructive",
                        )}
                      >
                        {linha.lancamento.tipo === "receita" ? "+" : "−"}{" "}
                        {moeda(Number(linha.lancamento.valor))}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLancamentoDetalhe(linha.lancamento.id)}
                      >
                        Ver detalhes
                      </Button>
                    </div>
                  </li>
                ) : (
                  <li
                    key={`c-${linha.conta.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{linha.conta.descricao}</span>
                        <StatusBadge status={linha.conta.statusExibido} info={STATUS_INFO_CONTA} />
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {TIPO_LABEL[linha.conta.tipo]} · {linha.conta.parcelas.length}x
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {linha.conta.pessoa ? `${linha.conta.pessoa} · ` : ""}
                        {dataCurta(linha.conta.data_emissao)}
                        {linha.conta.proximaPendente
                          ? ` · próximo venc. ${dataCurta(linha.conta.proximaPendente.vencimento)}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "font-semibold",
                          linha.conta.tipo === "a_receber" ? "text-success" : "text-destructive",
                        )}
                      >
                        {moeda(Number(linha.conta.valor_total))}
                      </p>
                      {Number(linha.conta.valor_restante) !== Number(linha.conta.valor_total) &&
                      linha.conta.statusExibido !== "cancelado" &&
                      linha.conta.statusExibido !== "pago" ? (
                        <p className="text-xs text-muted-foreground">
                          restam {moeda(Number(linha.conta.valor_restante))}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setContaDetalhe(linha.conta.id)}
                    >
                      Ver detalhes
                    </Button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}

      {/* ----- Dialog: detalhe do lançamento simples ----- */}
      <Dialog open={!!lancamentoSelecionado} onOpenChange={(v) => !v && setLancamentoDetalhe(null)}>
        <DialogContent>
          {lancamentoSelecionado ? (
            <>
              <DialogHeader>
                <DialogTitle>{lancamentoSelecionado.descricao}</DialogTitle>
                <DialogDescription>
                  {lancamentoSelecionado.tipo === "receita" ? "Receita" : "Despesa"} ·{" "}
                  {dataCurta(lancamentoSelecionado.data)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={statusUnificadoLancamento(lancamentoSelecionado, hoje)}
                  info={STATUS_INFO_CONTA}
                />
                <span
                  className={cn(
                    "text-sm font-semibold",
                    lancamentoSelecionado.tipo === "receita" ? "text-success" : "text-destructive",
                  )}
                >
                  {moeda(Number(lancamentoSelecionado.valor))}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Forma de pagamento:{" "}
                {FORMAS_PAGAMENTO[lancamentoSelecionado.forma_pagamento] ??
                  lancamentoSelecionado.forma_pagamento}
                {lancamentoSelecionado.forma_pagamento === "cartao" &&
                lancamentoSelecionado.parcelas &&
                lancamentoSelecionado.parcelas > 1
                  ? ` em ${lancamentoSelecionado.parcelas}x`
                  : ""}
              </p>

              {lancamentoSelecionado.status === "a_receber" ? (
                <DialogFooter className="mt-3">
                  <Button
                    type="button"
                    disabled={marcarRecebido.isPending}
                    onClick={() => marcarRecebido.mutate([lancamentoSelecionado.id])}
                  >
                    <CircleCheck className="size-4" aria-hidden="true" />
                    Marcar como recebido
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ----- Dialog: detalhe da conta ----- */}
      <Dialog open={!!contaSelecionada} onOpenChange={(v) => !v && setContaDetalhe(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          {contaSelecionada ? (
            <>
              <DialogHeader>
                <DialogTitle>{contaSelecionada.descricao}</DialogTitle>
                <DialogDescription>
                  {TIPO_LABEL[contaSelecionada.tipo]}
                  {contaSelecionada.pessoa ? ` · ${contaSelecionada.pessoa}` : ""} ·{" "}
                  {dataCurta(contaSelecionada.data_emissao)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={contaSelecionada.statusExibido} info={STATUS_INFO_CONTA} />
                <span className="text-sm font-semibold">
                  {moeda(Number(contaSelecionada.valor_total))}
                </span>
                {Number(contaSelecionada.valor_restante) !== Number(contaSelecionada.valor_total) &&
                contaSelecionada.statusExibido !== "cancelado" &&
                contaSelecionada.statusExibido !== "pago" ? (
                  <span className="text-sm text-muted-foreground">
                    restam {moeda(Number(contaSelecionada.valor_restante))}
                  </span>
                ) : null}
              </div>
              {contaSelecionada.observacoes ? (
                <p className="text-sm text-muted-foreground">{contaSelecionada.observacoes}</p>
              ) : null}

              <ul className="mt-2 space-y-2">
                {contaSelecionada.parcelas.map((p) => {
                  const statusP = statusExibicaoParcela(p);
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          Parcela {p.numero}/{p.total_parcelas} · {moeda(Number(p.valor))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {statusP === "pago" ? (
                            <>
                              Pago em {dataCurta(p.pago_em)}
                              {p.forma_pagamento
                                ? ` · ${FORMAS_PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento}`
                                : ""}
                            </>
                          ) : (
                            <>Vence em {dataCurta(p.vencimento)}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={statusP} info={STATUS_INFO_PARCELA} />
                        {statusP === "pendente" || statusP === "atrasado" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setPagandoParcela(p);
                              setPagoEm(hoje);
                              setFormaPagamentoBaixa(
                                contaSelecionada.forma_pagamento || "dinheiro",
                              );
                            }}
                          >
                            <CircleCheck className="size-4" aria-hidden="true" />
                            Marcar como{" "}
                            {contaSelecionada.tipo === "a_receber" ? "recebido" : "pago"}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {contaSelecionada.statusExibido !== "cancelado" &&
              contaSelecionada.statusExibido !== "pago" ? (
                <DialogFooter className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelando(contaSelecionada.id)}
                  >
                    <Ban className="size-4" aria-hidden="true" />
                    Cancelar conta
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ----- Dialog: baixa de parcela ----- */}
      <Dialog open={!!pagandoParcela} onOpenChange={(v) => !v && setPagandoParcela(null)}>
        <DialogContent>
          {pagandoParcela ? (
            <>
              <DialogHeader>
                <DialogTitle>Confirmar pagamento</DialogTitle>
                <DialogDescription>
                  Parcela {pagandoParcela.numero}/{pagandoParcela.total_parcelas} ·{" "}
                  {moeda(Number(pagandoParcela.valor))}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  marcarPagaMutation.mutate();
                }}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[160px] flex-1 space-y-1.5">
                    <Label htmlFor="pago-em">Data do pagamento</Label>
                    <Input
                      id="pago-em"
                      type="date"
                      value={pagoEm}
                      onChange={(e) => setPagoEm(e.target.value)}
                      required
                    />
                  </div>
                  <div className="min-w-[160px] flex-1 space-y-1.5">
                    <Label htmlFor="forma-baixa">Forma de pagamento</Label>
                    <select
                      id="forma-baixa"
                      value={formaPagamentoBaixa}
                      onChange={(e) => setFormaPagamentoBaixa(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {Object.entries(FORMAS_PAGAMENTO).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <DialogFooter className="mt-5">
                  <Button type="button" variant="outline" onClick={() => setPagandoParcela(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={marcarPagaMutation.isPending}>
                    Confirmar
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ----- Confirmar cancelamento da conta ----- */}
      <AlertDialog open={!!cancelando} onOpenChange={(v) => !v && setCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar conta?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta e as parcelas ainda pendentes serão marcadas como canceladas. Parcelas já
              pagas continuam no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelando && cancelarContaMutation.mutate(cancelando)}
            >
              Cancelar conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Resumo({ rotulo, valor, classe }: { rotulo: string; valor: string; classe: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`font-display text-xl font-extrabold whitespace-nowrap tabular-nums ${classe}`}>
        {valor}
      </p>
    </div>
  );
}
