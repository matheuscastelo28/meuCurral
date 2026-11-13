import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/local-db";

export interface Preferencias {
  unidade_peso: string;
  moeda: string;
  inicio_semana: number;
  alerta_vacina: boolean;
  alerta_pesagem: boolean;
  alerta_parto: boolean;
  estagio_automatico: boolean;
}

export interface Perfil extends Preferencias {
  id: string;
  nome: string | null;
  email: string | null;
  objetivo: string | null;
}

export const PREFERENCIAS_PADRAO: Preferencias = {
  unidade_peso: "kg",
  moeda: "BRL",
  inicio_semana: 0,
  alerta_vacina: true,
  alerta_pesagem: true,
  alerta_parto: true,
  estagio_automatico: true,
};

export function usePerfil() {
  return useQuery({
    queryKey: ["perfil"],
    queryFn: async () => {
      const { data: userData } = await db.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const { data, error } = await db
        .from("perfis")
        .select(
          "id, nome, email, objetivo, unidade_peso, moeda, inicio_semana, alerta_vacina, alerta_pesagem, alerta_parto, estagio_automatico",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Perfil | null) ?? null;
    },
  });
}

export function usePreferencias(): Preferencias {
  const { data } = usePerfil();
  if (!data) return PREFERENCIAS_PADRAO;
  return {
    unidade_peso: data.unidade_peso ?? PREFERENCIAS_PADRAO.unidade_peso,
    moeda: data.moeda ?? PREFERENCIAS_PADRAO.moeda,
    inicio_semana: data.inicio_semana ?? PREFERENCIAS_PADRAO.inicio_semana,
    alerta_vacina: data.alerta_vacina ?? true,
    alerta_pesagem: data.alerta_pesagem ?? true,
    alerta_parto: data.alerta_parto ?? true,
    estagio_automatico: data.estagio_automatico ?? true,
  };
}

export function useSalvarPerfil() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: Partial<Perfil>) => {
      const { data: userData } = await db.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("sem sessão");
      const { error } = await db
        .from("perfis")
        .update(valores as never)
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perfil"] });
    },
  });
}
