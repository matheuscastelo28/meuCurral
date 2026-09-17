import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Plus } from "lucide-react";
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
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, hojeISO } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";

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

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário — Curral Online" },
      {
        name: "description",
        content: "Vacinação, pesagem, partos e lançamentos marcados automaticamente no calendário.",
      },
      { property: "og:title", content: "Calendário — Curral Online" },
      { property: "og:description", content: "Agenda automática da fazenda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Calendario,
});

function paraISO(d: Date) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function Calendario() {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const [selecionado, setSelecionado] = useState<Date | undefined>(new Date());
  const prefs = usePreferencias();
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipoEvento, setTipoEvento] = useState<string>("manual");
  const [dataEvento, setDataEvento] = useState(hojeISO());
  const [descricaoEvento, setDescricaoEvento] = useState("");

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
      return data;
    },
  });

  const marcados = useMemo(
    () => (eventos.data ?? []).map((e) => new Date(`${e.data}T12:00:00`)),
    [eventos.data],
  );

  const doDia = (eventos.data ?? []).filter((e) => selecionado && e.data === paraISO(selecionado));

  const concluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("eventos_agenda")
        .update({ concluido: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcado como feito.");
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: () => toast.error("Não conseguimos atualizar agora."),
  });

  function novoEvento() {
    setTitulo("");
    setTipoEvento("manual");
    setDataEvento(selecionado ? paraISO(selecionado) : hojeISO());
    setDescricaoEvento("");
    setAberto(true);
  }

  const criarEvento = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("eventos_agenda").insert({
        fazenda_id: fazenda!.id,
        tipo: tipoEvento,
        titulo: titulo.trim(),
        descricao: descricaoEvento.trim() || null,
        data: dataEvento,
        concluido: false,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento adicionado ao calendário.");
      setAberto(false);
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  return (
    <AppShell
      titulo="Calendário"
      descricao="As marcações aparecem sozinhas conforme você registra manejo, reprodução e financeiro — e você também pode adicionar um evento manualmente."
      acao={
        <Button onClick={novoEvento}>
          <Plus className="size-4" aria-hidden="true" />
          Novo evento
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="rounded-xl border border-border bg-card p-3">
          <Calendar
            mode="single"
            weekStartsOn={prefs.inicio_semana === 1 ? 1 : 0}
            selected={selecionado}
            onSelect={setSelecionado}
            modifiers={{ evento: marcados }}
            modifiersClassNames={{
              evento:
                "relative font-semibold text-primary after:absolute after:bottom-1 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-primary",
            }}
            className="pointer-events-auto"
          />
          <p className="mt-2 px-2 text-xs text-muted-foreground">
            Os dias com bolinha têm compromissos registrados.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">
            {selecionado ? dataCurta(paraISO(selecionado)) : "Selecione um dia"}
          </h2>
          {doDia.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              titulo="Nada marcado nesse dia"
              descricao="Registre uma vacinação, pesagem, cobertura ou lançamento e a marcação aparece aqui automaticamente."
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {doDia.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <span>
                    <span className="block text-sm font-medium">{e.titulo}</span>
                    <span className="block text-xs text-muted-foreground capitalize">
                      {e.tipo}
                      {e.descricao ? ` · ${e.descricao}` : ""}
                    </span>
                  </span>
                  {e.concluido ? (
                    <span className="text-xs font-semibold text-success">Feito</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => concluir.mutate(e.id)}>
                      <Check className="size-4" aria-hidden="true" />
                      Feito
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo evento</DialogTitle>
            <DialogDescription>
              Adicione um compromisso manualmente. Os eventos automáticos continuam sendo gerados.
            </DialogDescription>
          </DialogHeader>
          <form
            id="form-evento"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              criarEvento.mutate();
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
            <Button type="submit" form="form-evento" disabled={criarEvento.isPending}>
              {criarEvento.isPending ? "Salvando..." : "Salvar evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
