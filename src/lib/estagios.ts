/**
 * Estágio (categoria) do animal pela idade — atualizado automaticamente.
 *
 * Referências usadas:
 * - Bovinos: Glossário de Termos de Gado de Corte (Embrapa Gado de Corte):
 *   bezerro = 0 a 12 meses; garrote (sobreano, novilho de ano) = macho de
 *   13 a 24 meses; novilha = fêmea que ainda não pariu. Primeiro parto em
 *   condições tropicais entre 29 e 35 meses (Peixoto e Falcão).
 * - Ovinos: Embrapa Pecuária Sul — cordeiro até cerca de 12 meses (ou até
 *   romper os primeiros incisivos); a partir de 12 meses, com 2 incisivos,
 *   borrego(a); ovelha = fêmea matriz. Puberdade entre 5 e 12 meses e
 *   primeira cobertura com 60% do peso adulto (Embrapa Caprinos e Ovinos).
 *
 * Regras:
 * - Só avança, nunca volta (respeita quem adiantou a categoria à mão). A
 *   exceção é quando o produtor corrige a data de nascimento: aí a
 *   categoria é recalculada e pode voltar (cadastro errado: novilha →
 *   bezerro). Vaca/ovelha só voltam se não há parto registrado e a idade
 *   corrigida torna o parto impossível (menos de 23 meses bovino, 12 meses
 *   ovino — o primeiro parto mais precoce viável); boi volta livremente.
 * - Fêmea vira vaca/ovelha ao ter um parto registrado; sem registro de
 *   parto, pela idade de corte (36 meses bovino, 24 meses ovino), quando
 *   já teria parido na prática.
 * - Macho nunca vira touro/carneiro sozinho (reprodutor é escolha do
 *   produtor); macho adulto bovino vira boi aos 24 meses.
 */

import type { Especie } from "@/lib/especies";

type Trilha = { categorias: string[]; ate: (number | null)[] };

/** Meses (exclusivo) em que cada etapa termina; null = última etapa da trilha. */
const TRILHAS: Record<Especie, { femea: Trilha; macho: Trilha }> = {
  bovino: {
    femea: { categorias: ["bezerro", "novilha", "vaca"], ate: [12, 36, null] },
    macho: { categorias: ["bezerro", "garrote", "boi"], ate: [12, 24, null] },
  },
  ovino: {
    femea: { categorias: ["cordeiro", "borrega", "ovelha"], ate: [12, 24, null] },
    macho: { categorias: ["cordeiro", "borrego"], ate: [12, null] },
  },
};

/** Abaixo desta idade (meses) a fêmea não pode ter parido: matriz volta na correção. */
const MESES_MINIMOS_PARA_PARIR: Record<Especie, number> = { bovino: 23, ovino: 12 };

export const LIMITES_ESTAGIO = {
  bovino: { bezerroAte: 12, garroteAte: 24, novilhaSemPartoAte: 36 },
  ovino: { cordeiroAte: 12, borregaSemPartoAte: 24 },
} as const;

export function idadeEmMeses(nascimento: string, hoje: string): number {
  const [an, mn, dn] = nascimento.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [ah, mh, dh] = hoje.slice(0, 10).split("-").map(Number) as [number, number, number];
  let meses = (ah - an) * 12 + (mh - mn);
  if (dh < dn) meses--;
  return meses;
}

/**
 * Nova categoria do animal, ou null quando não há o que mudar (categoria
 * fora da trilha — touro, carneiro, outro —, sem data de nascimento, ou já
 * no estágio certo ou adiante).
 */
export function proximoEstagio(
  a: {
    especie: Especie;
    sexo: string | null | undefined;
    categoria: string | null | undefined;
    nascimento: string | null | undefined;
    jaPariu?: boolean;
  },
  hoje: string,
  opcoes: { permitirVoltar?: boolean } = {},
): string | null {
  if (!a.nascimento || !a.categoria) return null;
  const trilha = TRILHAS[a.especie][a.sexo === "femea" ? "femea" : "macho"];
  const atual = trilha.categorias.indexOf(a.categoria);
  if (atual < 0) return null;
  const meses = idadeEmMeses(a.nascimento, hoje);
  if (meses < 0) return null;

  let alvo = trilha.ate.findIndex((ate) => ate === null || meses < ate);
  if (alvo < 0) alvo = trilha.categorias.length - 1;
  // Fêmea que pariu já é matriz, qualquer que seja a idade.
  if (a.sexo === "femea" && a.jaPariu) alvo = trilha.categorias.length - 1;
  const ultima = trilha.categorias.length - 1;
  if (alvo > atual) return trilha.categorias[alvo]!;
  if (opcoes.permitirVoltar && alvo < atual) {
    const ehFemea = a.sexo === "femea";
    const matrizPodeVoltar =
      !ehFemea || (!a.jaPariu && meses < MESES_MINIMOS_PARA_PARIR[a.especie]);
    if (atual < ultima || matrizPodeVoltar) return trilha.categorias[alvo]!;
  }
  return null;
}
