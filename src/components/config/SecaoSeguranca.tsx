import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forcaSenha } from "@/lib/formato";
import { CartaoConfig } from "./CartaoConfig";

export function SecaoSeguranca() {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const forca = forcaSenha(senha);

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirma) {
      toast.error("As duas senhas precisam ser iguais.");
      return;
    }
    setSalvando(true);
    const { error } = await db.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      toast.error("Não conseguimos trocar a senha agora. Tente de novo em instantes.");
      return;
    }
    setSenha("");
    setConfirma("");
    toast.success("Senha atualizada.");
  }

  async function sairDeTudo() {
    setSaindo(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await db.auth.signOut({ scope: "global" });
    setSaindo(false);
    navigate({ to: "/auth", replace: true });
  }

  return (
    <CartaoConfig id="seguranca" titulo="Segurança">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={trocarSenha}>
        <div className="space-y-1.5">
          <Label htmlFor="nova-senha">Nova senha</Label>
          <Input
            id="nova-senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password"
            minLength={8}
          />
          {senha ? (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={forca.nivel >= 3 ? "h-full bg-success" : "h-full bg-primary"}
                  style={{ width: `${(forca.nivel / 4) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{forca.rotulo}</span>
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirma-senha">Repita a nova senha</Label>
          <Input
            id="confirma-senha"
            type="password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={salvando || !senha}>
            {salvando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Trocar senha
          </Button>
          <Button type="button" variant="outline" onClick={sairDeTudo} disabled={saindo}>
            {saindo ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Sair de todos os aparelhos
          </Button>
        </div>
      </form>
    </CartaoConfig>
  );
}
