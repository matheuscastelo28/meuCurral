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
  proprietario: string | null;
  dap_caf: string | null;
  telefone: string | null;
  /** É dono desta fazenda (membro convidado só usa; configurações são do dono). */
  souDono: boolean;
}

/** Fazenda escolhida no menu (quem acessa mais de uma). Fica neste aparelho. */
export const CHAVE_FAZENDA_ATUAL = "mcd:fazenda-atual";

export function lerFazendaAtual(): string | null {
  try {
    return localStorage.getItem(CHAVE_FAZENDA_ATUAL);
  } catch {
    return null;
  }
}

/** Troca a fazenda e recarrega o app (todos os dados mudam de dono). */
export function trocarFazenda(id: string) {
  try {
    localStorage.setItem(CHAVE_FAZENDA_ATUAL, id);
  } catch {
    // sem armazenamento: fica na primeira fazenda
  }
  window.location.assign("/inicio");
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
          "id, nome, cidade, estado, plano, acesso_total, dono_id, produtos_leite, atividades, proprietario, dap_caf, telefone",
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      // O servidor devolve as fazendas que a pessoa acessa (dela e as em que
      // é membro). Vale a escolhida no menu; senão a dela; senão a primeira.
      const lista = (data ?? []) as Omit<Fazenda, "souDono">[];
      const escolhida = lerFazendaAtual();
      const alvo =
        lista.find((f) => f.id === escolhida) ??
        lista.find((f) => f.dono_id === user.id) ??
        lista[0];
      return alvo ? { ...alvo, souDono: alvo.dono_id === user.id } : null;
    },
  });
}

export interface FazendaAcessivel {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  papel: string; // dono | veterinario | colaborador
  dono_nome: string | null;
}

/** Todas as fazendas que a pessoa acessa, para o menu de troca. */
export function useMinhasFazendas() {
  return useQuery({
    queryKey: ["minhas-fazendas"],
    queryFn: async () => {
      const { data, error } = await db.equipe.minhasFazendas();
      if (error) throw new Error(error.message);
      return (data ?? []) as FazendaAcessivel[];
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
