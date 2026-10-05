import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarDays, Check, Pencil, Plus, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { dataCurta, dataISO, hojeISO, paraDataISO } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";
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

  const [filtroMesNum, setFiltroMesNum] = useState(Number(hoje.slice(5, 7)));
  const [filtroAno, setFiltroAno] = useState(Number(hoje.slice(0, 4)));
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusEvento>("todos");

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

  const marcados = useMemo(
    () =>
      (eventos.data ?? [])
        .filter((e) => !e.cancelado)
        .map((e) => new Date(`${dataISO(e.data)}T12:00:00`)),
    [eventos.data],
  );

  const doDia = (eventos.data ?? []).filter(
    (e) => selecionado && dataISO(e.data) === paraDataISO(selecionado),
  );

  const filtroMes = `${filtroAno}-${String(filtroMesNum).padStart(2, "0")}`;

  const eventosDoMes = useMemo(() => {
    return (eventos.data ?? [])
      .filter((e) => dataISO(e.data).slice(0, 7) === filtroMes)
      .filter((e) => filtroStatus === "todos" || statusDoEvento(e, hoje) === filtroStatus)
      .sort((a, b) => dataISO(a.data).localeCompare(dataISO(b.data)));
  }, [eventos.data, filtroMes, filtroStatus, hoje]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>([Number(hoje.slice(0, 4))]);
    for (const e of eventos.data ?? []) {
      anos.add(Number(dataISO(e.data).slice(0, 4)));
    }
    return Array.from(anos).sort((a, b) => a - b);
  }, [eventos.data, hoje]);

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
    onConcluir: (id: string) => concluir.mutate({ id, concluido: true }),
    onDesfazerConcluido: (id: string) => concluir.mutate({ id, concluido: false }),
    onRemarcar: remarcarEvento,
    onPedirCancelamento: (e: EventoRow) => setCancelando(e),
    onReativar: (id: string) => alterarCancelamento.mutate({ id, cancelado: false }),
  };

  return (
    <AppShell
      titulo="Agenda"
      descricao="Adicione vacinas, pesagens e outros compromissos manualmente pra acompanhar a agenda da fazenda."
      acao={
        <Button onClick={novoEvento}>
          <Plus className="size-4" aria-hidden="true" />
          Novo evento
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[25rem_1fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <Calendar
            mode="single"
            weekStartsOn={prefs.inicio_semana === 1 ? 1 : 0}
            selected={selecionado}
            onSelect={setSelecionado}
            modifiers={{ evento: marcados }}
            modifiersClassNames={{
              evento:
                "relative font-semibold text-primary after:absolute after:bottom-1 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-primary data-[selected=true]:after:bg-primary-foreground",
            }}
            className="w-full [--cell-size:2.25rem]"
          />
          <p className="mt-2 px-2 text-center text-xs text-muted-foreground">
            Os dias com bolinha têm compromissos registrados.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">
            {selecionado ? dataCurta(paraDataISO(selecionado)) : "Selecione um dia"}
          </h2>
          {doDia.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              titulo="Nada marcado nesse dia"
              descricao='Use "Novo evento" pra marcar uma vacinação, pesagem ou outro compromisso nesse dia.'
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {doDia.map((e) => (
                <EventoItem key={e.id} evento={e} hoje={hoje} {...acoesEvento} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Eventos do mês</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por status"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            >
              <option value="todos">Todos os status</option>
              <option value="a_fazer">A fazer</option>
              <option value="atrasado">Atrasado</option>
              <option value="feito">Concluído</option>
            </select>
            <select
              aria-label="Filtrar por mês"
              value={filtroMesNum}
              onChange={(e) => setFiltroMesNum(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
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
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            >
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>
        </div>

        {eventosDoMes.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-muted-foreground">
            Nenhum evento encontrado para esse filtro.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {eventosDoMes.map((e) => (
              <EventoItem key={e.id} evento={e} hoje={hoje} mostrarData {...acoesEvento} />
            ))}
          </ul>
        )}
      </section>

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
              {salvarEvento.isPending ? "Salvando..." : editandoId ? "Salvar alterações" : "Salvar evento"}
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
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <span className="min-w-0">
        {mostrarData ? (
          <span className="block text-xs font-semibold text-muted-foreground">
            {dataCurta(evento.data)}
          </span>
        ) : null}
        <span className="block text-sm font-medium">{evento.titulo}</span>
        <span className="block text-xs text-muted-foreground capitalize">
          {evento.tipo}
          {evento.descricao ? ` · ${evento.descricao}` : ""}
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
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
              Marcar como feito
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onRemarcar(evento)}>
              <Pencil className="size-4" aria-hidden="true" />
              Remarcar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onPedirCancelamento(evento)}>
              <Ban className="size-4" aria-hidden="true" />
              Cancelar evento
            </Button>
          </>
        )}
      </span>
    </li>
  );
}
