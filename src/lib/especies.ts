/**
 * Categorias e raças por espécie — usado pra separar bovino/ovino em várias
 * telas (Rebanho, Confinamento, Reprodução) sempre que a fazenda tem as
 * duas atividades ao mesmo tempo. A categoria do animal é o único sinal de
 * espécie que já existe no cadastro (não há coluna "espécie" exposta na UI).
 */

export const CATEGORIAS_BOVINO = ["bezerro", "novilha", "garrote", "vaca", "boi", "touro"] as const;
export const CATEGORIAS_OVINO = ["cordeiro", "borrega", "borrego", "ovelha", "carneiro"] as const;
export const CATEGORIAS = [...CATEGORIAS_BOVINO, ...CATEGORIAS_OVINO, "outro"] as const;

export const OUTRA_RACA = "Outra";
export const RACAS_BOVINO: string[] = [
  "Nelore",
  "Gir",
  "Girolando",
  "Holandês",
  "Jersey",
  "Angus",
  "Brahman",
  "Guzerá",
  "Tabapuã",
  "Senepol",
  "Simental",
  "Charolês",
  OUTRA_RACA,
];
export const RACAS_OVINO: string[] = [
  "Santa Inês",
  "Dorper",
  "Morada Nova",
  "Somalis",
  "Texel",
  "Suffolk",
  "Ile de France",
  "Bergamácia",
  OUTRA_RACA,
];

export type Especie = "bovino" | "ovino";

/** "outro"/categoria desconhecida não entra em nenhuma das duas — fica de fora do filtro por espécie. */
export function especieDaCategoria(categoria: string | null | undefined): Especie | null {
  if (!categoria) return null;
  if ((CATEGORIAS_BOVINO as readonly string[]).includes(categoria)) return "bovino";
  if ((CATEGORIAS_OVINO as readonly string[]).includes(categoria)) return "ovino";
  return null;
}

/**
 * Espécie de um animal já cadastrado: a categoria é o sinal mais confiável
 * (animais antigos não tinham o campo espécie preenchido); "outro" cai no
 * campo espécie gravado.
 */
export function especieDoAnimal(a: {
  categoria?: string | null;
  especie?: string | null;
}): Especie {
  return especieDaCategoria(a.categoria) ?? (a.especie === "ovino" ? "ovino" : "bovino");
}

/** Espécies marcadas em Configurações (sem nenhuma marcada, vale bovino). */
export function especiesDasAtividades(atividades: readonly string[] | null | undefined): Especie[] {
  const lista: Especie[] = [];
  if (atividades?.includes("bovino")) lista.push("bovino");
  if (atividades?.includes("ovino")) lista.push("ovino");
  return lista.length > 0 ? lista : ["bovino"];
}
