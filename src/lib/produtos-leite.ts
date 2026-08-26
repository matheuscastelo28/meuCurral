export const PRODUTOS_LEITE = [
  { valor: "leite", rotulo: "Leite", unidade: "L" },
  { valor: "queijo", rotulo: "Queijo", unidade: "kg" },
  { valor: "manteiga", rotulo: "Manteiga", unidade: "kg" },
  { valor: "requeijao", rotulo: "Requeijão", unidade: "kg" },
  { valor: "doce_de_leite", rotulo: "Doce de leite", unidade: "kg" },
  { valor: "iogurte", rotulo: "Iogurte", unidade: "L" },
  { valor: "ricota", rotulo: "Ricota", unidade: "kg" },
] as const;

export function rotuloProduto(valor: string) {
  return PRODUTOS_LEITE.find((p) => p.valor === valor)?.rotulo ?? valor;
}

export function unidadeProduto(valor: string) {
  return PRODUTOS_LEITE.find((p) => p.valor === valor)?.unidade ?? "un";
}
