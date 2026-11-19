import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { dataISO, diasAtrasISO } from "@/lib/formato";
import { agruparPorAnimal, estadoDaFemea, type RegistroRepro } from "@/lib/reproducao";

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
  mediaUltimoControle: number | null;
  totalUltimoControle: number;
  dataUltimoControle: string | null;
}

export function useIndicesRebanho(fazendaId: string | undefined, categorias?: readonly string[]) {
  return useQuery({
    queryKey: ["indices-rebanho", fazendaId, categorias],
    enabled: !!fazendaId,
    queryFn: async (): Promise<IndicesRebanho> => {
      const limite30 = diasAtrasISO(30);

      const [animaisRes, partosRes, mortesRes, leiteRes] = await Promise.all([
        db.from("animais").select("id, categoria, status").eq("fazenda_id", fazendaId!),
        db
          .from("reproducao")
          .select("animal_id, tipo, data, resultado, created_at")
          .eq("fazenda_id", fazendaId!)
          .order("data", { ascending: false }),
        db
          .from("animais")
          .select("id, categoria")
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

      // Fazenda com as duas atividades filtra aqui (espécie vem da
      // categoria, não existe coluna própria) pra bovino e ovino nunca
      // aparecerem misturados nos números de um e de outro.
      const animais = categorias
        ? (animaisRes.data ?? []).filter((a) => categorias.includes(a.categoria ?? ""))
        : (animaisRes.data ?? []);
      const idsValidos = categorias ? new Set(animais.map((a) => a.id)) : null;
      const ativos = animais.filter((a) => a.status !== "vendido" && a.status !== "morto");
      const totalRebanho = ativos.length;
      // Prenhe = situação "prenhe" OU diagnóstico positivo ainda sem parto
      // no histórico (vaca em lactação também pode estar prenhe).
      const reproTodos = (partosRes.data ?? []) as RegistroRepro[];
      const porAnimal = agruparPorAnimal(reproTodos);
      const prenhes = new Set(ativos.filter((a) => a.status === "prenhe").map((a) => a.id));
      for (const a of ativos) {
        const est = estadoDaFemea(porAnimal.get(a.id) ?? []);
        if (est.servicoAberto && est.diagnostico === "positivo") prenhes.add(a.id);
      }
      const totalPrenhes = prenhes.size;
      const lactantes = animais.filter((a) => a.status === "lactacao").length;
      const vacas = ativos.filter((a) => a.categoria === "vaca").length;

      const partosTodos = reproTodos.filter((r) => r.tipo === "parto") as {
        animal_id: string;
        data: string;
      }[];
      const partos = idsValidos
        ? partosTodos.filter((p) => idsValidos.has(p.animal_id))
        : partosTodos;
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

      const leiteTodos = leiteRes.data ?? [];
      const leite = idsValidos
        ? leiteTodos.filter((l) => !l.animal_id || idsValidos.has(l.animal_id))
        : leiteTodos;
      const dataUltimoControle = leite[0]?.data ? dataISO(leite[0].data) : null;
      const doUltimoControle = dataUltimoControle
        ? leite.filter((l) => dataISO(l.data) === dataUltimoControle)
        : [];
      const totalUltimoControle = doUltimoControle.reduce((s, l) => s + Number(l.litros), 0);
      // Média por vaca só faz sentido com registro individual — produção
      // lançada por lote não diz quantas vacas foram ordenhadas.
      const individuais = doUltimoControle.filter((l) => l.animal_id);
      const animaisNoControle = new Set(individuais.map((l) => l.animal_id)).size;
      const mediaUltimoControle =
        animaisNoControle > 0
          ? individuais.reduce((s, l) => s + Number(l.litros), 0) / animaisNoControle
          : null;

      const mortesTodos = mortesRes.data ?? [];
      const mortes30d = categorias
        ? mortesTodos.filter((a) => categorias.includes(a.categoria ?? "")).length
        : mortesTodos.length;

      return {
        totalRebanho,
        totalPrenhes,
        partos30d,
        mortes30d,
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
