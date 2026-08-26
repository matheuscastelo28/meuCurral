import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CartaoConfig } from "@/components/config/CartaoConfig";
import { SecaoFazenda } from "@/components/config/SecaoFazenda";
import { SecaoPerfil } from "@/components/config/SecaoPerfil";
import { SecaoSeguranca } from "@/components/config/SecaoSeguranca";
import { SecaoPreferencias } from "@/components/config/SecaoPreferencias";
import { SecaoPlano } from "@/components/config/SecaoPlano";
import { SecaoDados } from "@/components/config/SecaoDados";

export const Route = createFileRoute("/_authenticated/config")({
  head: () => ({
    meta: [
      { title: "Configurações — Meu Curral Digital" },
      {
        name: "description",
        content: "Dados da fazenda, perfil, segurança, preferências e dados da conta.",
      },
      { property: "og:title", content: "Configurações — Meu Curral Digital" },
      { property: "og:description", content: "Ajuste a fazenda, o perfil e as preferências." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Config,
});

const ATALHOS = [
  { id: "fazenda", rotulo: "Fazenda" },
  { id: "perfil", rotulo: "Perfil" },
  { id: "seguranca", rotulo: "Segurança" },
  { id: "preferencias", rotulo: "Preferências" },
  { id: "plano", rotulo: "Plano e uso" },
  { id: "dados", rotulo: "Dados" },
];

function Config() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await db.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell titulo="Configurações" descricao="Ajuste a fazenda, sua conta e como o sistema se comporta.">
      <nav aria-label="Seções das configurações" className="mb-5 flex flex-wrap gap-2">
        {ATALHOS.map((a) => (
          <a
            key={a.id}
            href={`#${a.id}`}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transicao-suave hover:bg-accent hover:text-foreground"
          >
            {a.rotulo}
          </a>
        ))}
      </nav>

      <div className="space-y-4">
        <SecaoFazenda />
        <SecaoPerfil />
        <SecaoSeguranca />
        <SecaoPreferencias />
        <SecaoPlano />
        <SecaoDados />

        <CartaoConfig
          id="sobre"
          titulo="Sobre e privacidade"
          descricao="Seus dados ficam isolados por fazenda, com regras aplicadas no próprio banco de dados."
        >
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link to="/termos" className="text-primary underline underline-offset-4">
              Termos de uso
            </Link>
            <Link to="/privacidade" className="text-primary underline underline-offset-4">
              Política de privacidade
            </Link>
            <span className="text-muted-foreground">Versão 1.0</span>
          </div>
          <Button variant="outline" className="mt-4" onClick={sair}>
            <LogOut className="size-4" aria-hidden="true" />
            Sair da conta
          </Button>
        </CartaoConfig>
      </div>
    </AppShell>
  );
}
