import { dataISO, paraDataISO } from "@/lib/formato";
import { especieDoAnimal, type Especie } from "@/lib/especies";
import { rotuloCategoria, rotuloCategoriaFinanceira, rotuloSexo } from "@/lib/rotulos";

/**
 * Relatório do período pra banco/cooperativa (Pronaf e afins): evolução e
 * inventário do rebanho, nascimentos, saídas, receitas/custos e sanidade.
 *
 * Limites do que o sistema guarda, assumidos aqui e explicados no PDF:
 * - não há data de saída própria: venda/morte usa a data em que o status
 *   foi gravado (updated_at);
 * - o animal "existe" a partir do nascimento; sem nascimento, a partir do
 *   cadastro — assim quem cadastra o rebanho todo hoje não aparece com
 *   rebanho inicial zerado;
 * - a categoria é a atual (não há histórico de categoria).
 */

export type AnimalRelatorio = {
  id: string;
  nome: string | null;
  brinco: string | null;
  especie: string | null;
  categoria: string | null;
  sexo: string | null;
  status: string | null;
  nascimento: string | Date | null;
  mae: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export type LancamentoRelatorio = {
  tipo: string | null;
  categoria: string | null;
  valor: string | number;
  status: string | null;
};

export type ParcelaPagaRelatorio = {
  valor: string | number;
  tipo: "a_receber" | "a_pagar";
  categoria: string | null;
};

export type ManejoRelatorio = {
  animal_id: string | null;
  tipo: string | null;
  descricao: string | null;
  data: string | Date;
};

export type DadosBrutos = {
  animais: AnimalRelatorio[];
  lancamentos: LancamentoRelatorio[];
  parcelasPagas: ParcelaPagaRelatorio[];
  manejos: ManejoRelatorio[];
  litrosLeite: number | null;
};

export type LinhaEvolucao = {
  especie: Especie;
  inicial: number;
  nascimentos: number;
  entradas: number;
  vendas: number;
  mortes: number;
  final: number;
};

export type LinhaInventario = {
  especie: Especie;
  categoria: string;
  machos: number;
  femeas: number;
  total: number;
};

export type LinhaAnimal = {
  data: string;
  nome: string;
  brinco: string;
  categoria: string;
  sexo: string;
  detalhe: string;
};

export type LinhaValor = { categoria: string; valor: number };

export type LinhaSanidade = { data: string; tipo: string; produto: string; animais: number };

export type Relatorio = {
  inicio: string;
  fim: string;
  especies: Especie[];
  evolucao: LinhaEvolucao[];
  inventario: LinhaInventario[];
  nascimentos: LinhaAnimal[];
  saidas: LinhaAnimal[];
  receitas: LinhaValor[];
  despesas: LinhaValor[];
  totalReceitas: number;
  totalDespesas: number;
  sanidade: LinhaSanidade[];
  litrosLeite: number | null;
};

const ROTULO_TIPO_MANEJO: Record<string, string> = {
  vacina: "Vacina",
  vermifugo: "Vermífugo",
  tratamento: "Tratamento",
};

/** Carimbo de hora (created_at/updated_at) no dia local, não em UTC. */
function diaLocal(carimbo: string | Date) {
  return paraDataISO(new Date(carimbo));
}

function inicioDoAnimal(a: AnimalRelatorio) {
  return a.nascimento ? dataISO(a.nascimento) : diaLocal(a.created_at);
}

function saidaDoAnimal(a: AnimalRelatorio) {
  return a.status === "vendido" || a.status === "morto" ? diaLocal(a.updated_at) : null;
}

/** Estava no rebanho ao fim do dia `dia`? */
function presenteEm(a: AnimalRelatorio, dia: string) {
  const saida = saidaDoAnimal(a);
  return inicioDoAnimal(a) <= dia && (saida === null || saida > dia);
}

function diaAnterior(iso: string) {
  const [a = 0, m = 1, d = 1] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d - 1));
  return data.toISOString().slice(0, 10);
}

function linhaAnimal(a: AnimalRelatorio, data: string, detalhe: string): LinhaAnimal {
  return {
    data,
    nome: a.nome ?? "—",
    brinco: a.brinco ?? "—",
    categoria: rotuloCategoria(a.categoria),
    sexo: rotuloSexo(a.sexo),
    detalhe,
  };
}

function agrupar(itens: { categoria: string | null; valor: number }[]): LinhaValor[] {
  const mapa = new Map<string, number>();
  for (const i of itens) {
    const rotulo = rotuloCategoriaFinanceira(i.categoria);
    mapa.set(rotulo, (mapa.get(rotulo) ?? 0) + i.valor);
  }
  return Array.from(mapa, ([categoria, valor]) => ({ categoria, valor }))
    .filter((l) => l.valor > 0)
    .sort((x, y) => y.valor - x.valor);
}

