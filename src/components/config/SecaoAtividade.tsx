import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Beef, Check, Loader2, PawPrint } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFazenda, type Atividade } from "@/hooks/use-fazenda";
import { CartaoConfig } from "./CartaoConfig";

const OPCOES: { valor: Atividade; titulo: string; descricao: string; icon: typeof Beef }[] = [
  {
    valor: "bovino",
    titulo: "Bovinos",
    descricao: "Leite, engorda e reprodução de gado.",
    icon: Beef,
  },
  {
    valor: "ovino",
    titulo: "Ovinos",
    descricao: "Confinamento e reprodução de ovelhas e carneiros.",
    icon: PawPrint,
  },
];

export function SecaoAtividade() {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const [selecionadas, setSelecionadas] = useState<Atividade[]>([]);

  useEffect(() => {
    if (fazenda?.atividades) setSelecionadas(fazenda.atividades);
  }, [fazenda]);

  function alternar(valor: Atividade) {
    setSelecionadas((atual) =>
      atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor],
    );
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("fazendas")
        .update({ atividades: selecionadas } as never)
        .eq("id", fazenda!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atividade atualizada. O menu já reflete a mudança.");
      queryClient.invalidateQueries({ queryKey: ["fazenda"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente de novo."),
  });

  const mudou = fazenda
    ? JSON.stringify([...selecionadas].sort()) !==
      JSON.stringify([...(fazenda.atividades ?? [])].sort())
    : false;

  return (
    <CartaoConfig id="atividade" titulo="Atividade da fazenda">
      <div className="grid gap-3 sm:grid-cols-2">
        {OPCOES.map((op) => {
          const ativo = selecionadas.includes(op.valor);
          return (
            <button
              key={op.valor}
              type="button"
              onClick={() => alternar(op.valor)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transicao-suave",
                ativo
                  ? "border-primary bg-accent ring-2 ring-primary"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              <span className="flex items-center gap-2">
                <op.icon className="size-4 text-primary" aria-hidden="true" />
                <span className="text-sm font-semibold">{op.titulo}</span>
                {ativo ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
              </span>
              <span className="text-xs text-muted-foreground">{op.descricao}</span>
            </button>
          );
        })}
      </div>

      <Button
        className="mt-4"
        variant="outline"
        disabled={selecionadas.length === 0 || !mudou || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        {salvar.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Salvar atividade
      </Button>
    </CartaoConfig>
  );
}
