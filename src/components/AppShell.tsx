import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Beef,
  CalendarDays,
  ChevronDown,
  FileText,
  Home,
  LogOut,
  Milk,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sprout,
  Stethoscope,
  Wallet,
  Weight,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { db } from "@/lib/local-db";
import { useLimitePlano } from "@/hooks/use-fazenda";
import { usoCabecasTexto } from "@/lib/planos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// soDesktop: fica só na barra lateral — a barra de baixo do celular tem
// espaço pra 6 itens; no celular o acesso vem por atalhos nas telas.
type NavLink = { to: string; label: string; icon: LucideIcon; soDesktop?: boolean };
type NavGroup = { label: string; icon: LucideIcon; items: NavLink[] };

/**
 * Fazenda só de ovinos não mexe com leite — some o item. "Engorda" sempre
 * aparece como "Confinamento" (mesma tela/rota de sempre, só o nome muda,
 * vale pra boi ou pra ovino).
 */
function montarNav(atividades: string[] | null | undefined): (NavLink | NavGroup)[] {
  const soOvino = !!atividades && atividades.includes("ovino") && !atividades.includes("bovino");
  const producao: NavLink[] = soOvino
    ? [
        { to: "/engorda", label: "Confinamento", icon: Weight },
        { to: "/reproducao", label: "Reprodução", icon: Stethoscope },
      ]
    : [
        { to: "/leite", label: "Leite", icon: Milk },
        { to: "/engorda", label: "Confinamento", icon: Weight },
        { to: "/reproducao", label: "Reprodução", icon: Stethoscope },
      ];
  return [
    { to: "/inicio", label: "Início", icon: Home },
    { to: "/rebanho", label: "Rebanho", icon: Beef },
    { label: "Produção", icon: Sprout, items: producao },
    { to: "/financeiro", label: "Financeiro", icon: Wallet },
    { to: "/calendario", label: "Agenda", icon: CalendarDays },
    { to: "/relatorios", label: "Relatórios", icon: FileText, soDesktop: true },
    { to: "/config", label: "Config", icon: Settings },
  ];
}

