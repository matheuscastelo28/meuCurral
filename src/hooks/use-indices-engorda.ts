import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { dataISO, diasAtrasISO } from "@/lib/formato";

export interface IndicesEngorda {
  totalEngorda: number;
  pesoMedio: number;
  arrobasTotais: number;
  gmdMedio: number | null;
  ganho30d: number;
}

export function useIndicesEngorda(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["indices-engorda", fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<IndicesEngorda> => {
      const [animaisRes, pesagensRes] = await Promise.all([
        db
          .from("animais")
          .select("id, peso_kg")
          .eq("fazenda_id", fazendaId!)
          .eq("status", "engorda"),
        db
          .from("manejos")
          .select("animal_id, data, valor")
          .eq("fazenda_id", fazendaId!)
          .eq("tipo", "pesagem")
          .order("data", { ascending: true }),
      ]);

      const animais = animaisRes.data ?? [];
      const totalEngorda = animais.length;
      const pesos = animais.map((a) => Number(a.peso_kg)).filter((p) => p > 0);
      const somaPesos = pesos.reduce((s, p) => s + p, 0);
      const pesoMedio = pesos.length > 0 ? somaPesos / pesos.length : 0;
      const arrobasTotais = somaPesos / 15;

      const idsEngorda = new Set(animais.map((a) => a.id));
      const porAnimal = new Map<string, { data: string; valor: number }[]>();
      for (const p of pesagensRes.data ?? []) {
        if (!p.animal_id || !idsEngorda.has(p.animal_id) || p.valor === null) continue;
        const lista = porAnimal.get(p.animal_id) ?? [];
        lista.push({ data: p.data, valor: Number(p.valor) });
        porAnimal.set(p.animal_id, lista);
      }

      const limite30 = diasAtrasISO(30);
      const gmds: number[] = [];
      let ganho30d = 0;
      for (const registros of porAnimal.values()) {
        if (registros.length < 2) continue;
        const primeiro = registros[0]!;
        const ultimo = registros[registros.length - 1]!;
        const dias = Math.max(
          1,
          Math.round(
            (new Date(ultimo.data).getTime() - new Date(primeiro.data).getTime()) / 86400000,
          ),
        );
        gmds.push((ultimo.valor - primeiro.valor) / dias);

        const recentes = registros.filter((r) => dataISO(r.data) >= limite30);
        if (recentes.length >= 2) {
          ganho30d += recentes[recentes.length - 1]!.valor - recentes[0]!.valor;
        }
      }
      const gmdMedio = gmds.length > 0 ? gmds.reduce((s, g) => s + g, 0) / gmds.length : null;

      return { totalEngorda, pesoMedio, arrobasTotais, gmdMedio, ganho30d };
    },
  });
}