export function montarRelatorio(
  bruto: DadosBrutos,
  inicio: string,
  fim: string,
  especies: Especie[],
): Relatorio {
  const animais = bruto.animais.filter((a) => especies.includes(especieDoAnimal(a)));
  const naJanela = (iso: string | null) => iso !== null && iso >= inicio && iso <= fim;
  const vespera = diaAnterior(inicio);

  const evolucao = especies.map((especie) => {
    const daEspecie = animais.filter((a) => especieDoAnimal(a) === especie);
    const inicial = daEspecie.filter((a) => presenteEm(a, vespera)).length;
    const final = daEspecie.filter((a) => presenteEm(a, fim)).length;
    const nascimentos = daEspecie.filter(
      (a) => a.nascimento && naJanela(dataISO(a.nascimento)),
    ).length;
    const entradas = daEspecie.filter(
      (a) => !a.nascimento && naJanela(diaLocal(a.created_at)),
    ).length;
    const saidasPeriodo = daEspecie.filter(
      (a) => naJanela(saidaDoAnimal(a)) && inicioDoAnimal(a) <= fim,
    );
    return {
      especie,
      inicial,
      nascimentos,
      entradas,
      vendas: saidasPeriodo.filter((a) => a.status === "vendido").length,
      mortes: saidasPeriodo.filter((a) => a.status === "morto").length,
      final,
    };
  });

  const mapaInventario = new Map<string, LinhaInventario>();
  for (const a of animais.filter((x) => presenteEm(x, fim))) {
    const especie = especieDoAnimal(a);
    const categoria = rotuloCategoria(a.categoria);
    const chave = `${especie}|${categoria}`;
    const linha = mapaInventario.get(chave) ?? {
      especie,
      categoria,
      machos: 0,
      femeas: 0,
      total: 0,
    };
    if (a.sexo === "macho") linha.machos += 1;
    else linha.femeas += 1;
    linha.total += 1;
    mapaInventario.set(chave, linha);
  }
  const inventario = Array.from(mapaInventario.values()).sort(
    (x, y) => x.especie.localeCompare(y.especie) || y.total - x.total,
  );

  const nascimentos = animais
    .filter((a) => a.nascimento && naJanela(dataISO(a.nascimento)))
    .map((a) => linhaAnimal(a, dataISO(a.nascimento), a.mae ? `Mãe: ${a.mae}` : ""))
    .sort((x, y) => x.data.localeCompare(y.data));

  const saidas = animais
    .filter((a) => naJanela(saidaDoAnimal(a)) && inicioDoAnimal(a) <= fim)
    .map((a) => linhaAnimal(a, saidaDoAnimal(a)!, a.status === "morto" ? "Morte" : "Venda"))
    .sort((x, y) => x.data.localeCompare(y.data));

  const realizado = (l: LancamentoRelatorio) =>
    l.status !== "a_receber" && l.status !== "a_pagar" && l.status !== "cancelado";
  const receitas = agrupar([
    ...bruto.lancamentos
      .filter((l) => l.tipo === "receita" && realizado(l))
      .map((l) => ({ categoria: l.categoria, valor: Number(l.valor) })),
    ...bruto.parcelasPagas
      .filter((p) => p.tipo === "a_receber")
      .map((p) => ({ categoria: p.categoria, valor: Number(p.valor) })),
  ]);
  const despesas = agrupar([
    ...bruto.lancamentos
      .filter((l) => l.tipo === "despesa" && realizado(l))
      .map((l) => ({ categoria: l.categoria, valor: Number(l.valor) })),
    ...bruto.parcelasPagas
      .filter((p) => p.tipo === "a_pagar")
      .map((p) => ({ categoria: p.categoria, valor: Number(p.valor) })),
  ]);

  // Uma linha por aplicação (mesmo dia + produto), contando os animais —
  // a aplicação no rebanho grava um manejo por animal.
  const idsVisiveis = new Set(animais.map((a) => a.id));
  const mapaSanidade = new Map<string, LinhaSanidade>();
  for (const m of bruto.manejos) {
    if (!m.tipo || !ROTULO_TIPO_MANEJO[m.tipo]) continue;
    if (m.animal_id && !idsVisiveis.has(m.animal_id)) continue;
    const data = dataISO(m.data);
    const produto = (m.descricao ?? "").trim() || "—";
    const chave = `${data}|${m.tipo}|${produto.toLowerCase()}`;
    const linha = mapaSanidade.get(chave) ?? {
      data,
      tipo: ROTULO_TIPO_MANEJO[m.tipo]!,
      produto,
      animais: 0,
    };
    linha.animais += 1;
    mapaSanidade.set(chave, linha);
  }

  return {
    inicio,
    fim,
    especies,
    evolucao,
    inventario,
    nascimentos,
    saidas,
    receitas,
    despesas,
    totalReceitas: receitas.reduce((s, l) => s + l.valor, 0),
    totalDespesas: despesas.reduce((s, l) => s + l.valor, 0),
    sanidade: Array.from(mapaSanidade.values()).sort((x, y) => x.data.localeCompare(y.data)),
    litrosLeite: bruto.litrosLeite,
  };
}
