import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Meu Curral Digital" },
      { name: "description", content: "Acesse sua fazenda no Meu Curral Digital." },
      { property: "og:title", content: "Entrar — Meu Curral Digital" },
      { property: "og:description", content: "Acesse sua fazenda no Meu Curral Digital." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    db.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/inicio", replace: true });
    });
  }, [navigate]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const timeout = setTimeout(() => {
      setErro("A conexão está demorando. Verifique sua internet e tente novamente.");
    }, 12000);
    try {
      const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) throw error;
      navigate({ to: "/inicio", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setErro(
        msg.toLowerCase().includes("invalid")
          ? "E-mail ou senha não conferem. Confira e tente de novo."
          : "Não conseguimos entrar agora. Tente novamente em instantes.",
      );
    } finally {
      clearTimeout(timeout);
      setEnviando(false);
    }
  }

  async function recuperarSenha() {
    if (!email.trim()) {
      setErro("Digite seu e-mail acima para receber o link de recuperação.");
      return;
    }
    setRecuperando(true);
    const { error } = await db.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nova-senha`,
    });
    setRecuperando(false);
    if (error) {
      toast.error("Não conseguimos enviar o e-mail agora. Tente novamente.");
      return;
    }
    toast.success("Se existir uma conta com esse e-mail, o link de recuperação foi enviado.");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sprout className="size-4" aria-hidden="true" />
          </span>
          <span className="font-display text-sm font-extrabold">Meu Curral Digital</span>
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">
        <h1 className="text-3xl">Entrar na sua fazenda</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use o e-mail e a senha que você cadastrou.
        </p>

        <form onSubmit={entrar} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@fazenda.com.br"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Sua senha"
            />
          </div>

          {erro ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={enviando}>
            {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {enviando ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <button
          type="button"
          onClick={recuperarSenha}
          disabled={recuperando}
          className="mt-3 text-sm text-primary underline-offset-4 hover:underline"
        >
          {recuperando ? "Enviando..." : "Esqueci minha senha"}
        </button>

        <p className="mt-8 text-sm text-muted-foreground">
          Primeiro acesso?{" "}
          <Link to="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </main>
    </div>
  );
}
