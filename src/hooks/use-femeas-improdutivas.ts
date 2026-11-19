import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { useFazenda, useLimitePlano } from "@/hooks/use-fazenda";
import { hojeISO } from "@/lib/formato";
import { femeasImprodutivas, type FemeaImprodutiva, type RegistroRepro } from "@/lib/reproducao";

/**
 * Fêmeas improdutivas da fazenda (regras em lib/reproducao). É um índice
 * avançado: no plano que não inclui, a lista vem vazia e `bloqueado` é true.
 */
export function useFemeasImprodutivas(): {
  lista: FemeaImprodutiva[];
  carregando: boolean;
  bloqueado: boolean;
} {
  const { data: fazenda } = useFazenda();
  const { plano } = useLimitePlano();
  const liberado = plano.recursos.indicesAvancados;
  const q = useQuery({
    queryKey: ["improdutivas", fazenda?.id],
    enabled: !!fazenda?.id && liberado,
    staleTime: 60_000,
    queryFn: async () => {
      const id = fazenda!.id;
      const [animais, reproducao] = await Promise.all([
        db
          .from("animais")
          .select("id, nome, brinco, categoria, especie, sexo, status, nascimento")
          .eq("fazenda_id", id),
        db
          .from("reproducao")
          .select("id, animal_id, tipo, data, resultado, previsao_parto, created_at")
          .eq("fazenda_id", id)
          .limit(5000),
      ]);
      return femeasImprodutivas(
        (animais.data ?? []) as never,
        (reproducao.data ?? []) as unknown as RegistroRepro[],
        hojeISO(),
      );
    },
  });
  return { lista: q.data ?? [], carregando: q.isLoading, bloqueado: !liberado };
}
