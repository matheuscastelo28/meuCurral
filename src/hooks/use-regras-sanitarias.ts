import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { useFazenda } from "@/hooks/use-fazenda";
import type { RegraSanitaria } from "@/lib/sanidade";

export function useRegrasSanitarias() {
  const { data: fazenda } = useFazenda();
  return useQuery({
    queryKey: ["regras-sanitarias", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("regras_sanitarias")
        .select("id, produto, tipo, intervalo_dias")
        .eq("fazenda_id", fazenda!.id);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: String(r.id),
        produto: String(r.produto ?? ""),
        tipo: (r.tipo as string | null) ?? null,
        intervalo_dias: Number(r.intervalo_dias),
      })) as RegraSanitaria[];
    },
  });
}
