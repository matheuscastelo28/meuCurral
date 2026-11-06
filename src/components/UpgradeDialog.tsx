import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLimitePlano } from "@/hooks/use-fazenda";
import { limiteTexto } from "@/lib/planos";

export function UpgradeDialog({
  aberto,
  onFechar,
  titulo = "O espaço do seu plano acabou",
  descricao = "Você já usou todas as cabeças que o plano atual permite. Assine um plano para liberar mais espaço.",
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo?: string;
  descricao?: string;
}) {
  const { plano, usados, limite } = useLimitePlano();

  return (
    <Dialog open={aberto} onOpenChange={(v) => (!v ? onFechar() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
            <Lock className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle className="text-left">{titulo}</DialogTitle>
          <DialogDescription className="text-left">{descricao}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold">Plano {plano.nome}</p>
          <p className="mt-1 text-muted-foreground">
            {usados} de {limiteTexto(limite)} cabeças cadastradas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/config" hash="plano" onClick={onFechar}>
              Ver planos
            </Link>
          </Button>
          <Button variant="outline" onClick={onFechar}>
            Continuar assim
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
