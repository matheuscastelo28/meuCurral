import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { db } from "@/lib/local-db";
import { useFazenda } from "@/hooks/use-fazenda";
import { EscolherAtividade } from "@/components/EscolherAtividade";
import { useEstagiosAutomaticos } from "@/hooks/use-estagios-automaticos";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Autenticado,
});

function Autenticado() {
  const { data: fazenda, isLoading } = useFazenda();
  // Convite aberto antes de entrar/criar a conta: volta pra ele.
  useEffect(() => {
    try {
      const pendente = localStorage.getItem("mcd:convite-pendente");
      if (pendente) window.location.assign(`/convite?token=${encodeURIComponent(pendente)}`);
    } catch {
      // sem armazenamento: nada pendente
    }
  }, []);
  useEstagiosAutomaticos(fazenda?.atividades?.length ? fazenda.id : undefined);
  if (isLoading) return null;
  if (fazenda && (!fazenda.atividades || fazenda.atividades.length === 0)) {
    return <EscolherAtividade fazenda={fazenda} />;
  }
  return <Outlet />;
}
