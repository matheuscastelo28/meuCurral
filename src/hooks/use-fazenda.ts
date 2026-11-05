import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { planoDaFazenda } from "@/lib/planos";

export type Atividade = "bovino" | "ovino";

export interface Fazenda {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  plano: string;
  acesso_total: boolean;
  dono_id: string;
  produtos_leite: string[];
  atividades: Atividade[] | null;
}

export function useSessao() {
  return useQuery({
    queryKey: ["sessao"],
    queryFn: async () => {
      const { data } = await db.auth.getUser();
      return data.user ?? null;
    },
  });
}

export function useFazenda() {
  return useQuery({
    queryKey: ["fazenda"],
    queryFn: async () => {
      const { data: userData } = await db.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const { data, error } = await db
        .from("fazendas")
        .select(
          "id, nome, cidade, estado, plano, acesso_total, dono_id, produtos_leite, atividades",
        )
        .eq("dono_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as Fazenda | undefined) ?? null;
    },
  });
}

export function useContagemAnimais(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["animais-contagem", fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { count, error } = await db
        .from("animais")
        .select("id", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId!)
        .not("status", "in", "(vendido,morto)");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useLimitePlano() {
  const fazenda = useFazenda();
  const contagem = useContagemAnimais(fazenda.data?.id);
  const plano = planoDaFazenda(fazenda.data);
  const usados = contagem.data ?? 0;
  // Enquanto a fazenda não chegou não dá pra saber o plano: não bloqueia
  // ninguém (quem tem acesso total e muitas cabeças veria um aviso falso).
  const limite = fazenda.data ? plano.limiteAnimais : Number.POSITIVE_INFINITY;
  return {
    fazenda: fazenda.data ?? null,
    carregando: fazenda.isLoading || contagem.isLoading,
    plano,
    usados,
    limite,
    atingiu: usados >= limite,
  };
}
