import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Beef,
  CalendarDays,
  Check,
  Milk,
  Plus,
  Receipt,
  Syringe,
  TrendingDown,
  TrendingUp,
  Weight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, diasAtrasISO, hojeISO, moeda as formatarMoeda } from "@/lib/formato";
import { rotuloCategoria } from "@/lib/rotulos";
import { especieDoAnimal, especiesDasAtividades } from "@/lib/especies";
import { usePreferencias } from "@/hooks/use-preferencias";
import { DialogManejoSanitario, type EventoSanitario } from "@/components/DialogManejoSanitario";
import { useResumoFinanceiro } from "@/hooks/use-resumo-financeiro";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({
    meta: [
      { title: "Início — Curral Online" },
      { name: "description", content: "Resumo do rebanho, alertas e próximos manejos da fazenda." },
      { property: "og:title", content: "Início — Curral Online" },
      { property: "og:description", content: "Resumo do rebanho e próximos manejos." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Inicio,
});

function Inicio() {
  const { data: fazenda } = useFazenda();
  const fazendaId = fazenda?.id;
  const soOvino =
    !!fazenda?.atividades?.includes("ovino") && !fazenda.atividades.includes("bovino");
  const prefs = usePreferencias();
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);
  const queryClient = useQueryClient();
  const [cumprindo, setCumprindo] = useState<EventoSanitario | null>(null);

  const resumo = useQuery({
    queryKey: ["inicio-resumo", fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const hoje = hojeISO();
      const pendentes = () =>
        db
          .from("eventos_agenda")
          .select("id, titulo, data, tipo, concluido, animal_id")
          .eq("fazenda_id", fazendaId!)
          .eq("concluido", false)
          .eq("cancelado", false);
      // Duas consultas separadas: com uma só (limitada), muita coisa
      // atrasada empurrava os próximos compromissos pra fora da lista.
      const [animais, atrasados, proximos, leite] = await Promise.all([
        db.from("animais").select("id, categoria, especie, status").eq("fazenda_id", fazendaId!),
        pendentes().lte("data", diasAtrasISO(1)).order("data").limit(8),
        pendentes().gte("data", hoje).order("data").limit(5),
        db
          .from("producao_leite")
          .select("litros")
          .eq("fazenda_id", fazendaId!)
          .eq("data", hoje)
          .eq("produto", "leite"),
      ]);
      return {
        animais: animais.data ?? [],
        atrasados: atrasados.data ?? [],
        proximos: proximos.data ?? [],
        leiteHoje: (leite.data ?? []).reduce((s, l) => s + Number(l.litros), 0),
      };
    },
  });

  // Mesmos números dos cards "Recebido"/"Despesas" da aba Financeiro — não
  // é só o que foi lançado no mês, é o total realizado (lançamento simples
  // + parte já paga de cada conta), pra bater com o que o produtor vê lá.
  const financeiroResumo = useResumoFinanceiro(fazendaId);

  // Mesmo padrão de "marcar como feito" já usado na Agenda (calendario.tsx)
  // — reaproveitado aqui pra não obrigar o produtor a navegar pra outra
  // tela só pra confirmar uma tarefa do dia a dia.
  const concluirEvento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("eventos_agenda").update({ concluido: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcado como feito.");
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
    },
    onError: () => toast.error("Não conseguimos atualizar agora."),
  });

  // Vacina/tratamento: concluir abre o registro da aplicação já preenchido.
  function concluirOuRegistrar(ev: {
    id: string;
    titulo: string | null;
    tipo: string | null;
    animal_id?: string | null;
  }) {
    if (ev.tipo === "vacina" || ev.tipo === "tratamento") {
      setCumprindo({
        id: ev.id,
        titulo: ev.titulo,
        tipo: ev.tipo,
        animal_id: ev.animal_id ?? null,
      });
      return;
    }
    concluirEvento.mutate(ev.id);
  }

  // Só as espécies marcadas em Configurações entram nos números daqui.
  const especiesPermitidas = especiesDasAtividades(fazenda?.atividades);
  const animais = (resumo.data?.animais ?? []).filter((a) =>
    especiesPermitidas.includes(especieDoAnimal(a)),
  );
  // Vendido/morto não contam no rebanho ativo — mesmo critério de
  // use-fazenda.ts e use-indices-rebanho.ts, só que este resumo ainda não
  // seguia essa regra.
  const animaisAtivos = animais.filter((a) => a.status !== "vendido" && a.status !== "morto");
  const ambasAtividades =
    !!fazenda?.atividades?.includes("ovino") && !!fazenda.atividades.includes("bovino");
  const qtdBovinos = animaisAtivos.filter((a) => especieDoAnimal(a) === "bovino").length;
  const qtdOvinos = animaisAtivos.filter((a) => especieDoAnimal(a) === "ovino").length;
  const porCategoria = animaisAtivos.reduce<Record<string, number>>((acc, a) => {
    acc[a.categoria] = (acc[a.categoria] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell
      titulo={`Olá! Sua fazenda hoje`}
      descricao="Um resumo rápido do que está acontecendo no rebanho."
      acao={
        <Button asChild>
          <Link to="/rebanho">
            <Plus className="size-4" aria-hidden="true" />
            Cadastrar animal
          </Link>
        </Button>
      }
    >
      <DialogManejoSanitario
        aberto={!!cumprindo}
        evento={cumprindo}
        onFechar={() => setCumprindo(null)}
      />
      {animais.length === 0 && !resumo.isLoading ? (
        <EmptyState
          icon={Beef}
          titulo="Cadastre o primeiro animal"
          descricao="Assim que você cadastrar um animal, os números, alertas e o calendário começam a aparecer aqui."
          acao={
            <Button asChild>
              <Link to="/rebanho">Cadastrar animal</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Cartao
              icon={Beef}
              rotulo="Cabeças no rebanho"
              valor={String(animaisAtivos.length)}
              detalhe={ambasAtividades ? `${qtdBovinos} bovinos · ${qtdOvinos} ovinos` : undefined}
            />
            <Link to="/engorda" className="block">
              <Cartao
                icon={Weight}
                rotulo="Em confinamento"
                valor={String(animais.filter((a) => a.status === "engorda").length)}
              />
            </Link>
            {soOvino ? null : (
              <Cartao
                icon={Milk}
                rotulo="Leite hoje"
                valor={`${(resumo.data?.leiteHoje ?? 0).toLocaleString("pt-BR")} L`}
              />
            )}
            <Link to="/financeiro" className="block">
              <Cartao
                icon={TrendingUp}
                rotulo="Recebido"
                valor={moeda(financeiroResumo.data?.recebido)}
                tom="ok"
                detalhe="total já recebido"
              />
            </Link>
            <Link to="/financeiro" className="block">
              <Cartao
                icon={TrendingDown}
                rotulo="Despesas"
                valor={moeda(financeiroResumo.data?.despesas)}
                tom="alerta"
                detalhe="total já pago"
              />
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/financeiro" search={{ novo: true }}>
                <Receipt className="size-4" aria-hidden="true" />
                Novo lançamento
              </Link>
            </Button>
            {soOvino ? null : (
              <Button variant="outline" size="sm" asChild>
                <Link to="/leite">
                  <Milk className="size-4" aria-hidden="true" />
                  Registrar leite
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/pesagem">
                <Weight className="size-4" aria-hidden="true" />
                Registrar pesagem
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/rebanho" search={{ sanidade: true }}>
                <Syringe className="size-4" aria-hidden="true" />
                Vacinas e manejo
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold">Distribuição do rebanho</h2>
              <ul className="mt-4 space-y-3">
                {Object.entries(porCategoria).map(([cat, qtd]) => (
                  <li key={cat}>
                    <div className="flex justify-between text-sm">
                      <span>{rotuloCategoria(cat)}</span>
                      <span className="font-semibold">{qtd}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(qtd / animaisAtivos.length) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Próximos compromissos</h2>
                <Link
                  to="/calendario"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver calendário
                </Link>
              </div>
              {(resumo.data?.atrasados.length ?? 0) === 0 &&
              (resumo.data?.proximos.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nada agendado. Ao registrar uma vacina com próxima dose, ela aparece aqui.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {resumo.data?.atrasados.map((ev) => (
                    <EventoItem
                      key={ev.id}
                      ev={ev}
                      atrasado
                      onConcluir={() => concluirOuRegistrar(ev)}
                      concluindo={concluirEvento.isPending}
                    />
                  ))}
                  {resumo.data?.proximos.map((ev) => (
                    <EventoItem
                      key={ev.id}
                      ev={ev}
                      atrasado={false}
                      onConcluir={() => concluirOuRegistrar(ev)}
                      concluindo={concluirEvento.isPending}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function EventoItem({
  ev,
  atrasado,
  onConcluir,
  concluindo,
}: {
  ev: { id: string; titulo: string | null; data: string | Date; tipo: string | null };
  atrasado: boolean;
  onConcluir: () => void;
  concluindo: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          atrasado
            ? "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive"
            : "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"
        }
      >
        <CalendarDays className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-sm font-medium">{ev.titulo}</span>
          {atrasado ? (
            <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              Atrasado
            </span>
          ) : null}
        </span>
        <span className="block text-xs text-muted-foreground">
          {dataCurta(ev.data)} · {ev.tipo}
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={onConcluir}
        disabled={concluindo}
      >
        <Check className="size-4" aria-hidden="true" />
        Concluir
      </Button>
    </li>
  );
}

function Cartao({
  icon: Icon,
  rotulo,
  valor,
  tom,
  detalhe,
}: {
  icon: LucideIcon;
  rotulo: string;
  valor: string;
  tom?: "ok" | "alerta";
  detalhe?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-3 text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={
          tom === "ok"
            ? "font-display text-2xl font-extrabold text-success"
            : tom === "alerta"
              ? "font-display text-2xl font-extrabold text-destructive"
              : "font-display text-2xl font-extrabold"
        }
      >
        {valor}
      </p>
      {detalhe ? <p className="text-[11px] text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}
