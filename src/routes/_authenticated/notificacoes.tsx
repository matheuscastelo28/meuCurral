import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Baby,
  Bell,
  CalendarDays,
  CheckCheck,
  Scale,
  SlidersHorizontal,
  Syringe,
  Wallet,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useNotificacoes } from "@/hooks/use-notificacoes";
import {
  ROTULO_SITUACAO,
  ROTULO_TIPO,
  type SituacaoNotificacao,
  type TipoNotificacao,
} from "@/lib/notificacoes";
import { dataCurta } from "@/lib/formato";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({
    meta: [{ title: "Notificações — Curral Online" }, { name: "robots", content: "noindex" }],
  }),
  component: Notificacoes,
});

const ICONE: Record<TipoNotificacao, typeof Bell> = {
  financeiro: Wallet,
  reproducao: Baby,
  confinamento: Scale,
  sanidade: Syringe,
  agenda: CalendarDays,
  plano: Zap,
};

const COR_SITUACAO: Record<SituacaoNotificacao, string> = {
  atrasada: "bg-destructive/15 text-destructive",
  hoje: "bg-warning/15 text-warning",
  proxima: "bg-muted text-muted-foreground",
  info: "bg-accent text-primary",
};
const ROTULO_BADGE: Record<SituacaoNotificacao, string> = {
  atrasada: "Atrasada",
  hoje: "Para hoje",
  proxima: "Próxima",
  info: "Aviso",
};

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transicao-suave",
        ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Notificacoes() {
  const { notificacoes, lidas, carregando, marcarLida, marcarTodas } = useNotificacoes();
  const [tipo, setTipo] = useState<TipoNotificacao | "todos">("todos");
  const [situacao, setSituacao] = useState<SituacaoNotificacao | "todas">("todas");
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  // No celular os filtros ficam atrás do botão "Filtrar".
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const visiveis = useMemo(
    () =>
      notificacoes.filter(
        (n) =>
          (tipo === "todos" || n.tipo === tipo) &&
          (situacao === "todas" || n.situacao === situacao) &&
          (!soNaoLidas || !lidas.has(n.id)),
      ),
    [notificacoes, tipo, situacao, soNaoLidas, lidas],
  );
  const tiposPresentes = (Object.keys(ROTULO_TIPO) as TipoNotificacao[]).filter((t) =>
    notificacoes.some((n) => n.tipo === t),
  );
  const conta = (f: (n: (typeof notificacoes)[number]) => boolean) => notificacoes.filter(f).length;
  const filtrosAtivos =
    (tipo !== "todos" ? 1 : 0) + (situacao !== "todas" ? 1 : 0) + (soNaoLidas ? 1 : 0);
  const naoLidasVisiveis = visiveis.filter((n) => !lidas.has(n.id));

  return (
    <AppShell
      titulo="Notificações"
      acao={
        <Button
          variant="outline"
          disabled={naoLidasVisiveis.length === 0}
          onClick={() => marcarTodas(naoLidasVisiveis.map((n) => n.id))}
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          Marcar como lidas
        </Button>
      }
    >
      <div className="mb-3 md:hidden">
        <Button
          type="button"
          variant="outline"
          aria-expanded={filtrosAbertos}
          onClick={() => setFiltrosAbertos((v) => !v)}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filtrar
          {filtrosAtivos > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground">
              {filtrosAtivos}
            </span>
          ) : null}
        </Button>
      </div>
      <div className={cn("mb-4 space-y-3 md:block", filtrosAbertos ? "block" : "hidden")}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por setor">
          <Chip ativo={tipo === "todos"} onClick={() => setTipo("todos")}>
            Todos ({notificacoes.length})
          </Chip>
          {tiposPresentes.map((t) => (
            <Chip key={t} ativo={tipo === t} onClick={() => setTipo(t)}>
              {ROTULO_TIPO[t]} ({conta((n) => n.tipo === t)})
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
          <Chip ativo={situacao === "todas"} onClick={() => setSituacao("todas")}>
            Qualquer situação
          </Chip>
          {(Object.keys(ROTULO_SITUACAO) as SituacaoNotificacao[]).map((s) => (
            <Chip key={s} ativo={situacao === s} onClick={() => setSituacao(s)}>
              {ROTULO_SITUACAO[s]} ({conta((n) => n.situacao === s)})
            </Chip>
          ))}
          <Chip ativo={soNaoLidas} onClick={() => setSoNaoLidas((v) => !v)}>
            Só não lidas
          </Chip>
        </div>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : visiveis.length === 0 ? (
        <EmptyState
          icon={Bell}
          titulo={notificacoes.length === 0 ? "Nada pendente por aqui" : "Nada com esse filtro"}
          descricao={
            notificacoes.length === 0
              ? "Compromissos, contas a vencer, partos previstos e lotes sem pesagem aparecem aqui."
              : "Troque os filtros para ver outras notificações."
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {visiveis.map((n) => {
            const Icone = n.situacao === "atrasada" ? AlertTriangle : ICONE[n.tipo];
            const lida = lidas.has(n.id);
            return (
              <li key={n.id} className="flex items-stretch gap-1">
                <Link
                  to={n.destino.to as never}
                  search={n.destino.search as never}
                  hash={n.destino.hash as never}
                  onClick={() => marcarLida(n.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-start gap-3 px-4 py-3 transicao-suave hover:bg-accent/50",
                    lida && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                      n.situacao === "atrasada"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-accent text-primary",
                    )}
                  >
                    <Icone className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("text-sm", lida ? "font-medium" : "font-semibold")}>
                        {n.titulo}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          COR_SITUACAO[n.situacao],
                        )}
                      >
                        {ROTULO_BADGE[n.situacao]}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {ROTULO_TIPO[n.tipo]} · {n.detalhe}
                      {n.data ? ` · ${dataCurta(n.data)}` : ""}
                    </span>
                  </span>
                  {!lida ? (
                    <span
                      className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                      aria-label="Não lida"
                    />
                  ) : null}
                </Link>
                {!lida ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="my-auto mr-2 size-8 shrink-0"
                    aria-label={`Marcar como lida: ${n.titulo}`}
                    onClick={() => marcarLida(n.id)}
                  >
                    <CheckCheck className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
