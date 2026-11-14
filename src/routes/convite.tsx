import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { CHAVE_FAZENDA_ATUAL } from "@/hooks/use-fazenda";

/** Guardado enquanto a pessoa entra ou cria a conta; depois volta pra cá. */
export const CHAVE_CONVITE_PENDENTE = "mcd:convite-pendente";

export const Route = createFileRoute("/convite")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { token?: string | undefined } => ({
    token: typeof s["token"] === "string" ? s["token"] : undefined,
  }),
  head: () => ({
    meta: [{ title: "Convite — Curral Online" }, { name: "robots", content: "noindex" }],
  }),
  component: Convite,
});

const PAPEL: Record<string, string> = {
  veterinario: "veterinário(a)",
  colaborador: "colaborador(a)",
};

function Convite() {
  const { token } = Route.useSearch();
  const [logado, setLogado] = useState<boolean | null>(null);
  const [aceitando, setAceitando] = useState(false);

  useEffect(() => {
    void db.auth.getUser().then(({ data }) => {
      setLogado(!!data.user);
      // Já entrou e está no convite: não precisa mais voltar pra cá sozinho.
      if (data.user) {
        try {
          localStorage.removeItem(CHAVE_CONVITE_PENDENTE);
        } catch {
          // nada a limpar
        }
      }
    });
  }, []);

  const convite = useQuery({
    queryKey: ["convite", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await db.equipe.verConvite(token!);
      if (error) throw new Error(error.message);
      return data!;
    },
  });

  function guardarPendente() {
    try {
      if (token) localStorage.setItem(CHAVE_CONVITE_PENDENTE, token);
    } catch {
      // sem armazenamento: a pessoa abre o link de novo depois de entrar
    }
  }

  async function aceitar() {
    if (!token) return;
    setAceitando(true);
    const { data, error } = await db.equipe.aceitarConvite(token);
    setAceitando(false);
    if (error || !data) {
      toast.error(error?.message ?? "Não conseguimos aceitar agora.");
      return;
    }
    try {
      localStorage.removeItem(CHAVE_CONVITE_PENDENTE);
      localStorage.setItem(CHAVE_FAZENDA_ATUAL, data.fazendaId);
    } catch {
      // segue na fazenda padrão
    }
    window.location.assign("/inicio");
  }

  const c = convite.data;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
          <Users className="size-5" aria-hidden="true" />
        </span>
        {!token ? (
          <p className="mt-4 text-sm">
            Link de convite incompleto. Peça um novo link a quem convidou.
          </p>
        ) : convite.isLoading || logado === null ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Abrindo convite...
          </p>
        ) : convite.isError || !c ? (
          <p className="mt-4 text-sm">Convite não encontrado. Peça um novo link a quem convidou.</p>
        ) : c.status !== "pendente" ? (
          <>
            <h1 className="mt-4 text-lg font-bold">
              {c.status === "aceito" ? "Convite já aceito" : "Convite cancelado"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {c.status === "aceito"
                ? "Entre na sua conta e escolha a fazenda no menu."
                : "Quem convidou cancelou este convite. Peça um novo, se for o caso."}
            </p>
            <Button className="mt-4" asChild>
              <Link to="/inicio">Ir para o sistema</Link>
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-bold">Convite para a fazenda {c.fazenda}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {c.quem ? `${c.quem} convidou você` : "Você foi convidado(a)"} para acessar como{" "}
              {PAPEL[c.papel] ?? c.papel}
              {c.cidade ? ` (${[c.cidade, c.estado].filter(Boolean).join("/")})` : ""}. O convite é
              para <strong>{c.email}</strong>.
            </p>
            {logado ? (
              <Button className="mt-5 w-full" onClick={aceitar} disabled={aceitando}>
                {aceitando ? "Aceitando..." : "Aceitar convite"}
              </Button>
            ) : (
              <div className="mt-5 grid gap-2">
                <Button asChild onClick={guardarPendente}>
                  <Link to="/auth">Já tenho conta: entrar</Link>
                </Button>
                <Button variant="outline" asChild onClick={guardarPendente}>
                  <Link to="/cadastro">Criar conta com {c.email}</Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Depois de entrar, você volta para este convite.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
