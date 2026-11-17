import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { useFazenda } from "@/hooks/use-fazenda";

/** Avisos oficiais em vigor para o estado da fazenda atual. */
export function useAvisosOficiais() {
  const { data: fazenda } = useFazenda();
  return useQuery({
    queryKey: ["avisos-oficiais", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db.avisosOficiais.paraMim(fazenda!.id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** O administrador vê o atalho para a área de avisos (a checagem real é no servidor). */
export function useSouAdmin() {
  return useQuery({
    queryKey: ["sou-admin"],
    queryFn: async () => {
      const { data } = await db.avisosOficiais.souAdmin();
      return data?.admin ?? false;
    },
    staleTime: 5 * 60_000,
  });
}