function isGroup(entry: NavLink | NavGroup): entry is NavGroup {
  return "items" in entry;
}

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
  const nav = montarNav(fazenda?.atividades);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();

  const [colapsada, setColapsada] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("curral-sidebar-colapsada") === "1";
  });
  // Um grupo (ex: "Produção", "Financeiro") por vez pode estar aberto em
  // flyout; aberto/fechado quando expandida é controlado por grupo,
  // guardado pelo label do grupo.
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});
  const [flyoutAberto, setFlyoutAberto] = useState<string | null>(null);
  const [flyoutPos, setFlyoutPos] = useState({ top: 0, left: 0 });
  const grupoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const grupoBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Barra inferior (mobile): mesmo princípio do flyout da barra lateral
  // colapsada, mas com seu próprio estado/refs — os dois menus coexistem no
  // DOM (um escondido via CSS conforme o tamanho da tela), então não dá pra
  // dividir a mesma Map de refs entre os dois sem um sobrescrever o outro.
  const [flyoutMobileAberto, setFlyoutMobileAberto] = useState(false);
  const [flyoutMobilePos, setFlyoutMobilePos] = useState({ left: 0 });
  const grupoMobileBtnRef = useRef<HTMLButtonElement>(null);
  const grupoMobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.localStorage.setItem("curral-sidebar-colapsada", colapsada ? "1" : "0");
  }, [colapsada]);

  useEffect(() => {
    setFlyoutAberto(null);
  }, [colapsada]);

  useEffect(() => {
    if (!flyoutAberto) return;
    const grupoAberto: string = flyoutAberto;
    function aoClicarFora(evento: MouseEvent) {
      const container = grupoRefs.current.get(grupoAberto);
      if (!container?.contains(evento.target as Node)) {
        setFlyoutAberto(null);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [flyoutAberto]);

  useEffect(() => {
    if (!flyoutMobileAberto) return;
    function aoClicarFora(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (!grupoMobileRef.current?.contains(alvo) && !grupoMobileBtnRef.current?.contains(alvo)) {
        setFlyoutMobileAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [flyoutMobileAberto]);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await db.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const pct = Number.isFinite(limite) ? Math.min(100, Math.round((usados / limite) * 100)) : 0;

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transicao-suave md:flex",
          colapsada ? "w-[72px]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex gap-2 border-b border-border px-3 py-4",
            colapsada ? "flex-col items-center" : "items-center",
          )}
        >
          <Link
            to="/inicio"
            className={cn("flex min-w-0 items-center gap-2", colapsada ? "" : "flex-1")}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card">
              <img src="/logo-icon.png" alt="" className="size-6" />
            </span>
            {!colapsada ? (
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-display text-sm font-extrabold">
                  Curral Online
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {fazenda?.nome ?? "Carregando fazenda..."}
                </span>
              </span>
            ) : null}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setColapsada((v) => !v)}
            aria-label={colapsada ? "Expandir menu lateral" : "Recolher menu lateral"}
            aria-pressed={colapsada}
          >
            {colapsada ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        <nav aria-label="Seções" className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {nav.map((entry) => {
            if (isGroup(entry)) {
              const grupoAtivo = entry.items.some((item) => location.pathname.startsWith(item.to));
              const aberto = gruposAbertos[entry.label] ?? true;
              const flyoutAbertoAqui = flyoutAberto === entry.label;
              return (
                <div
                  key={entry.label}
                  ref={(el) => {
                    if (el) grupoRefs.current.set(entry.label, el);
                  }}
                  className="relative"
                >
                  <button
                    ref={(el) => {
                      if (el) grupoBtnRefs.current.set(entry.label, el);
                    }}
                    type="button"
                    onClick={() => {
                      if (!colapsada) {
                        setGruposAbertos((prev) => ({ ...prev, [entry.label]: !aberto }));
                        return;
                      }
                      const rect = grupoBtnRefs.current.get(entry.label)?.getBoundingClientRect();
                      if (rect) setFlyoutPos({ top: rect.top, left: rect.right + 8 });
                      setFlyoutAberto((v) => (v === entry.label ? null : entry.label));
                    }}
                    aria-expanded={colapsada ? flyoutAbertoAqui : aberto}
                    aria-haspopup={colapsada ? "true" : undefined}
                    aria-label={colapsada ? entry.label : undefined}
                    title={colapsada ? entry.label : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transicao-suave hover:bg-accent",
                      grupoAtivo ? "text-primary" : "text-muted-foreground hover:text-foreground",
                      colapsada ? "justify-center" : null,
                    )}
                  >
                    <entry.icon className="size-4 shrink-0" aria-hidden="true" />
                    {!colapsada ? (
                      <>
                        <span className="flex-1 truncate text-left">{entry.label}</span>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 transicao-suave",
                            aberto ? "" : "-rotate-90",
                          )}
                          aria-hidden="true"
                        />
                      </>
                    ) : null}
                  </button>
                  {!colapsada && aberto ? (
                    <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                      {entry.items.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          activeOptions={{ exact: true }}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transicao-suave hover:bg-accent hover:text-foreground"
                          activeProps={{ className: "bg-accent text-primary" }}
                        >
                          <item.icon className="size-4 shrink-0" aria-hidden="true" />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {colapsada && flyoutAbertoAqui ? (
                    <div
                      style={{ top: flyoutPos.top, left: flyoutPos.left }}
                      className="fixed z-40 min-w-[180px] rounded-xl border border-border bg-card p-1.5 shadow-md"
                    >
                      <p className="truncate px-2 py-1 text-xs font-semibold text-muted-foreground">
                        {entry.label}
                      </p>
                      {entry.items.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          activeOptions={{ exact: true }}
                          onClick={() => setFlyoutAberto(null)}
                          className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transicao-suave hover:bg-accent hover:text-foreground"
                          activeProps={{ className: "bg-accent text-primary" }}
                        >
                          <item.icon className="size-4 shrink-0" aria-hidden="true" />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }
            return (
              <Link
                key={entry.to}
                to={entry.to}
                aria-label={colapsada ? entry.label : undefined}
                title={colapsada ? entry.label : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transicao-suave hover:bg-accent hover:text-foreground",
                  colapsada ? "justify-center" : null,
                )}
                activeProps={{ className: "bg-accent text-primary" }}
              >
                <entry.icon className="size-4 shrink-0" aria-hidden="true" />
                {!colapsada ? entry.label : null}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-border p-3">
          <Link
            to="/config"
            className="flex items-center justify-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transicao-suave hover:bg-accent"
          >
            {!colapsada ? `${usoCabecasTexto(usados, limite)} · ${plano.nome}` : usados}
          </Link>
          <Button variant="ghost" size="sm" className="w-full justify-center gap-2" onClick={sair}>
            <LogOut className="size-4" aria-hidden="true" />
            {!colapsada ? "Sair" : null}
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Link to="/inicio" className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-card">
                <img src="/logo-icon.png" alt="" className="size-6" />
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
                {usoCabecasTexto(usados, limite)} · {plano.nome}
              </Link>
              <Button variant="ghost" size="sm" onClick={sair} aria-label="Sair da conta">
                <LogOut className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl">{titulo}</h1>
              {descricao ? <p className="mt-1 text-sm text-muted-foreground">{descricao}</p> : null}
            </div>
            {acao ? (
              <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none [&>div]:contents [&>div>*]:flex-1 sm:[&>div>*]:flex-none">
                {acao}
              </div>
            ) : null}
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
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-border bg-card md:hidden"
        >
          {nav
            .filter((entry) => isGroup(entry) || !entry.soDesktop)
            .map((entry) => {
              if (isGroup(entry)) {
                const grupoAtivo = entry.items.some((item) =>
                  location.pathname.startsWith(item.to),
                );
                return (
                  <div key={entry.label} className="relative">
                    <button
                      ref={grupoMobileBtnRef}
                      type="button"
                      onClick={() => {
                        const rect = grupoMobileBtnRef.current?.getBoundingClientRect();
                        if (rect) setFlyoutMobilePos({ left: rect.left + rect.width / 2 });
                        setFlyoutMobileAberto((v) => !v);
                      }}
                      aria-expanded={flyoutMobileAberto}
                      aria-haspopup="true"
                      className={cn(
                        "flex w-full flex-col items-center gap-1 py-2 text-[10px] font-medium transicao-suave",
                        grupoAtivo ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      <entry.icon className="size-5" aria-hidden="true" />
                      {entry.label}
                    </button>
                    {flyoutMobileAberto ? (
                      <div
                        ref={grupoMobileRef}
                        style={{ left: flyoutMobilePos.left }}
                        className="fixed bottom-20 z-40 w-44 -translate-x-1/2 rounded-xl border border-border bg-card p-1.5 shadow-md"
                      >
                        <p className="truncate px-2 py-1 text-xs font-semibold text-muted-foreground">
                          {entry.label}
                        </p>
                        {entry.items.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            activeOptions={{ exact: true }}
                            onClick={() => setFlyoutMobileAberto(false)}
                            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transicao-suave hover:bg-accent hover:text-foreground"
                            activeProps={{ className: "bg-accent text-primary" }}
                          >
                            <item.icon className="size-4 shrink-0" aria-hidden="true" />
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }
              return (
                <Link
                  key={entry.to}
                  to={entry.to}
                  className="flex flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted-foreground transicao-suave"
                  activeProps={{ className: "text-primary" }}
                >
                  <entry.icon className="size-5" aria-hidden="true" />
                  {entry.label}
                </Link>
              );
            })}
        </nav>
      </div>
    </div>
  );
}
