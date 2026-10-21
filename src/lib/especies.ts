/**
 * Categorias e raças por espécie — usado pra separar bovino/ovino em várias
 * telas (Rebanho, Confinamento, Reprodução) sempre que a fazenda tem as
 * duas atividades ao mesmo tempo. A categoria do animal é o único sinal de
 * espécie que já existe no cadastro (não há coluna "espécie" exposta na UI).
 */

export const CATEGORIAS_BOVINO = ["bezerro", "novilha", "vaca", "boi", "touro"] as const;
export const CATEGORIAS_OVINO = ["cordeiro", "borrega", "ovelha", "carneiro"] as const;
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
