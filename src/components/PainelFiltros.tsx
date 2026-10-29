import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Busca e filtros recolhidos atrás de um botão "Filtrar" — a lista aparece
 * logo de cara no celular e quem precisa filtrar abre o painel. O número no
 * botão mostra quantos filtros estão valendo mesmo com o painel fechado.
 */
export function PainelFiltros({
  ativos,
  onLimpar,
  titulo,
  className,
  children,
}: {
  ativos: number;
  onLimpar: () => void;
  titulo?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {titulo ?? null}
        <div className={cn("flex items-center gap-2", !titulo && "w-full")}>
          <Button
            type="button"
            variant={aberto || ativos > 0 ? "secondary" : "outline"}
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filtrar
            {ativos > 0 ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {ativos}
              </span>
            ) : null}
            <ChevronDown
              className={cn("size-4 transition-transform", aberto && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
          {ativos > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={onLimpar}>
              <X className="size-4" aria-hidden="true" />
              Limpar
            </Button>
          ) : null}
        </div>
      </div>

      {aberto ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Um campo do painel, com o nome em cima (o select sozinho não diz o que filtra). */
export function CampoFiltro({
  rotulo,
  largo = false,
  children,
}: {
  rotulo: string;
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn("block min-w-0 space-y-1.5", largo && "sm:col-span-2")}>
      <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

export const CLASSE_SELECT_FILTRO =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";
