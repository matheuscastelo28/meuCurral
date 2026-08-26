import { Lock } from "lucide-react";

export function RecursoBloqueado({
  recurso,
  planoNecessario,
}: {
  recurso: string;
  planoNecessario: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-accent/50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-primary">
          <Lock className="size-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {recurso} faz parte do plano {planoNecessario}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Seu plano atual não inclui esse recurso. Você pode continuar usando o resto do sistema
            normalmente.
          </p>
        </div>
      </div>
    </div>
  );
}
