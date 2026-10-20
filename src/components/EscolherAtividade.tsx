import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Beef, Check, Loader2, PawPrint } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Atividade, Fazenda } from "@/hooks/use-fazenda";

const OPCOES: { valor: Atividade; titulo: string; descricao: string; icon: typeof Beef }[] = [
  {
    valor: "bovino",
    titulo: "Bovinos",
    descricao: "Leite, engorda, rebanho e reprodução de gado.",
    icon: Beef,
  },
  {
    valor: "ovino",
    titulo: "Ovinos",
    descricao: "Confinamento, rebanho e reprodução de ovelhas e carneiros.",
    icon: PawPrint,
  },
];

/**
 * Tela cheia mostrada uma única vez, logo no primeiro acesso (fazenda nova
 * nasce com atividades = null — ver insert em dados.functions.ts). Depois
 * que a fazenda escolhe, essa tela nunca mais aparece; pra trocar de
 * atividade depois, o produtor usa Config > Atividade da fazenda.
 */
export function EscolherAtividade({ fazenda }: { fazenda: Fazenda }) {
  const queryClient = useQueryClient();
  const [selecionadas, setSelecionadas] = useState<Atividade[]>([]);

  function alternar(valor: Atividade) {
    setSelecionadas((atual) =>
      atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor],
    );
  }

  const confirmar = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("fazendas")
        .update({ atividades: selecionadas } as never)
        .eq("id", fazenda.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fazenda"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente de novo."),
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-10">
      <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
        <Check className="size-5" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-center text-3xl">O que você cria em {fazenda.nome}?</h1>
      <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
        Isso ajusta o menu e as telas do sistema pra sua atividade. Dá pra mudar depois em Config.
      </p>

      <div className="mt-8 grid w-full max-w-lg gap-3 sm:grid-cols-2">
        {OPCOES.map((op) => {
          const ativo = selecionadas.includes(op.valor);
          return (
            <button
              key={op.valor}
              type="button"
              onClick={() => alternar(op.valor)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border p-5 text-left transicao-suave",
                ativo
                  ? "border-primary bg-accent ring-2 ring-primary"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              <span className="flex items-center gap-2">
                <op.icon className="size-5 text-primary" aria-hidden="true" />
                <span className="text-base font-semibold">{op.titulo}</span>
                {ativo ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
              </span>
              <span className="text-sm text-muted-foreground">{op.descricao}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Cria as duas coisas? Selecione as duas opções.
      </p>

      <Button
        className="mt-6"
        disabled={selecionadas.length === 0 || confirmar.isPending}
        onClick={() => confirmar.mutate()}
      >
        {confirmar.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        Continuar
      </Button>
    </div>
  );
}
