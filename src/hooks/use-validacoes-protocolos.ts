import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { useFazenda } from "@/hooks/use-fazenda";

/** Revisão dos protocolos de vacinação pelo veterinário da fazenda atual. */
export function useValidacoesProtocolos() {
  const { data: fazenda } = useFazenda();
  return useQuery({
    queryKey: ["validacoes-protocolos", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db.protocolos.validacoes(fazenda!.id);
      if (error) throw new Error(error.message);
      return data!;
    },
  });
}
