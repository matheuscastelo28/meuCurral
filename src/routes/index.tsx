import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Baby,
  Beef,
  Check,
  ClipboardList,
  Lock,
  Smartphone,
  Syringe,
  ShieldCheck,
  Weight,
} from "lucide-react";
import { PLANOS } from "@/lib/planos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Easy Agro — controle do rebanho sem planilha" },
      {
        name: "description",
        content:
          "Cadastre animais, acompanhe manejo, vacinação, leite e financeiro da fazenda. Comece grátis com até 10 cabeças.",
      },
      { property: "og:title", content: "Easy Agro — controle do rebanho sem planilha" },
      {
        property: "og:description",
        content:
          "Gestão de rebanho simples e segura: manejo, vacinação, pesagem, leite, reprodução e financeiro no celular.",
      },
    ],
  }),
  component: Landing,
});

const ETAPAS = [
  {
    numero: "01",
    titulo: "Cadastre o rebanho",
    texto: "Cada animal com brinco, categoria, raça, peso e lote — bovino ou ovino.",
  },
  {
    numero: "02",
    titulo: "Registre o dia a dia",
    texto: "Vacina, pesagem, leite ou confinamento, cobertura e parto — do curral, no celular.",
  },
  {
    numero: "03",
    titulo: "Acompanhe o resultado",
    texto: "Agenda avisa o que vence, financeiro mostra o que entrou e o que saiu.",
  },
];

const DIFERENCIAIS = [
  {
    icon: ClipboardList,
    titulo: "Rebanho organizado",
    texto: "Cada animal com identificação, categoria, peso e histórico completo de manejo.",
  },
  {
    icon: Syringe,
    titulo: "Manejo sem esquecimento",
    texto: "Registre vacinação, pesagem e tratamentos e veja tudo no calendário da fazenda.",
  },
  {
    icon: Smartphone,
    titulo: "Feito para usar no curral",
    texto: "Interface grande, rápida e vertical — funciona bem no celular, com uma mão só.",
  },
  {
    icon: ShieldCheck,
    titulo: "Dados isolados por fazenda",
    texto: "Cada fazenda acessa somente os próprios dados, com regras aplicadas no banco.",
  },
];

const ESTATISTICAS = [
  { valor: "10", rotulo: "cabeças grátis pra sempre" },
  { valor: "2", rotulo: "atividades: bovinos e ovinos" },
  { valor: "0", rotulo: "planilhas pra manter" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-card">
            <img src="/logo-icon.png" alt="" className="size-6" />
          </span>
          <span className="font-display text-sm font-extrabold">Easy Agro</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/cadastro">Criar conta</Link>
          </Button>
        </div>
      </header>

      {/* Hero — fundo escuro/verde-campo pra abrir com presença, em vez de
          mais um herói branco com título centralizado. */}
      <section className="hero-campo relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-[28rem] rounded-full bg-primary-foreground/5 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 left-1/3 size-[24rem] rounded-full bg-primary-foreground/5 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pt-10 pb-20 sm:pt-16 sm:pb-28 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary-foreground/70 uppercase">
              Gestão de rebanho
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl leading-[1.03] text-primary-foreground sm:text-6xl">
              Sua fazenda fora da planilha, dentro do bolso.
            </h1>
            <p className="mt-5 max-w-lg text-base text-primary-foreground/80">
              Cadastre o rebanho, acompanhe manejo, vacinação, pesagem, leite ou confinamento e o
              financeiro — tudo num só lugar, feito pra bovinos e pra ovinos.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/cadastro">
                  Criar conta grátis
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                asChild
              >
                <Link to="/auth">Já tenho conta</Link>
              </Button>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-4 border-t border-primary-foreground/15 pt-6 lg:grid-cols-1 lg:divide-y lg:divide-primary-foreground/15 lg:border-t-0 lg:pt-0">
            {ESTATISTICAS.map((e) => (
              <div key={e.rotulo} className="lg:py-4 lg:first:pt-0">
                <dt className="font-display text-3xl font-extrabold text-primary-foreground sm:text-4xl">
                  {e.valor}
                </dt>
                <dd className="mt-1 text-xs text-primary-foreground/70 sm:text-sm">{e.rotulo}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Como funciona — passos numerados em vez de outra grade de cards
          genérica, pra deixar o fluxo real do produto mais concreto. */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          Como funciona
        </p>
        <h2 className="mt-3 max-w-xl text-2xl sm:text-3xl">Três passos, do curral até o papel.</h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {ETAPAS.map((etapa, i) => (
            <div
              key={etapa.numero}
              className={cn(
                "relative pl-0 sm:border-l sm:border-border sm:pl-6",
                i === 0 && "sm:border-l-0 sm:pl-0",
              )}
            >
              <span className="font-display text-4xl font-extrabold text-border sm:text-5xl">
                {etapa.numero}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{etapa.titulo}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{etapa.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-2xl sm:text-3xl">Simples de usar, sério no que importa</h2>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Beef className="size-4 text-primary" aria-hidden="true" />
              Bovinos
              <span className="text-border">·</span>
              <Weight className="size-4 text-primary" aria-hidden="true" />
              Ovinos
            </span>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {DIFERENCIAIS.map((item) => (
              <article
                key={item.titulo}
                className="rounded-xl border border-border bg-background p-5"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{item.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl">Planos claros, sem pegadinha</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O plano grátis não expira. Nos planos pagos você cancela quando quiser, sem multa.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANOS.map((plano) => {
            const destaque = plano.id === "essencial";
            return (
              <article
                key={plano.id}
                className={cn(
                  "relative rounded-xl border p-5",
                  destaque ? "border-primary bg-accent shadow-sm" : "border-border bg-card",
                )}
              >
                {destaque ? (
                  <span className="absolute -top-3 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    Mais escolhido
                  </span>
                ) : null}
                <h3 className="text-base font-semibold">{plano.nome}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{plano.resumo}</p>
                <p className="mt-4 font-display text-3xl font-extrabold">{plano.preco}</p>
                <p className="text-xs text-muted-foreground">{plano.periodo}</p>
                <ul className="mt-4 space-y-2">
                  {plano.beneficios.map((b) => (
                    <li key={b} className="flex gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      {b}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {/* Fecho escuro de novo, pra não terminar a página num branco plano
          depois dos planos — mesmo tom do topo, texto curto e direto. */}
      <section className="hero-campo relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-1/4 size-80 rounded-full bg-primary-foreground/5 blur-3xl"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-5 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:py-16">
          <div className="flex items-center gap-3 text-primary-foreground">
            <Baby className="size-6 shrink-0" aria-hidden="true" />
            <p className="max-w-md text-lg font-semibold">
              Comece com até 10 cabeças, de graça, sem cartão.
            </p>
          </div>
          <Button size="lg" variant="secondary" asChild>
            <Link to="/cadastro">
              Criar conta grátis
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-8 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Lock className="size-4" aria-hidden="true" />
            Conexão segura e dados isolados por fazenda
          </span>
          <Link to="/termos" className="underline underline-offset-4">
            Termos de uso
          </Link>
          <Link to="/privacidade" className="underline underline-offset-4">
            Política de privacidade
          </Link>
          <span className="w-full text-xs">© 2026 Easy Agro</span>
        </div>
      </footer>
    </div>
  );
}
