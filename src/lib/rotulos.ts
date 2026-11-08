// Valores gravados no banco não têm acento (ex: "lactacao") — o que aparece
// na tela sempre passa por aqui.

const STATUS_ROTULO: Record<string, string> = {
  ativo: "Ativo",
  lactacao: "Em lactação",
  seca: "Seca",
  prenhe: "Prenhe",
  engorda: "Confinamento",
  vendido: "Vendido",
  morto: "Morto",
};

const SEXO_ROTULO: Record<string, string> = {
  femea: "Fêmea",
  macho: "Macho",
  castrado: "Castrado",
};

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function rotuloStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_ROTULO[status] ?? capitalizar(status);
}

export function rotuloSexo(sexo: string | null | undefined): string {
  if (!sexo) return "—";
  return SEXO_ROTULO[sexo] ?? capitalizar(sexo);
}

export function rotuloCategoria(categoria: string | null | undefined): string {
  if (!categoria) return "—";
  return capitalizar(categoria);
}

export function rotuloTurno(turno: string | null | undefined): string {
  if (turno === "manha") return "Manhã";
  if (turno === "tarde") return "Tarde";
  if (turno === "noite") return "Noite";
  return "—";
}

export const CATEGORIAS_DESPESA = [
  { valor: "racao", rotulo: "Alimentação / ração" },
  { valor: "sanidade", rotulo: "Sanidade e reprodução (vacina, remédio, sêmen)" },
  { valor: "compra", rotulo: "Compra de animais" },
  { valor: "mao_de_obra", rotulo: "Mão de obra" },
  { valor: "manutencao", rotulo: "Manutenção / combustível" },
  { valor: "energia", rotulo: "Energia / água" },
  { valor: "impostos", rotulo: "Impostos / taxas" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export const CATEGORIAS_RECEITA = [
  { valor: "venda_leite", rotulo: "Venda de leite" },
  { valor: "venda_boi", rotulo: "Venda de bovinos" },
  { valor: "venda_ovino", rotulo: "Venda de ovinos" },
  { valor: "venda_derivados", rotulo: "Venda de derivados" },
  { valor: "outro", rotulo: "Outra receita" },
] as const;

export function rotuloCategoriaFinanceira(categoria: string | null | undefined): string {
  if (!categoria) return "Sem categoria";
  const todas = [...CATEGORIAS_DESPESA, ...CATEGORIAS_RECEITA];
  const achada = todas.find((c) => c.valor === categoria);
  if (achada) return achada.rotulo;
  if (categoria.startsWith("venda_")) return `Venda de ${categoria.slice(6)}`;
  return capitalizar(categoria);
}

/** "Lote A" já diz que é lote; "Pasto 2" vira "lote Pasto 2". */
export function textoLote(nome: string): string {
  return /^lote\b/i.test(nome.trim()) ? nome.trim() : `lote ${nome.trim()}`;
}
