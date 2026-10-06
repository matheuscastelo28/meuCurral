import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarDays,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  Receipt,
} from "lucide-react";
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
import { dataCurta, dataISO, hojeISO } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";
import {
  gerarParcelas,
  statusExibicaoConta,
  statusExibicaoParcela,
  type StatusConta,
  type StatusParcela,
} from "@/lib/parcelamento";
import { cn } from "@/lib/utils";
import { moeda as formatarMoeda } from "@/lib/formato";

export const Route = createFileRoute("/_authenticated/financeiro_/contas")({
  head: () => ({
    meta: [
      { title: "Contas — Curral Online" },
      {
        name: "description",
        content: "O que a fazenda tem a receber e o que precisa pagar, com parcelas e vencimentos.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Contas,
});

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

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
}

function Contas() {
  const prefs = usePreferencias();
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const hoje = hojeISO();

  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "a_receber" | "a_pagar">("todos");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusConta>("todos");

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

  const parcelas = useQuery({
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
    for (const p of parcelas.data ?? []) {
      const lista = mapa.get(p.conta_id) ?? [];
      lista.push(p);
      mapa.set(p.conta_id, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.numero - b.numero);
    return mapa;
  }, [parcelas.data]);

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

  const contasFiltradas = contasComDados.filter(
    (c) =>
      (filtroTipo === "todos" || c.tipo === filtroTipo) &&
      (filtroStatus === "todos" || c.statusExibido === filtroStatus),
  );

  const mesAtual = hoje.slice(0, 7);
  const aReceber = contasComDados
    .filter(
      (c) =>
        c.tipo === "a_receber" && c.statusExibido !== "cancelado" && c.statusExibido !== "pago",
    )
    .reduce((s, c) => s + Number(c.valor_restante), 0);
  const aPagar = contasComDados
    .filter(
      (c) => c.tipo === "a_pagar" && c.statusExibido !== "cancelado" && c.statusExibido !== "pago",
    )
    .reduce((s, c) => s + Number(c.valor_restante), 0);
  const vencendoEsteMes = (parcelas.data ?? [])
    .filter((p) => p.status === "pendente" && dataISO(p.vencimento).slice(0, 7) === mesAtual)
    .reduce((s, p) => s + Number(p.valor), 0);
  const emAtraso = (parcelas.data ?? [])
    .filter((p) => statusExibicaoParcela(p) === "atrasado")
    .reduce((s, p) => s + Number(p.valor), 0);

  // ----- Nova conta -----
  const [abertoNovo, setAbertoNovo] = useState(false);
  const [tipo, setTipo] = useState<"a_receber" | "a_pagar">("a_receber");
  const [descricao, setDescricao] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [dataEmissao, setDataEmissao] = useState(hoje);
  const [categoria, setCategoria] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [animalId, setAnimalId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [pagamento, setPagamento] = useState<"avista" | "parcelado">("avista");
  const [numParcelas, setNumParcelas] = useState("2");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hoje);
  const [intervaloDias, setIntervaloDias] = useState("30");

  function limparFormNovo() {
    setTipo("a_receber");
    setDescricao("");
    setValorTotal("");
    setDataEmissao(hoje);
    setCategoria("");
    setPessoa("");
    setAnimalId("");
    setFormaPagamento("");
    setObservacoes("");
    setPagamento("avista");
    setNumParcelas("2");
    setPrimeiroVencimento(hoje);
    setIntervaloDias("30");
  }

  const previewParcelas = useMemo(() => {
    const valor = Number(valorTotal);
    if (!Number.isFinite(valor) || valor <= 0) return [];
    const n = pagamento === "avista" ? 1 : Math.max(1, Math.floor(Number(numParcelas) || 1));
    const primeiraData = pagamento === "avista" ? dataEmissao : primeiroVencimento;
    if (!primeiraData) return [];
    const intervalo =
      pagamento === "avista" ? 0 : Math.max(1, Math.floor(Number(intervaloDias) || 30));
    return gerarParcelas(valor, n, primeiraData, intervalo);
  }, [valorTotal, pagamento, numParcelas, dataEmissao, primeiroVencimento, intervaloDias]);

  const criarContaMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.financeiro.criarConta({
        fazendaId: fazenda!.id,
        tipo,
        descricao: descricao.trim(),
        valorTotal: Number(valorTotal),
        dataEmissao,
        categoria: categoria.trim() || null,
        pessoa: pessoa.trim() || null,
        animalId: animalId || null,
        formaPagamento: formaPagamento || null,
        observacoes: observacoes.trim() || null,
        parcelamento:
          pagamento === "parcelado"
            ? {
                numParcelas: Math.max(1, Math.floor(Number(numParcelas) || 1)),
                primeiroVencimento,
                intervaloDias: Math.max(1, Math.floor(Number(intervaloDias) || 30)),
              }
            : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Conta criada.");
      limparFormNovo();
      setAbertoNovo(false);
      queryClient.invalidateQueries({ queryKey: ["contas"] });
      queryClient.invalidateQueries({ queryKey: ["parcelas"] });
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não conseguimos criar a conta."),
  });

  // ----- Detalhe / pagamento / cancelamento -----
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

  const conta = contasComDados.find((c) => c.id === contaDetalhe) ?? null;

  // ----- Visão calendário -----
  const [calMesNum, setCalMesNum] = useState(Number(hoje.slice(5, 7)));
  const [calAno, setCalAno] = useState(Number(hoje.slice(0, 4)));
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  const parcelasPorDia = useMemo(() => {
    const mapa = new Map<string, { parcela: ParcelaRow; conta: ContaRow }[]>();
    const contasPorId = new Map(contasComDados.map((c) => [c.id, c]));
    for (const p of parcelas.data ?? []) {
      if (p.status !== "pendente") continue;
      const c = contasPorId.get(p.conta_id);
      if (!c) continue;
      const dia = dataISO(p.vencimento);
      const lista = mapa.get(dia) ?? [];
      lista.push({ parcela: p, conta: c });
      mapa.set(dia, lista);
    }
    return mapa;
  }, [parcelas.data, contasComDados]);

  const diasDoMesCal = useMemo(() => {
    const primeiroDiaSemana = new Date(calAno, calMesNum - 1, 1).getDay();
    const totalDias = new Date(calAno, calMesNum, 0).getDate();
    const dias: (string | null)[] = Array.from({ length: primeiroDiaSemana }, () => null);
    for (let d = 1; d <= totalDias; d++) {
      dias.push(`${calAno}-${String(calMesNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return dias;
  }, [calMesNum, calAno]);

  const itensDoDiaSelecionado = diaSelecionado ? (parcelasPorDia.get(diaSelecionado) ?? []) : [];

  return (
    <AppShell
      titulo="Contas"
      descricao="Acompanhe o que a fazenda tem a receber e o que precisa pagar."
      acao={
        <Button onClick={() => setAbertoNovo(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nova conta
        </Button>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Resumo rotulo="A receber" valor={moeda(aReceber)} classe="text-success" />
        <Resumo rotulo="A pagar" valor={moeda(aPagar)} classe="text-destructive" />
        <Resumo rotulo="Vencendo este mês" valor={moeda(vencendoEsteMes)} classe="text-warning" />
        <Resumo rotulo="Em atraso" valor={moeda(emAtraso)} classe="text-destructive" />
      </div>

      {(contas.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Receipt}
          titulo="Nenhuma conta ainda"
          descricao="Crie uma conta a receber ou a pagar — se for parcelada, a gente gera os vencimentos pra você."
          acao={
            <Button onClick={() => setAbertoNovo(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Nova conta
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filtrar por tipo"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="todos">Todas</option>
                <option value="a_receber">A receber</option>
                <option value="a_pagar">A pagar</option>
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
            </div>
            <div className="flex gap-1 rounded-lg border border-border p-1">
              <Button
                type="button"
                size="sm"
                variant={view === "lista" ? "default" : "ghost"}
                onClick={() => setView("lista")}
              >
                <List className="size-4" aria-hidden="true" />
                Lista
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "calendario" ? "default" : "ghost"}
                onClick={() => setView("calendario")}
              >
                <CalendarDays className="size-4" aria-hidden="true" />
                Calendário
              </Button>
            </div>
          </div>

          {view === "lista" ? (
            contasFiltradas.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhuma conta encontrada com esse filtro.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {contasFiltradas.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.descricao}</span>
                        <StatusBadge status={c.statusExibido} info={STATUS_INFO_CONTA} />
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {TIPO_LABEL[c.tipo]} · {c.parcelas.length}x
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.pessoa ? `${c.pessoa} · ` : ""}
                        {dataCurta(c.data_emissao)}
                        {c.proximaPendente
                          ? ` · próximo venc. ${dataCurta(c.proximaPendente.vencimento)}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "font-semibold",
                          c.tipo === "a_receber" ? "text-success" : "text-destructive",
                        )}
                      >
                        {moeda(Number(c.valor_total))}
                      </p>
                      {Number(c.valor_restante) !== Number(c.valor_total) &&
                      c.statusExibido !== "cancelado" &&
                      c.statusExibido !== "pago" ? (
                        <p className="text-xs text-muted-foreground">
                          restam {moeda(Number(c.valor_restante))}
                        </p>
                      ) : null}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setContaDetalhe(c.id)}>
                      Ver detalhes
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Mês anterior"
                  onClick={() => {
                    const anterior = new Date(calAno, calMesNum - 2, 1);
                    setCalMesNum(anterior.getMonth() + 1);
                    setCalAno(anterior.getFullYear());
                    setDiaSelecionado(null);
                  }}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <p className="text-sm font-semibold">
                  {MESES[calMesNum - 1]} de {calAno}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Próximo mês"
                  onClick={() => {
                    const proximo = new Date(calAno, calMesNum, 1);
                    setCalMesNum(proximo.getMonth() + 1);
                    setCalAno(proximo.getFullYear());
                    setDiaSelecionado(null);
                  }}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {diasDoMesCal.map((dia, i) => {
                  if (!dia) return <div key={`vazio-${i}`} />;
                  const itens = parcelasPorDia.get(dia) ?? [];
                  const temAtraso = itens.some(
                    (it) => statusExibicaoParcela(it.parcela) === "atrasado",
                  );
                  const totalDia = itens.reduce((s, it) => s + Number(it.parcela.valor), 0);
                  return (
                    <button
                      key={dia}
                      type="button"
                      onClick={() => setDiaSelecionado(dia)}
                      className={cn(
                        "flex min-h-[3.2rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-border p-1 text-xs transicao-suave hover:bg-accent",
                        dia === hoje ? "border-primary" : null,
                        diaSelecionado === dia ? "bg-accent" : null,
                      )}
                    >
                      <span className="font-medium">{Number(dia.slice(8, 10))}</span>
                      {itens.length > 0 ? (
                        <span className="flex items-center gap-0.5">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              temAtraso
                                ? "bg-destructive"
                                : itens.some((it) => it.conta.tipo === "a_receber")
                                  ? "bg-success"
                                  : "bg-destructive/70",
                            )}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {moeda(totalDia).replace("R$", "")}
                          </span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {diaSelecionado ? (
                <div className="mt-4 rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold">{dataCurta(diaSelecionado)}</p>
                  {itensDoDiaSelecionado.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Nada vencendo nesse dia.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {itensDoDiaSelecionado.map(({ parcela, conta: c }) => (
                        <li
                          key={parcela.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 truncate">
                            {c.descricao}{" "}
                            <span className="text-xs text-muted-foreground">
                              ({parcela.numero}/{parcela.total_parcelas})
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 font-semibold",
                              c.tipo === "a_receber" ? "text-success" : "text-destructive",
                            )}
                          >
                            {moeda(Number(parcela.valor))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ----- Dialog: nova conta ----- */}
      <Dialog
        open={abertoNovo}
        onOpenChange={(v) => {
          setAbertoNovo(v);
          if (!v) limparFormNovo();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova conta</DialogTitle>
            <DialogDescription>
              Registre o que a fazenda tem a receber ou a pagar. Se for parcelado, os vencimentos
              são gerados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              criarContaMutation.mutate();
            }}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <Label>Tipo</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={tipo === "a_receber" ? "default" : "outline"}
                    onClick={() => setTipo("a_receber")}
                  >
                    A receber
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tipo === "a_pagar" ? "default" : "outline"}
                    onClick={() => setTipo("a_pagar")}
                  >
                    A pagar
                  </Button>
                </div>
              </div>
              <div className="min-w-[220px] flex-[2] space-y-1.5">
                <Label htmlFor="conta-descricao">Descrição</Label>
                <Input
                  id="conta-descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Venda de Mimosa"
                  required
                />
              </div>
              <div className="min-w-[140px] flex-1 space-y-1.5">
                <Label htmlFor="conta-valor">Valor total (R$)</Label>
                <Input
                  id="conta-valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                  required
                />
              </div>
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <Label htmlFor="conta-data">Data</Label>
                <Input
                  id="conta-data"
                  type="date"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(e.target.value)}
                  required
                />
              </div>
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <Label htmlFor="conta-categoria">Categoria</Label>
                <Input
                  id="conta-categoria"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  placeholder="Ex: Ração, Venda de boi"
                />
              </div>
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <Label htmlFor="conta-pessoa">Pessoa</Label>
                <Input
                  id="conta-pessoa"
                  value={pessoa}
                  onChange={(e) => setPessoa(e.target.value)}
                  placeholder="Cliente ou fornecedor"
                />
              </div>
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <Label htmlFor="conta-animal">Animal (opcional)</Label>
                <select
                  id="conta-animal"
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
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <Label htmlFor="conta-forma">Forma de pagamento</Label>
                <select
                  id="conta-forma"
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Não especificado</option>
                  {Object.entries(FORMAS_PAGAMENTO).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
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
                  variant={pagamento === "avista" ? "default" : "outline"}
                  onClick={() => setPagamento("avista")}
                >
                  À vista
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pagamento === "parcelado" ? "default" : "outline"}
                  onClick={() => setPagamento("parcelado")}
                >
                  Parcelado
                </Button>
              </div>
            </div>

            {pagamento === "parcelado" ? (
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <div className="min-w-[120px] space-y-1.5">
                  <Label htmlFor="conta-num-parcelas">Número de parcelas</Label>
                  <Input
                    id="conta-num-parcelas"
                    type="number"
                    min="1"
                    step="1"
                    value={numParcelas}
                    onChange={(e) => setNumParcelas(e.target.value)}
                  />
                </div>
                <div className="min-w-[160px] flex-1 space-y-1.5">
                  <Label htmlFor="conta-primeiro-venc">Primeiro vencimento</Label>
                  <Input
                    id="conta-primeiro-venc"
                    type="date"
                    value={primeiroVencimento}
                    onChange={(e) => setPrimeiroVencimento(e.target.value)}
                    required
                  />
                </div>
                <div className="min-w-[140px] space-y-1.5">
                  <Label htmlFor="conta-intervalo">Intervalo (dias)</Label>
                  <Input
                    id="conta-intervalo"
                    type="number"
                    min="1"
                    step="1"
                    value={intervaloDias}
                    onChange={(e) => setIntervaloDias(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-3 space-y-1.5">
              <Label htmlFor="conta-obs">Observações (opcional)</Label>
              <Input
                id="conta-obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>

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

            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setAbertoNovo(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={criarContaMutation.isPending}>
                Criar conta
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ----- Dialog: detalhe da conta ----- */}
      <Dialog open={!!conta} onOpenChange={(v) => !v && setContaDetalhe(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          {conta ? (
            <>
              <DialogHeader>
                <DialogTitle>{conta.descricao}</DialogTitle>
                <DialogDescription>
                  {TIPO_LABEL[conta.tipo]}
                  {conta.pessoa ? ` · ${conta.pessoa}` : ""} · {dataCurta(conta.data_emissao)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={conta.statusExibido} info={STATUS_INFO_CONTA} />
                <span className="text-sm font-semibold">{moeda(Number(conta.valor_total))}</span>
                {Number(conta.valor_restante) !== Number(conta.valor_total) &&
                conta.statusExibido !== "cancelado" &&
                conta.statusExibido !== "pago" ? (
                  <span className="text-sm text-muted-foreground">
                    restam {moeda(Number(conta.valor_restante))}
                  </span>
                ) : null}
              </div>
              {conta.observacoes ? (
                <p className="text-sm text-muted-foreground">{conta.observacoes}</p>
              ) : null}

              <ul className="mt-2 space-y-2">
                {conta.parcelas.map((p) => {
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
                              setFormaPagamentoBaixa(conta.forma_pagamento || "dinheiro");
                            }}
                          >
                            <CircleCheck className="size-4" aria-hidden="true" />
                            Marcar como {conta.tipo === "a_receber" ? "recebido" : "pago"}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {conta.statusExibido !== "cancelado" && conta.statusExibido !== "pago" ? (
                <DialogFooter className="mt-3">
                  <Button type="button" variant="outline" onClick={() => setCancelando(conta.id)}>
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
      <p className={`font-display text-2xl font-extrabold ${classe}`}>{valor}</p>
    </div>
  );
}
