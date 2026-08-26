import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { getPlano } from "@/lib/planos";

export interface Fazenda {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  plano: string;
  dono_id: string;
  produtos_leite: string[];
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
        .select("id, nome, cidade, estado, plano, dono_id, produtos_leite")
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
  const plano = getPlano(fazenda.data?.plano);
  const usados = contagem.data ?? 0;
  return {
    fazenda: fazenda.data ?? null,
    carregando: fazenda.isLoading || contagem.isLoading,
    plano,
    usados,
    limite: plano.limiteAnimais,
    atingiu: usados >= plano.limiteAnimais,
  };
}
