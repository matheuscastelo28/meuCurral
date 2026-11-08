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
import { cn } from "@/lib/utils";
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

  // Com algo atrasado, os compromissos sobem pro topo da tela: é o que
  // pede ação primeiro.
  const qtdAtrasados = resumo.data?.atrasados.length ?? 0;
  const temAtrasados = qtdAtrasados > 0;
  const compromissos = (
    <section
      className={cn(
        "rounded-xl border bg-card p-5",
        temAtrasados ? "border-destructive/40" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
          Próximos compromissos
          {temAtrasados ? (
            <span className="whitespace-nowrap rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
              {qtdAtrasados} {qtdAtrasados === 1 ? "atrasado" : "atrasados"}
            </span>
          ) : null}
        </h2>
        <Link
          to="/calendario"
          className="whitespace-nowrap text-sm text-primary underline-offset-4 hover:underline"
        >
          Ver calendário
        </Link>
      </div>
      {(resumo.data?.atrasados.length ?? 0) === 0 && (resumo.data?.proximos.length ?? 0) === 0 ? (
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
  );

  const atalhos: {
    rotulo: string;
    icon: LucideIcon;
    to: "/pesagem" | "/rebanho" | "/leite" | "/financeiro";
    search?: { sanidade?: boolean; novo?: boolean };
  }[] = [
    { rotulo: "Pesagem", icon: Weight, to: "/pesagem" },
    { rotulo: "Vacina", icon: Syringe, to: "/rebanho", search: { sanidade: true } },
    ...(soOvino ? [] : [{ rotulo: "Leite", icon: Milk, to: "/leite" as const }]),
    { rotulo: "Lançamento", icon: Receipt, to: "/financeiro", search: { novo: true } },
  ];

  return (
    <AppShell
      titulo={`Olá! Sua fazenda hoje`}
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
          {temAtrasados ? compromissos : null}
          {/* Celular: "Cabeças" ocupa a linha toda e o resto vai 2 por linha,
              sempre com a mesma altura. Desktop: tudo numa linha só. */}
          <div
            className={cn(
              "grid auto-rows-fr grid-cols-2 gap-3",
              soOvino ? "lg:grid-cols-4" : "lg:grid-cols-5",
            )}
          >
            <Cartao
              className={soOvino ? undefined : "col-span-2 lg:col-span-1"}
              icon={Beef}
              rotulo="Cabeças no rebanho"
              valor={String(animaisAtivos.length)}
              detalhe={ambasAtividades ? `${qtdBovinos} bovinos · ${qtdOvinos} ovinos` : undefined}
            />
            <Link to="/engorda" className="block h-full">
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
            <Link to="/financeiro" className="block h-full">
              <Cartao
                icon={TrendingUp}
                rotulo="Recebido"
                valor={moeda(financeiroResumo.data?.recebido)}
                tom="ok"
                detalhe="total já recebido"
              />
            </Link>
            <Link to="/financeiro" className="block h-full">
              <Cartao
                icon={TrendingDown}
                rotulo="Despesas"
                valor={moeda(financeiroResumo.data?.despesas)}
                tom="alerta"
                detalhe="total já pago"
              />
            </Link>
          </div>

          {/* Atalhos do dia a dia: botões grandes, fáceis de acertar com o
              celular numa mão. Relatório fica no Financeiro/menu, não é rotina. */}
          <nav
            aria-label="Atalhos"
            className={cn("grid grid-cols-2 gap-3", soOvino ? "sm:grid-cols-3" : "sm:grid-cols-4")}
          >
            {atalhos.map((a) => (
              <Link
                key={a.rotulo}
                to={a.to}
                search={a.search ?? {}}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-center transicao-suave hover:border-primary/40 hover:bg-accent"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-accent text-primary">
                  <a.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold">{a.rotulo}</span>
              </Link>
            ))}
          </nav>

          <div className={cn("grid gap-4", !temAtrasados && "lg:grid-cols-2")}>
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

            {temAtrasados ? null : compromissos}
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
        <span className="line-clamp-2 text-sm leading-snug font-medium break-words">
          {ev.titulo}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {atrasado ? (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              Atrasado
            </span>
          ) : null}
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
  className,
}: {
  icon: LucideIcon;
  rotulo: string;
  valor: string;
  tom?: "ok" | "alerta";
  detalhe?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-3 sm:p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 text-xs leading-tight text-muted-foreground">{rotulo}</p>
      </div>
      <p
        className={cn(
          "mt-2 font-display text-lg leading-tight font-extrabold tabular-nums break-words sm:text-2xl",
          tom === "ok" && "text-success",
          tom === "alerta" && "text-destructive",
        )}
      >
        {valor}
      </p>
      {detalhe ? (
        <p className="mt-auto pt-1 text-[11px] leading-tight text-muted-foreground">{detalhe}</p>
      ) : null}
    </div>
  );
}
