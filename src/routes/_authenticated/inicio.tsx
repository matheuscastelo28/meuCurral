import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Beef, CalendarDays, Milk, Plus, TrendingDown, TrendingUp, Weight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, hojeISO, moeda as formatarMoeda } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";

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
  const prefs = usePreferencias();
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);

  const resumo = useQuery({
    queryKey: ["inicio-resumo", fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const hoje = hojeISO();
      const [animais, eventos, leite, lancamentos] = await Promise.all([
        db.from("animais").select("id, categoria, status").eq("fazenda_id", fazendaId!),
        db
          .from("eventos_agenda")
          .select("id, titulo, data, tipo, concluido")
          .eq("fazenda_id", fazendaId!)
          .eq("concluido", false)
          .gte("data", hoje)
          .order("data")
          .limit(5),
        db
          .from("producao_leite")
          .select("litros")
          .eq("fazenda_id", fazendaId!)
          .eq("data", hoje),
        db
          .from("financeiro_lancamentos")
          .select("tipo, valor, data")
          .eq("fazenda_id", fazendaId!)
          .gte("data", hoje.slice(0, 8) + "01"),
      ]);
      const receitas = (lancamentos.data ?? [])
        .filter((l) => l.tipo === "receita")
        .reduce((s, l) => s + Number(l.valor), 0);
      const despesas = (lancamentos.data ?? [])
        .filter((l) => l.tipo === "despesa")
        .reduce((s, l) => s + Number(l.valor), 0);
      return {
        animais: animais.data ?? [],
        eventos: eventos.data ?? [],
        leiteHoje: (leite.data ?? []).reduce((s, l) => s + Number(l.litros), 0),
        receitas,
        despesas,
      };
    },
  });

  const animais = resumo.data?.animais ?? [];
  // Vendido/morto não contam no rebanho ativo — mesmo critério de
  // use-fazenda.ts e use-indices-rebanho.ts, só que este resumo ainda não
  // seguia essa regra.
  const animaisAtivos = animais.filter((a) => a.status !== "vendido" && a.status !== "morto");
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
            <Cartao icon={Beef} rotulo="Cabeças no rebanho" valor={String(animaisAtivos.length)} />
            <Link to="/engorda" className="block">
              <Cartao
                icon={Weight}
                rotulo="Animais em engorda"
                valor={String(animais.filter((a) => a.status === "engorda").length)}
              />
            </Link>
            <Cartao
              icon={Milk}
              rotulo="Leite hoje"
              valor={`${(resumo.data?.leiteHoje ?? 0).toLocaleString("pt-BR")} L`}
            />
            <Cartao
              icon={TrendingUp}
              rotulo="Receitas do mês"
              valor={moeda(resumo.data?.receitas)}
              tom="ok"
            />
            <Cartao
              icon={TrendingDown}
              rotulo="Despesas do mês"
              valor={moeda(resumo.data?.despesas)}
              tom="alerta"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold">Distribuição do rebanho</h2>
              <ul className="mt-4 space-y-3">
                {Object.entries(porCategoria).map(([cat, qtd]) => (
                  <li key={cat}>
                    <div className="flex justify-between text-sm">
                      <span className="capitalize">{cat}</span>
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
              {(resumo.data?.eventos.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nada agendado por enquanto. Registre uma vacinação ou pesagem e ela aparece aqui.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {resumo.data?.eventos.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                        <CalendarDays className="size-4" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{ev.titulo}</span>
                        <span className="block text-xs text-muted-foreground">
                          {dataCurta(ev.data)} · {ev.tipo}
                        </span>
                      </span>
                    </li>
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

function Cartao({
  icon: Icon,
  rotulo,
  valor,
  tom,
}: {
  icon: LucideIcon;
  rotulo: string;
  valor: string;
  tom?: "ok" | "alerta";
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
    </div>
  );
}
