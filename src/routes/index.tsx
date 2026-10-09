import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Lock,
  Smartphone,
  Syringe,
  ShieldCheck,
} from "lucide-react";
import { PLANOS } from "@/lib/planos";
import { Button } from "@/components/ui/button";

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
        <Button variant="outline" size="sm" asChild>
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-10 pb-16 sm:pt-16 sm:pb-24">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          Gestão de rebanho
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-[1.05] sm:text-6xl">
          O controle do seu rebanho fora da planilha, dentro do bolso.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground">
          Cadastre animais, acompanhe manejo, vacinação, pesagem, leite e financeiro. Comece grátis
          com até 10 cabeças e cresça quando o rebanho crescer.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link to="/cadastro">
              Criar conta grátis
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/auth">Já tenho conta</Link>
          </Button>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl sm:text-3xl">Simples de usar, sério no que importa</h2>
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

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl sm:text-3xl">Planos claros, sem pegadinha</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O plano grátis não expira. Nos planos pagos você cancela quando quiser, sem multa.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANOS.map((plano) => (
            <article key={plano.id} className="rounded-xl border border-border bg-card p-5">
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
          ))}
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
