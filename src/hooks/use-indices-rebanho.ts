import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { dataISO, diasAtrasISO } from "@/lib/formato";

export interface IndicesRebanho {
  totalRebanho: number;
  totalPrenhes: number;
  partos30d: number;
  mortes30d: number;
  lactantes: number;
  vacas: number;
  lactantesRebanhoPct: number;
  lactantesVacasPct: number;
  delMedio: number | null;
  mediaUltimoControle: number;
  totalUltimoControle: number;
  dataUltimoControle: string | null;
}

export function useIndicesRebanho(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["indices-rebanho", fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<IndicesRebanho> => {
      const limite30 = diasAtrasISO(30);

      const [animaisRes, partosRes, mortesRes, leiteRes] = await Promise.all([
        db.from("animais").select("id, categoria, status").eq("fazenda_id", fazendaId!),
        db
          .from("reproducao")
          .select("animal_id, data")
          .eq("fazenda_id", fazendaId!)
          .eq("tipo", "parto")
          .order("data", { ascending: false }),
        db
          .from("animais")
          .select("id", { count: "exact", head: true })
          .eq("fazenda_id", fazendaId!)
          .eq("status", "morto")
          .gte("updated_at", `${limite30}T00:00:00`),
        db
          .from("producao_leite")
          .select("data, litros, animal_id")
          .eq("fazenda_id", fazendaId!)
          .eq("produto", "leite")
          .order("data", { ascending: false })
          .limit(300),
      ]);

      const animais = animaisRes.data ?? [];
      const ativos = animais.filter((a) => a.status !== "vendido" && a.status !== "morto");
      const totalRebanho = ativos.length;
      const totalPrenhes = animais.filter((a) => a.status === "prenhe").length;
      const lactantes = animais.filter((a) => a.status === "lactacao").length;
      const vacas = ativos.filter((a) => a.categoria === "vaca").length;

      const partos = partosRes.data ?? [];
      const partos30d = partos.filter((p) => dataISO(p.data) >= limite30).length;

      const ultimoPartoPorAnimal = new Map<string, string>();
      for (const p of partos) {
        if (!ultimoPartoPorAnimal.has(p.animal_id)) ultimoPartoPorAnimal.set(p.animal_id, p.data);
      }
      const hoje = new Date();
      const diasEmLactacao = animais
        .filter((a) => a.status === "lactacao")
        .map((a) => ultimoPartoPorAnimal.get(a.id))
        .filter((d): d is string => !!d)
        .map((d) => Math.max(0, Math.round((hoje.getTime() - new Date(d).getTime()) / 86400000)));
      const delMedio =
        diasEmLactacao.length > 0
          ? Math.round(diasEmLactacao.reduce((s, d) => s + d, 0) / diasEmLactacao.length)
          : null;

      const leite = leiteRes.data ?? [];
      const dataUltimoControle = leite[0]?.data ? dataISO(leite[0].data) : null;
      const doUltimoControle = dataUltimoControle
        ? leite.filter((l) => dataISO(l.data) === dataUltimoControle)
        : [];
      const totalUltimoControle = doUltimoControle.reduce((s, l) => s + Number(l.litros), 0);
      const animaisNoControle = new Set(doUltimoControle.map((l) => l.animal_id).filter(Boolean))
        .size;
      const mediaUltimoControle =
        animaisNoControle > 0 ? totalUltimoControle / animaisNoControle : totalUltimoControle;

      return {
        totalRebanho,
        totalPrenhes,
        partos30d,
        mortes30d: mortesRes.count ?? 0,
        lactantes,
        vacas,
        lactantesRebanhoPct: totalRebanho > 0 ? Math.round((lactantes / totalRebanho) * 100) : 0,
        lactantesVacasPct: vacas > 0 ? Math.round((lactantes / vacas) * 100) : 0,
        delMedio,
        mediaUltimoControle,
        totalUltimoControle,
        dataUltimoControle,
      };
    },
  });
}
