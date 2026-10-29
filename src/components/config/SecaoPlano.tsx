import { Check, Minus } from "lucide-react";
import { useLimitePlano } from "@/hooks/use-fazenda";
import { usoCabecasTexto } from "@/lib/planos";
import { CartaoConfig } from "./CartaoConfig";

export function SecaoPlano() {
  const { plano, usados, limite } = useLimitePlano();
  const pct = Number.isFinite(limite) ? Math.min(100, Math.round((usados / limite) * 100)) : 0;

  const recursos = [
    { rotulo: "Cadastro de rebanho, manejo e calendário", tem: true },
    { rotulo: "Relatórios", tem: plano.relatorios },
    { rotulo: "Exportação de dados", tem: plano.exportacao },
    { rotulo: "Vários usuários na mesma fazenda", tem: plano.multiUsuario },
    { rotulo: "Acesso via API", tem: plano.api },
  ];

  return (
    <CartaoConfig
      id="plano"
      titulo="Plano e uso"
      descricao="O que está liberado hoje na sua conta."
    >
      <p className="text-sm font-semibold">Plano {plano.nome}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {usoCabecasTexto(usados, limite)} no rebanho.
      </p>
      {Number.isFinite(limite) ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={pct >= 100 ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <ul className="mt-4 space-y-2">
        {recursos.map((r) => (
          <li key={r.rotulo} className="flex gap-2 text-sm">
            {r.tem ? (
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={r.tem ? "" : "text-muted-foreground"}>{r.rotulo}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Precisa de mais espaço ou de algum recurso bloqueado? Fale com a gente em{" "}
        <a
          className="text-primary underline underline-offset-4"
          href="mailto:contato@curralonline.com"
        >
          contato@curralonline.com
        </a>
        .
      </p>
    </CartaoConfig>
  );
}
