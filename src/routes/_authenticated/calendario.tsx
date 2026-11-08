import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Syringe,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { CampoFiltro, CLASSE_SELECT_FILTRO, PainelFiltros } from "@/components/PainelFiltros";
import { DialogManejoSanitario, type EventoSanitario } from "@/components/DialogManejoSanitario";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { dataCurta, dataISO, hojeISO, moeda as formatarMoeda, paraDataISO } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";
import { statusExibicaoParcela } from "@/lib/parcelamento";
import { cn } from "@/lib/utils";

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

/** Domingo a sábado (ou segunda a domingo) da semana que contém `refISO`. */
function limitesSemana(refISO: string, inicioSemana: 0 | 1): { inicio: string; fim: string } {
  const ref = new Date(`${refISO}T00:00:00Z`);
  const diff = (ref.getUTCDay() - inicioSemana + 7) % 7;
  const inicio = new Date(ref);
  inicio.setUTCDate(inicio.getUTCDate() - diff);
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + 6);
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

function somarDias(dataISOStr: string, dias: number): string {
  const d = new Date(`${dataISOStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Último dia do mês (ano/mês em base 1) no formato ISO. */
function fimDoMes(ano: number, mes: number): string {
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

/** Soma (ou subtrai) meses a um ano/mês em base 1, com virada de ano. */
function somarMes(ano: number, mes: number, delta: number): { ano: number; mes: number } {
  const total = mes - 1 + delta;
  const anoNovo = ano + Math.floor(total / 12);
  const mesNovo = (((total % 12) + 12) % 12) + 1;
  return { ano: anoNovo, mes: mesNovo };
}

const TIPOS_EVENTO = [
  "manual",
  "vacina",
  "pesagem",
  "tratamento",
  "parto",
  "secagem",
  "financeiro",
  "outro",
] as const;

type EventoRow = {
  id: string;
  tipo: string | null;
  titulo: string | null;
  descricao: string | null;
  data: string | Date;
  concluido: boolean | null;
  cancelado: boolean | null;
  animal_id?: string | null;
};

type StatusEvento = "feito" | "atrasado" | "cancelado" | "a_fazer";

function statusDoEvento(e: EventoRow, hoje: string): StatusEvento {
  if (e.cancelado) return "cancelado";
  if (e.concluido) return "feito";
  if (dataISO(e.data) < hoje) return "atrasado";
  return "a_fazer";
}

const STATUS_INFO: Record<StatusEvento, { rotulo: string; classe: string }> = {
  feito: { rotulo: "Concluído", classe: "bg-success/15 text-success" },
  atrasado: { rotulo: "Atrasado", classe: "bg-destructive/15 text-destructive" },
  cancelado: { rotulo: "Cancelado", classe: "bg-muted text-muted-foreground" },
  a_fazer: { rotulo: "A fazer", classe: "bg-warning/15 text-warning" },
};

function StatusBadge({ status }: { status: StatusEvento }) {
  const info = STATUS_INFO[status];
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", info.classe)}>
      {info.rotulo}
    </span>
  );
}

// Vencimentos de Financeiro > Contas aparecem aqui só como leitura (derivados,
// nunca duplicados) — a fonte de verdade continua em Financeiro > Contas.
// Só mostramos parcela ainda pendente (inclusive atrasada); paga/cancelada
// já saiu do radar operacional do dia a dia.
interface ParcelaAgendaRow {
  id: string;
  conta_id: string;
  numero: number;
  total_parcelas: number;
  valor: string | number;
  vencimento: string | Date;
  status: string;
}

interface ContaAgendaRow {
  id: string;
  tipo: "a_receber" | "a_pagar";
  descricao: string;
}

function FinanceiroAgendaItem({
  item,
}: {
  item: { parcela: ParcelaAgendaRow; conta: ContaAgendaRow };
}) {
  const prefs = usePreferencias();
  const { parcela, conta } = item;
  const atrasado = statusExibicaoParcela(parcela) === "atrasado";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Receipt className="size-3.5" aria-hidden="true" />
          Financeiro
        </span>
        <span className="block text-sm font-medium">
          {conta.descricao}
          <span className="font-normal text-muted-foreground">
            {" "}
            · Parcela {parcela.numero}/{parcela.total_parcelas}
          </span>
        </span>
        <span
          className={cn(
            "block text-xs font-semibold",
            conta.tipo === "a_receber" ? "text-success" : "text-destructive",
          )}
        >
          {formatarMoeda(Number(parcela.valor), prefs.moeda)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
            atrasado ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning",
          )}
        >
          {atrasado ? "Atrasado" : "A vencer"}
        </span>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/financeiro" search={{ conta: conta.id }}>
            Ver em Financeiro
          </Link>
        </Button>
      </span>
    </li>
  );
}

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Agenda — Curral Online" },
      {
        name: "description",
        content: "Agenda de vacinação, pesagem, partos e outros compromissos da fazenda.",
      },
      { property: "og:title", content: "Agenda — Curral Online" },
      { property: "og:description", content: "Agenda da fazenda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Calendario,
});

function Calendario() {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const prefs = usePreferencias();
  const hoje = hojeISO();

  const [selecionado, setSelecionado] = useState<Date | undefined>(new Date());

  const [aberto, setAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [tipoEvento, setTipoEvento] = useState<string>("manual");
  const [dataEvento, setDataEvento] = useState(hoje);
  const [descricaoEvento, setDescricaoEvento] = useState("");

  const [cancelando, setCancelando] = useState<EventoRow | null>(null);
  const [sanitarioAberto, setSanitarioAberto] = useState(false);
  // Lembrete de vacina/tratamento sendo concluído: abre o registro da
  // aplicação já preenchido em vez de só riscar o evento.
  const [cumprindo, setCumprindo] = useState<EventoSanitario | null>(null);

  const [filtroMesNum, setFiltroMesNum] = useState(Number(hoje.slice(5, 7)));
  const [filtroAno, setFiltroAno] = useState(Number(hoje.slice(0, 4)));
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusEvento>("todos");
  const [filtroOrigem, setFiltroOrigem] = useState<"todos" | "eventos" | "financeiro">("todos");

  // "Eventos do período": semana, mês (como já era) ou um intervalo de datas
  // escolhido à mão — as três formas convergem pra um único [inicio, fim]
  // usado no filtro abaixo.
  const [filtroPeriodoTipo, setFiltroPeriodoTipo] = useState<"semana" | "mes" | "periodo">("mes");
  const [semanaRef, setSemanaRef] = useState(hoje);
  const [periodoInicio, setPeriodoInicio] = useState(hoje);
  const [periodoFim, setPeriodoFim] = useState(hoje);

  const eventos = useQuery({
    queryKey: ["eventos", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("eventos_agenda")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .order("data");
      if (error) throw error;
      return data as EventoRow[];
    },
  });

  // Mesmas chaves de query usadas em Financeiro > Contas — se o produtor já
  // visitou aquela tela, os dados vêm do cache, sem round-trip extra.
  const parcelasFinanceiras = useQuery({
    queryKey: ["parcelas", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("parcelas")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ParcelaAgendaRow[];
    },
  });

  const contasFinanceiras = useQuery({
    queryKey: ["contas", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("contas")
        .select("id, tipo, descricao")
        .eq("fazenda_id", fazenda!.id);
      if (error) throw error;
      return (data ?? []) as ContaAgendaRow[];
    },
  });

  const financeiroPorDia = useMemo(() => {
    const contasPorId = new Map((contasFinanceiras.data ?? []).map((c) => [c.id, c]));
    const mapa = new Map<string, { parcela: ParcelaAgendaRow; conta: ContaAgendaRow }[]>();
    for (const p of parcelasFinanceiras.data ?? []) {
      if (p.status !== "pendente") continue;
      const conta = contasPorId.get(p.conta_id);
      if (!conta) continue;
      const dia = dataISO(p.vencimento);
      const lista = mapa.get(dia) ?? [];
      lista.push({ parcela: p, conta });
      mapa.set(dia, lista);
    }
    return mapa;
  }, [parcelasFinanceiras.data, contasFinanceiras.data]);

  const marcados = useMemo(
    () =>
      (eventos.data ?? [])
        .filter((e) => !e.cancelado)
        .map((e) => new Date(`${dataISO(e.data)}T12:00:00`)),
    [eventos.data],
  );

  const marcadosFinanceiro = useMemo(
    () => Array.from(financeiroPorDia.keys()).map((dia) => new Date(`${dia}T12:00:00`)),
    [financeiroPorDia],
  );

  const inicioSemanaPref: 0 | 1 = prefs.inicio_semana === 1 ? 1 : 0;

  /** Clicar num dia no calendário vai direto pra semana daquele dia na lista abaixo. */
  function selecionarDiaNoCalendario(data: Date | undefined) {
    setSelecionado(data);
    if (!data) return;
    setFiltroPeriodoTipo("semana");
    setSemanaRef(paraDataISO(data));
  }

  function irParaHoje() {
    setSelecionado(new Date());
    if (filtroPeriodoTipo === "semana") setSemanaRef(hoje);
    else if (filtroPeriodoTipo === "mes") {
      setFiltroMesNum(Number(hoje.slice(5, 7)));
      setFiltroAno(Number(hoje.slice(0, 4)));
    } else {
      setPeriodoInicio(hoje);
      setPeriodoFim(hoje);
    }
  }

  function mudarMes(delta: number) {
    const { ano, mes } = somarMes(filtroAno, filtroMesNum, delta);
    setFiltroAno(ano);
    setFiltroMesNum(mes);
  }

  function aplicarAtalhoPeriodo(inicio: string, fim: string) {
    setPeriodoInicio(inicio);
    setPeriodoFim(fim);
  }

  const periodo = useMemo(() => {
    if (filtroPeriodoTipo === "semana") return limitesSemana(semanaRef, inicioSemanaPref);
    if (filtroPeriodoTipo === "periodo") {
      return periodoInicio <= periodoFim
        ? { inicio: periodoInicio, fim: periodoFim }
        : { inicio: periodoFim, fim: periodoInicio };
    }
    return {
      inicio: `${filtroAno}-${String(filtroMesNum).padStart(2, "0")}-01`,
      fim: fimDoMes(filtroAno, filtroMesNum),
    };
  }, [
    filtroPeriodoTipo,
    semanaRef,
    inicioSemanaPref,
    periodoInicio,
    periodoFim,
    filtroAno,
    filtroMesNum,
  ]);

  const eventosDoPeriodo = useMemo(() => {
    if (filtroOrigem === "financeiro") return [];
    return (eventos.data ?? [])
      .filter((e) => {
        const d = dataISO(e.data);
        return d >= periodo.inicio && d <= periodo.fim;
      })
      .filter((e) => filtroStatus === "todos" || statusDoEvento(e, hoje) === filtroStatus)
      .sort((a, b) => dataISO(a.data).localeCompare(dataISO(b.data)));
  }, [eventos.data, periodo, filtroStatus, filtroOrigem, hoje]);

  const financeiroDoPeriodo = useMemo(() => {
    if (filtroOrigem === "eventos") return [];
    const itens: { parcela: ParcelaAgendaRow; conta: ContaAgendaRow }[] = [];
    for (const [dia, lista] of financeiroPorDia) {
      if (dia < periodo.inicio || dia > periodo.fim) continue;
      for (const item of lista) {
        const statusEquivalente =
          statusExibicaoParcela(item.parcela) === "atrasado" ? "atrasado" : "a_fazer";
        if (filtroStatus !== "todos" && filtroStatus !== statusEquivalente) continue;
        itens.push(item);
      }
    }
    return itens.sort((a, b) =>
      dataISO(a.parcela.vencimento).localeCompare(dataISO(b.parcela.vencimento)),
    );
  }, [financeiroPorDia, periodo, filtroStatus, filtroOrigem]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>([Number(hoje.slice(0, 4))]);
    for (const e of eventos.data ?? []) {
      anos.add(Number(dataISO(e.data).slice(0, 4)));
    }
    return Array.from(anos).sort((a, b) => a - b);
  }, [eventos.data, hoje]);

  const filtroAtivo = filtroOrigem !== "todos" || filtroStatus !== "todos";
  const totalItens = eventosDoPeriodo.length + financeiroDoPeriodo.length;

  function limparFiltros() {
    setFiltroOrigem("todos");
    setFiltroStatus("todos");
  }

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["eventos"] });
    queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
  }

  const concluir = useMutation({
    mutationFn: async ({ id, concluido }: { id: string; concluido: boolean }) => {
      const { error } = await db.from("eventos_agenda").update({ concluido }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_resultado, variaveis) => {
      toast.success(variaveis.concluido ? "Marcado como feito." : "Marcação desfeita.");
      invalidar();
    },
    onError: () => toast.error("Não conseguimos atualizar agora."),
  });

  const alterarCancelamento = useMutation({
    mutationFn: async ({ id, cancelado }: { id: string; cancelado: boolean }) => {
      const { error } = await db.from("eventos_agenda").update({ cancelado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_resultado, variaveis) => {
      toast.success(variaveis.cancelado ? "Evento cancelado." : "Evento reativado.");
      setCancelando(null);
      invalidar();
    },
    onError: () => toast.error("Não conseguimos atualizar agora."),
  });

  function novoEvento() {
    setEditandoId(null);
    setTitulo("");
    setTipoEvento("manual");
    setDataEvento(selecionado ? paraDataISO(selecionado) : hoje);
    setDescricaoEvento("");
    setAberto(true);
  }

  function remarcarEvento(e: EventoRow) {
    setEditandoId(e.id);
    setTitulo(e.titulo ?? "");
    setTipoEvento(e.tipo ?? "manual");
    setDataEvento(dataISO(e.data));
    setDescricaoEvento(e.descricao ?? "");
    setAberto(true);
  }

  const salvarEvento = useMutation({
    mutationFn: async () => {
      const valores = {
        tipo: tipoEvento,
        titulo: titulo.trim(),
        descricao: descricaoEvento.trim() || null,
        data: dataEvento,
      };
      if (editandoId) {
        const { error } = await db.from("eventos_agenda").update(valores).eq("id", editandoId);
        if (error) throw error;
      } else {
        const { error } = await db.from("eventos_agenda").insert({
          fazenda_id: fazenda!.id,
          ...valores,
          concluido: false,
          cancelado: false,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editandoId ? "Evento atualizado." : "Evento adicionado à agenda.");
      setAberto(false);
      invalidar();
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  const acoesEvento = {
    onConcluir: (id: string) => {
      const ev = eventos.data?.find((e) => e.id === id);
      if (ev && (ev.tipo === "vacina" || ev.tipo === "tratamento")) {
        setCumprindo({
          id: ev.id,
          titulo: ev.titulo,
          tipo: ev.tipo,
          animal_id: ev.animal_id ?? null,
        });
        return;
      }
      concluir.mutate({ id, concluido: true });
    },
    onDesfazerConcluido: (id: string) => concluir.mutate({ id, concluido: false }),
    onRemarcar: remarcarEvento,
    onPedirCancelamento: (e: EventoRow) => setCancelando(e),
    onReativar: (id: string) => alterarCancelamento.mutate({ id, cancelado: false }),
  };

  return (
    <AppShell
      titulo="Agenda"
      acao={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSanitarioAberto(true)}>
            <Syringe className="size-4" aria-hidden="true" />
            Vacinas e manejo
          </Button>
          <Button onClick={novoEvento}>
            <Plus className="size-4" aria-hidden="true" />
            Novo evento
          </Button>
        </div>
      }
    >
      <DialogManejoSanitario
        aberto={sanitarioAberto || !!cumprindo}
        modoInicial="planejar"
        evento={cumprindo}
        onFechar={() => {
          setSanitarioAberto(false);
          setCumprindo(null);
        }}
      />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <Calendar
            mode="single"
            weekStartsOn={prefs.inicio_semana === 1 ? 1 : 0}
            selected={selecionado}
            onSelect={selecionarDiaNoCalendario}
            modifiers={{ evento: marcados, financeiro: marcadosFinanceiro }}
            modifiersClassNames={{
              evento:
                "relative font-semibold text-primary after:absolute after:bottom-1 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-primary data-[selected=true]:after:bg-primary-foreground",
              financeiro:
                "relative before:absolute before:top-1 before:right-1 before:size-1.5 before:rounded-full before:bg-warning data-[selected=true]:before:bg-primary-foreground",
            }}
            className="w-full [--cell-size:1.95rem] sm:[--cell-size:2.25rem]"
          />
          <p className="mt-2 px-2 text-center text-xs text-muted-foreground">
            Bolinha embaixo = compromisso. Bolinha laranja no canto = vencimento financeiro. Clique
            num dia pra ver a semana dele na lista ao lado.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-card p-5">
          {/* Alternância do tipo de período — visual de abas/segmented control
              pra deixar claro que é um modo de visualização, não um botão solto. */}
          <div className="inline-flex rounded-lg bg-muted p-1">
            {(
              [
                ["semana", "Semana"],
                ["mes", "Mês"],
                ["periodo", "Período"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltroPeriodoTipo(valor)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filtroPeriodoTipo === valor
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {filtroPeriodoTipo === "semana" ? (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  onClick={() => setSemanaRef((d) => somarDias(d, -7))}
                  aria-label="Semana anterior"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <span className="min-w-[11rem] text-center text-sm font-medium">
                  {dataCurta(periodo.inicio)} – {dataCurta(periodo.fim)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  onClick={() => setSemanaRef((d) => somarDias(d, 7))}
                  aria-label="Próxima semana"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ) : filtroPeriodoTipo === "mes" ? (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  onClick={() => mudarMes(-1)}
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <select
                  aria-label="Filtrar por mês"
                  value={filtroMesNum}
                  onChange={(e) => setFiltroMesNum(Number(e.target.value))}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-sm font-medium"
                >
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar por ano"
                  value={filtroAno}
                  onChange={(e) => setFiltroAno(Number(e.target.value))}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-sm font-medium"
                >
                  {anosDisponiveis.map((ano) => (
                    <option key={ano} value={ano}>
                      {ano}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  onClick={() => mudarMes(1)}
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  type="date"
                  aria-label="De"
                  value={periodoInicio}
                  onChange={(e) => setPeriodoInicio(e.target.value)}
                  className="h-9 w-auto"
                />
                <span className="text-sm text-muted-foreground">até</span>
                <Input
                  type="date"
                  aria-label="Até"
                  value={periodoFim}
                  onChange={(e) => setPeriodoFim(e.target.value)}
                  className="h-9 w-auto"
                />
              </div>
            )}

            <Button type="button" variant="ghost" size="sm" onClick={irParaHoje}>
              Hoje
            </Button>
          </div>

          {filtroPeriodoTipo === "periodo" ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => aplicarAtalhoPeriodo(somarDias(hoje, -6), hoje)}
              >
                Últimos 7 dias
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => aplicarAtalhoPeriodo(hoje, somarDias(hoje, 6))}
              >
                Próximos 7 dias
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  aplicarAtalhoPeriodo(
                    `${hoje.slice(0, 4)}-${hoje.slice(5, 7)}-01`,
                    fimDoMes(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))),
                  )
                }
              >
                Este mês
              </Button>
            </div>
          ) : null}

          <PainelFiltros
            className="mt-4 border-t border-border pt-4"
            ativos={(filtroOrigem !== "todos" ? 1 : 0) + (filtroStatus !== "todos" ? 1 : 0)}
            onLimpar={limparFiltros}
          >
            <CampoFiltro rotulo="Origem">
              <select
                value={filtroOrigem}
                onChange={(e) => setFiltroOrigem(e.target.value as typeof filtroOrigem)}
                className={CLASSE_SELECT_FILTRO}
              >
                <option value="todos">Todas</option>
                <option value="eventos">Só eventos</option>
                <option value="financeiro">Só financeiro</option>
              </select>
            </CampoFiltro>
            <CampoFiltro rotulo="Status">
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
                className={CLASSE_SELECT_FILTRO}
              >
                <option value="todos">Todos</option>
                <option value="a_fazer">A fazer</option>
                <option value="atrasado">Atrasado</option>
                <option value="feito">Concluído</option>
              </select>
            </CampoFiltro>
          </PainelFiltros>

          <h2 className="mt-4 text-sm font-semibold text-muted-foreground">
            {totalItens} {totalItens === 1 ? "compromisso" : "compromissos"} nesse período
          </h2>

          {totalItens === 0 ? (
            <EmptyState
              icon={CalendarDays}
              titulo="Nada encontrado nesse período"
              descricao='Tente outro período ou status, ou use "Novo evento" pra marcar algo.'
            />
          ) : (
            <ul className="mt-3 space-y-3">
              {eventosDoPeriodo.map((e) => (
                <EventoItem key={e.id} evento={e} hoje={hoje} mostrarData {...acoesEvento} />
              ))}
              {financeiroDoPeriodo.map((item) => (
                <FinanceiroAgendaItem key={item.parcela.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) setEditandoId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoId ? "Remarcar evento" : "Novo evento"}</DialogTitle>
            <DialogDescription>
              {editandoId
                ? "Ajuste a data ou os outros dados desse compromisso."
                : "Adicione um compromisso à agenda da fazenda."}
            </DialogDescription>
          </DialogHeader>
          <form
            id="form-evento"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              salvarEvento.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="titulo-evento">Título</Label>
              <Input
                id="titulo-evento"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Visita do veterinário"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tipo-evento">Tipo</Label>
                <select
                  id="tipo-evento"
                  value={tipoEvento}
                  onChange={(e) => setTipoEvento(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                >
                  {TIPOS_EVENTO.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-evento">Data</Label>
                <Input
                  id="data-evento"
                  type="date"
                  value={dataEvento}
                  onChange={(e) => setDataEvento(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="descricao-evento">Descrição (opcional)</Label>
              <Input
                id="descricao-evento"
                value={descricaoEvento}
                onChange={(e) => setDescricaoEvento(e.target.value)}
              />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} type="button">
              Cancelar
            </Button>
            <Button type="submit" form="form-evento" disabled={salvarEvento.isPending}>
              {salvarEvento.isPending
                ? "Salvando..."
                : editandoId
                  ? "Salvar alterações"
                  : "Salvar evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelando !== null} onOpenChange={(v) => !v && setCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar evento?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelando
                ? `${cancelando.titulo} de ${dataCurta(cancelando.data)}. Você pode reativar depois, se precisar.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={alterarCancelamento.isPending}
              onClick={() =>
                cancelando && alterarCancelamento.mutate({ id: cancelando.id, cancelado: true })
              }
            >
              Cancelar evento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function EventoItem({
  evento,
  hoje,
  mostrarData = false,
  onConcluir,
  onDesfazerConcluido,
  onRemarcar,
  onPedirCancelamento,
  onReativar,
}: {
  evento: EventoRow;
  hoje: string;
  mostrarData?: boolean;
  onConcluir: (id: string) => void;
  onDesfazerConcluido: (id: string) => void;
  onRemarcar: (evento: EventoRow) => void;
  onPedirCancelamento: (evento: EventoRow) => void;
  onReativar: (id: string) => void;
}) {
  const status = statusDoEvento(evento, hoje);

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium break-words">{evento.titulo}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <StatusBadge status={status} />
          {mostrarData ? <span className="font-semibold">{dataCurta(evento.data)}</span> : null}
          <span className="capitalize">{evento.tipo}</span>
          {evento.descricao ? <span className="w-full">{evento.descricao}</span> : null}
        </span>
      </span>

      {/* Só a ação principal à vista; Remarcar e Cancelar ficam no "⋯". */}
      <span className="flex shrink-0 items-center gap-1">
        {status === "feito" ? (
          <Button size="sm" variant="ghost" onClick={() => onDesfazerConcluido(evento.id)}>
            <Undo2 className="size-4" aria-hidden="true" />
            Desfazer
          </Button>
        ) : status === "cancelado" ? (
          <Button size="sm" variant="ghost" onClick={() => onReativar(evento.id)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reativar
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => onConcluir(evento.id)}>
              <Check className="size-4" aria-hidden="true" />
              Feito
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-8 px-0"
                  aria-label={`Mais ações: ${evento.titulo ?? "compromisso"}`}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onRemarcar(evento)}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Remarcar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onPedirCancelamento(evento)}
                >
                  <Ban className="size-4" aria-hidden="true" />
                  Cancelar evento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </span>
    </li>
  );
}
