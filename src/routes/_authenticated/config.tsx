import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CartaoConfig } from "@/components/config/CartaoConfig";
import { CartoesRecolhiveis } from "@/components/config/cartoes-recolhiveis";
import { SecaoFazenda } from "@/components/config/SecaoFazenda";
import { SecaoAtividade } from "@/components/config/SecaoAtividade";
import { SecaoPerfil } from "@/components/config/SecaoPerfil";
import { SecaoSeguranca } from "@/components/config/SecaoSeguranca";
import { SecaoPreferencias } from "@/components/config/SecaoPreferencias";
import { SecaoPlano } from "@/components/config/SecaoPlano";
import { SecaoDados } from "@/components/config/SecaoDados";
import { SecaoAcessoCompartilhado, SecaoEquipe } from "@/components/config/SecaoEquipe";
import { useFazenda } from "@/hooks/use-fazenda";

export const Route = createFileRoute("/_authenticated/config")({
  head: () => ({
    meta: [
      { title: "Configurações — Curral Online" },
      {
        name: "description",
        content: "Dados da fazenda, perfil, segurança, preferências e dados da conta.",
      },
      { property: "og:title", content: "Configurações — Curral Online" },
      { property: "og:description", content: "Ajuste a fazenda, o perfil e as preferências." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Config,
});

function Config() {
  const navigate = useNavigate();
  const { data: fazenda } = useFazenda();
  // Em fazenda compartilhada, o membro não mexe em configurações do dono.
  const souDono = fazenda?.souDono ?? true;
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await db.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell titulo="Configurações">
      <CartoesRecolhiveis.Provider value={true}>
        <div className="space-y-2">
          {souDono ? <SecaoFazenda /> : <SecaoAcessoCompartilhado />}
          {souDono ? <SecaoEquipe /> : null}
          {souDono ? <SecaoAtividade /> : null}
          <SecaoPerfil />
          <SecaoSeguranca />
          <SecaoPreferencias />
          {souDono ? <SecaoPlano /> : null}
          <SecaoDados />

          <CartaoConfig id="sobre" titulo="Sobre e privacidade">
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
      </CartoesRecolhiveis.Provider>
    </AppShell>
  );
}
