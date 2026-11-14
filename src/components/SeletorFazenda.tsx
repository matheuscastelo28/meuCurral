import { ArrowLeftRight } from "lucide-react";
import { trocarFazenda, useFazenda, useMinhasFazendas } from "@/hooks/use-fazenda";
import { cn } from "@/lib/utils";

const PAPEL: Record<string, string> = {
  dono: "sua",
  veterinario: "veterinário",
  colaborador: "colaborador",
};

/**
 * Troca de fazenda para quem acessa mais de uma (veterinário, colaborador,
 * ou dono que também foi convidado). Some para quem só tem a própria.
 */
export function SeletorFazenda({ className }: { className?: string }) {
  const { data: fazenda } = useFazenda();
  const { data: lista } = useMinhasFazendas();
  if (!fazenda || !lista || lista.length < 2) return null;
  return (
    <label className={cn("flex items-center gap-2", className)}>
      <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Trocar de fazenda</span>
      <select
        value={fazenda.id}
        onChange={(e) => trocarFazenda(e.target.value)}
        className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs"
      >
        {lista.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome} ({PAPEL[f.papel] ?? f.papel})
          </option>
        ))}
      </select>
    </label>
  );
}
