import { Link, useNavigate } from "@tanstack/react-router";
import {
  Beef,
  CalendarDays,
  Home,
  Milk,
  Settings,
  Sprout,
  Stethoscope,
  Wallet,
  Weight,
  LogOut,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { db } from "@/lib/local-db";
import { useLimitePlano } from "@/hooks/use-fazenda";
import { limiteTexto } from "@/lib/planos";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/inicio", label: "Início", icon: Home },
  { to: "/rebanho", label: "Rebanho", icon: Beef },
  { to: "/leite", label: "Leite", icon: Milk },
  { to: "/engorda", label: "Engorda", icon: Weight },
  { to: "/reproducao", label: "Reprodução", icon: Stethoscope },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/config", label: "Config", icon: Settings },
] as const;

export function AppShell({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  const { fazenda, plano, usados, limite } = useLimitePlano();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await db.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const pct = Number.isFinite(limite) ? Math.min(100, Math.round((usados / limite) * 100)) : 0;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/inicio" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sprout className="size-4" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm font-extrabold">Curral Online</span>
              <span className="block text-xs text-muted-foreground">
                {fazenda?.nome ?? "Carregando fazenda..."}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/config"
              className="hidden rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transicao-suave hover:bg-accent sm:block"
            >
              {usados} de {limiteTexto(limite)} cabeças · {plano.nome}
            </Link>
            <Button variant="ghost" size="sm" onClick={sair} aria-label="Sair da conta">
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
        <nav aria-label="Seções" className="mx-auto hidden max-w-6xl gap-1 px-2 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transicao-suave hover:text-foreground"
              activeProps={{ className: "border-primary text-primary" }}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl">{titulo}</h1>
            {descricao ? <p className="mt-1 text-sm text-muted-foreground">{descricao}</p> : null}
          </div>
          {acao}
        </div>
        {Number.isFinite(limite) && pct >= 70 ? (
          <div className="mb-5 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>
                {usados} de {limite} cabeças usadas — plano {plano.nome}
              </span>
              <Link to="/config" className="text-primary underline-offset-2 hover:underline">
                Ver uso
              </Link>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={pct >= 100 ? "h-full bg-destructive" : "h-full bg-primary"}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}
        {children}
      </main>

      <nav
        aria-label="Seções"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-8 border-t border-border bg-card md:hidden"
      >
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted-foreground transicao-suave"
            activeProps={{ className: "text-primary" }}
          >
            <item.icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
