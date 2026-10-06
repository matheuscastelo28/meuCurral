import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
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
  gerarParcelas,
  statusExibicaoConta,
  statusExibicaoParcela,
  type StatusConta,
  type StatusParcela,
} from "@/lib/parcelamento";
import { cn } from "@/lib/utils";

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
  component: Financeiro,
});

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

// Lançamento simples não guarda um status no mesmo vocabulário de conta —
// aqui ele "empresta" o vocabulário (pendente/pago/atrasado) só pra entrar
// na lista única com o mesmo filtro de status das contas. Despesa lançada
// na mão sempre nasce "pago": quem precisa de controle de "a pagar" agora
// usa o próprio formulário com Situação = "A pagar" (vira conta).
function statusUnificadoLancamento(
  l: { tipo: string; status: string; data: string | Date },
  hoje: string,
): StatusConta {
  if (l.tipo !== "receita") return "pago";
  if (l.status === "recebido") return "pago";
  return dataISO(l.data) < hoje ? "atrasado" : "pendente";
}

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
}

function Financeiro() {
  const prefs = usePreferencias();
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const hoje = hojeISO();

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

  const animais = useQuery({
    queryKey: ["animais-select", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("id, nome, brinco")
        .eq("fazenda_id", fazenda!.id)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string | null; brinco: string | null }[];
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
  // ordenados por data: cada linha se comporta do jeito do seu tipo
  // (lançamento ganha a caixinha de seleção legada pra "marcar como
  // recebido"; conta ganha o badge de parcelas), mas as duas têm "Ver
  // detalhes" e o mesmo badge de status.
  const linhasFinanceiras = useMemo(() => {
    const doLancamentos = (lancamentos.data ?? []).map((l) => ({
      kind: "lancamento" as const,
      dataOrdenacao: dataISO(l.data),
      tipoBucket: (l.tipo === "receita" ? "receita" : "despesa") as "receita" | "despesa",
      statusUnificado: statusUnificadoLancamento(l, hoje),
      lancamento: l,
    }));
    const doContas = contasComDados.map((c) => ({
      kind: "conta" as const,
      dataOrdenacao: dataISO(c.data_emissao),
      tipoBucket: (c.tipo === "a_receber" ? "receita" : "despesa") as "receita" | "despesa",
      statusUnificado: c.statusExibido,
      conta: c,
    }));
    return [...doLancamentos, ...doContas].sort((a, b) =>
      b.dataOrdenacao.localeCompare(a.dataOrdenacao),
    );
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

  const [tipo, setTipo] = useState<"despesa" | "receita">("despesa");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [formaPagamento, setFormaPagamento] = useState("dinheiro");
  const [jaAconteceu, setJaAconteceu] = useState(true);
  const [pessoa, setPessoa] = useState("");
  const [animalId, setAnimalId] = useState("");
  const [parcelado, setParcelado] = useState(false);
  const [numParcelas, setNumParcelas] = useState("2");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hoje);
  const [intervaloDias, setIntervaloDias] = useState("30");

  function limparForm() {
    setDescricao("");
    setValor("");
    setData(hoje);
    setFormaPagamento("dinheiro");
    setJaAconteceu(true);
    setPessoa("");
    setAnimalId("");
    setParcelado(false);
    setNumParcelas("2");
    setPrimeiroVencimento(hoje);
    setIntervaloDias("30");
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
          categoria: null,
          pessoa: pessoa.trim() || null,
          animalId: animalId || null,
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
          ...(tipo === "receita" ? { status: "recebido" } : {}),
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(vaiVirarConta ? "Conta criada." : "Lançamento registrado.");
      limparForm();
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["contas"] });
      queryClient.invalidateQueries({ queryKey: ["parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
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
    <AppShell titulo="Financeiro" descricao="Entradas e saídas da fazenda, sem planilha.">
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Resumo rotulo="Recebido" valor={moeda(recebidoUnificado)} classe="text-success" />
        <Resumo rotulo="A receber" valor={moeda(aReceberUnificado)} classe="text-warning" />
        <Resumo rotulo="Despesas" valor={moeda(despesasUnificado)} classe="text-destructive" />
        <Resumo rotulo="A pagar" valor={moeda(aPagarContas)} classe="text-warning" />
        <Resumo
          rotulo="Saldo realizado"
          valor={moeda(saldoRealizadoUnificado)}
          classe=""
          nota="Recebido menos despesas — dinheiro de verdade"
        />
        <Resumo rotulo="Em atraso" valor={moeda(emAtrasoUnificado)} classe="text-destructive" />
      </div>

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

      <form
        className="mb-5 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <h2 className="text-base font-semibold">Novo lançamento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registre uma despesa ou receita da fazenda — à vista ou parcelada.
        </p>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <div className="min-w-[140px] flex-1 space-y-1.5">
            <Label htmlFor="tipo-lanc">Tipo</Label>
            <select
              id="tipo-lanc"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "despesa" | "receita")}
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
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <Label htmlFor="pessoa-lanc">Pessoa (opcional)</Label>
            <Input
              id="pessoa-lanc"
              value={pessoa}
              onChange={(e) => setPessoa(e.target.value)}
              placeholder="Cliente ou fornecedor"
            />
          </div>
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <Label htmlFor="animal-lanc">Animal (opcional)</Label>
            <select
              id="animal-lanc"
              value={animalId}
              onChange={(e) => setAnimalId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Nenhum</option>
              {(animais.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome ?? "Sem nome"}
                  {a.brinco ? ` (${a.brinco})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label>Pagamento</Label>
          <div className="flex gap-2">
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
          <div className="mt-4 rounded-lg border border-dashed border-border p-3">
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

        <div className="mt-4">
          <Button type="submit" disabled={salvar.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            Lançar
          </Button>
        </div>
      </form>

      {linhasFinanceiras.length === 0 ? (
        <EmptyState
          icon={Wallet}
          titulo="Nenhum lançamento"
          descricao="Registre a primeira despesa ou receita pra acompanhar o resultado da fazenda."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <h2 className="text-base font-semibold">Lançamentos</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filtrar por tipo"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="todos">Todos os tipos</option>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
              <select
                aria-label="Filtrar por status"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="todos">Todos os status</option>
                <option value="pendente">Pendente</option>
                <option value="parcial">Parcial</option>
                <option value="pago">Pago</option>
                <option value="atrasado">Atrasado</option>
                <option value="cancelado">Cancelado</option>
              </select>
              <Input
                type="date"
                aria-label="Filtrar por data"
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
                className="h-9 w-auto"
              />
              {filtroAtivo ? (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroTipo("todos");
                    setFiltroStatus("todos");
                    setFiltroData("");
                  }}
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          </div>

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

function Resumo({
  rotulo,
  valor,
  classe,
  nota,
}: {
  rotulo: string;
  valor: string;
  classe: string;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`font-display text-2xl font-extrabold ${classe}`}>{valor}</p>
      {nota ? <p className="mt-1 text-[11px] text-muted-foreground">{nota}</p> : null}
    </div>
  );
}
