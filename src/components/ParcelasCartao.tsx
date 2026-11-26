import { Label } from "@/components/ui/label";
import { useLimitePlano } from "@/hooks/use-fazenda";
import { moeda } from "@/lib/formato";
import { MAX_PARCELAS_CARTAO } from "@/lib/parcelamento";
import { planoMinimoDo } from "@/lib/planos";
import { cn } from "@/lib/utils";

/**
 * Parcelas de um pagamento no cartão, igual em todo o sistema (mesmo padrão
 * da venda de leite): "1x de R$ …", "2x de R$ …". Parcelar faz parte do
 * Financeiro completo; nos outros planos só aparece 1x, com o aviso do plano.
 * O servidor aplica a mesma regra.
 */
export function ParcelasCartao({
  id,
  total,
  value,
  onChange,
  className,
}: {
  id: string;
  /** Valor total do pagamento, para mostrar o valor de cada parcela. */
  total: number;
  value: string;
  onChange: (valor: string) => void;
  className?: string;
}) {
  const { plano, fazenda } = useLimitePlano();
  // Enquanto a fazenda carrega, não trava (o servidor confere de qualquer forma).
  const liberado = !fazenda || plano.recursos.financeiroCompleto;
  const max = liberado ? MAX_PARCELAS_CARTAO : 1;
  const atual = Math.max(1, Math.floor(Number(value) || 1));
  // Um lançamento antigo com mais parcelas que o permitido continua aparecendo certo.
  const opcoes = Array.from({ length: Math.max(max, atual) }, (_, i) => i + 1);
  const valorOk = Number.isFinite(total) && total > 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>Parcelas</Label>
      <select
        id={id}
        value={String(atual)}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {opcoes.map((n) => (
          <option key={n} value={n}>
            {valorOk ? `${n}x de ${moeda(total / n)}` : `${n}x`}
          </option>
        ))}
      </select>
      {!liberado ? (
        <p className="text-xs text-muted-foreground">
          Parcelar no cartão faz parte do plano {planoMinimoDo("financeiroCompleto").nome}.
        </p>
      ) : null}
    </div>
  );
}
