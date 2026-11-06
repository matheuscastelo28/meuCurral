import { dataCurta } from "@/lib/formato";
import type { Relatorio } from "@/lib/relatorio";
import { construirXLSXAbas, type AbaXLSX, type CelulaXLSX } from "@/lib/xlsx";
import type { CabecalhoRelatorio } from "@/lib/relatorio-pdf";

const NOME_ESPECIE = { bovino: "Bovinos", ovino: "Ovinos" } as const;

/**
 * Mesmo conteúdo do PDF, em planilha: uma aba por seção, com números de
 * verdade (dá pra somar, filtrar e conferir no Excel) e valores em reais.
 */
export function gerarRelatorioXLSX(rel: Relatorio, cab: CabecalhoRelatorio): Uint8Array {
  const soma = (campo: "inicial" | "nascimentos" | "entradas" | "vendas" | "mortes" | "final") =>
    rel.evolucao.reduce((s, l) => s + l[campo], 0);
  const dinheiro = (valor: number): CelulaXLSX => ({ valor, moeda: true });

  const resumo: CelulaXLSX[][] = [
    ["Propriedade", cab.fazenda || null],
    ["Município/UF", cab.municipio || null],
    ["Produtor(a)", cab.produtor || null],
    ["CPF/CNPJ", cab.documento || null],
    ["CAF/DAP", cab.caf || null],
    ["Inscrição estadual", cab.inscricao || null],
    ["Período", `${dataCurta(rel.inicio)} a ${dataCurta(rel.fim)}`],
    [null, null],
    ["Rebanho no início do período (cabeças)", soma("inicial")],
    ["Nascimentos", soma("nascimentos")],
    ["Outras entradas (compras e cadastros)", soma("entradas")],
    ["Vendas de animais", soma("vendas")],
    ["Mortes", soma("mortes")],
    ["Rebanho no fim do período (cabeças)", soma("final")],
    ["Receitas realizadas", dinheiro(rel.totalReceitas)],
    ["Custos e despesas pagos", dinheiro(rel.totalDespesas)],
    ["Resultado (receitas - custos)", dinheiro(rel.totalReceitas - rel.totalDespesas)],
  ];
  if (rel.litrosLeite) resumo.push(["Leite produzido (litros)", Math.round(rel.litrosLeite)]);

  const multi = rel.especies.length > 1;
  const animais = (linhas: Relatorio["nascimentos"]): CelulaXLSX[][] =>
    linhas.map((l) => [dataCurta(l.data), l.nome, l.brinco, l.categoria, l.sexo, l.detalhe]);

  const abas: AbaXLSX[] = [
    { nome: "Resumo", colunas: ["Indicador", "Valor"], linhas: resumo, larguras: [40, 30] },
    {
      nome: "Evolução do rebanho",
      colunas: ["Espécie", "Início", "Nascimentos", "Outras entradas", "Vendas", "Mortes", "Fim"],
      linhas: rel.evolucao.map((l) => [
        NOME_ESPECIE[l.especie],
        l.inicial,
        l.nascimentos,
        l.entradas,
        l.vendas,
        l.mortes,
        l.final,
      ]),
    },
    {
      nome: `Inventário ${dataCurta(rel.fim).replace(/\//g, "-")}`,
      colunas: [...(multi ? ["Espécie"] : []), "Categoria", "Machos", "Fêmeas", "Total"],
      linhas: [
        ...rel.inventario.map((l): CelulaXLSX[] => [
          ...(multi ? [NOME_ESPECIE[l.especie]] : []),
          l.categoria,
          l.machos,
          l.femeas,
          l.total,
        ]),
        ...(rel.inventario.length
          ? [
              [
                ...(multi ? [""] : []),
                "Total",
                rel.inventario.reduce((s, l) => s + l.machos, 0),
                rel.inventario.reduce((s, l) => s + l.femeas, 0),
                rel.inventario.reduce((s, l) => s + l.total, 0),
              ] as CelulaXLSX[],
            ]
          : []),
      ],
    },
    {
      nome: "Nascimentos",
      colunas: ["Data", "Animal", "Brinco", "Categoria", "Sexo", "Observação"],
      linhas: animais(rel.nascimentos),
    },
    {
      nome: "Saídas",
      colunas: ["Data", "Animal", "Brinco", "Categoria", "Sexo", "Motivo"],
      linhas: animais(rel.saidas),
    },
    {
      nome: "Receitas",
      colunas: ["Categoria", "Valor"],
      linhas: [
        ...rel.receitas.map((l): CelulaXLSX[] => [l.categoria, dinheiro(l.valor)]),
        ...(rel.receitas.length
          ? [["Total de receitas", dinheiro(rel.totalReceitas)] as CelulaXLSX[]]
          : []),
      ],
    },
    {
      nome: "Custos",
      colunas: ["Categoria", "Valor"],
      linhas: [
        ...rel.despesas.map((l): CelulaXLSX[] => [l.categoria, dinheiro(l.valor)]),
        ...(rel.despesas.length
          ? [["Total de custos", dinheiro(rel.totalDespesas)] as CelulaXLSX[]]
          : []),
      ],
    },
    {
      nome: "Sanidade",
      colunas: ["Data", "Tipo", "Produto", "Animais"],
      linhas: rel.sanidade.map((l) => [dataCurta(l.data), l.tipo, l.produto, l.animais]),
    },
  ];
  return construirXLSXAbas(abas);
}
