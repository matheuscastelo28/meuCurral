import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePerfil, useSalvarPerfil } from "@/hooks/use-preferencias";
import { CartaoConfig } from "./CartaoConfig";

export function SecaoPerfil() {
  const { data: perfil } = usePerfil();
  const salvar = useSalvarPerfil();
  const [nome, setNome] = useState("");
  const [objetivo, setObjetivo] = useState("produtor");

  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.nome ?? "");
    setObjetivo(perfil.objetivo ?? "produtor");
  }, [perfil]);

  return (
    <CartaoConfig
      id="perfil"
      titulo="Meu perfil"
      descricao="Como você aparece no sistema e qual é o seu uso principal."
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate(
            { nome: nome.trim() || null, objetivo },
            {
              onSuccess: () => toast.success("Perfil atualizado."),
              onError: () => toast.error("Não conseguimos salvar seu perfil agora."),
            },
          );
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="perfil-nome">Seu nome</Label>
          <Input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="perfil-objetivo">Você usa o sistema como</Label>
          <select
            id="perfil-objetivo"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="produtor">Produtor com rebanho próprio</option>
            <option value="consultor">Consultor / veterinário</option>
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="perfil-email">E-mail de acesso</Label>
          <Input id="perfil-email" value={perfil?.email ?? ""} readOnly disabled />
          <p className="text-xs text-muted-foreground">
            Para trocar o e-mail de acesso, fale com o suporte.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Salvar perfil
          </Button>
        </div>
      </form>
    </CartaoConfig>
  );
}
