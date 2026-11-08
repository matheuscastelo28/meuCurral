import { dataCurta } from "@/lib/formato";
import type { Relatorio } from "@/lib/relatorio";
import { construirXLSXAbas, type AbaXLSX, type CelulaXLSX, type LinhaXLSX } from "@/lib/xlsx";
import type { CabecalhoRelatorio } from "@/lib/relatorio-pdf";

const NOME_ESPECIE = { bovino: "Bovinos", ovino: "Ovinos" } as const;

const NOTAS =
  "Valores financeiros consideram o que foi efetivamente recebido ou pago no período. " +
  "A data de venda ou morte é a data em que a saída foi registrada no sistema. " +
  "Animais sem data de nascimento contam a partir da data de cadastro. " +
  "A categoria exibida é a categoria atual de cada animal.";

/**
 * Mesmo conteúdo do PDF, em planilha: uma aba por seção, com números de
 * verdade (dá pra somar, filtrar e conferir no Excel) e valores em reais.
 */
export function gerarRelatorioXLSX(rel: Relatorio, cab: CabecalhoRelatorio): Uint8Array {
  const soma = (campo: "inicial" | "nascimentos" | "entradas" | "vendas" | "mortes" | "final") =>
    rel.evolucao.reduce((s, l) => s + l[campo], 0);
  const dinheiro = (valor: number): CelulaXLSX => ({ valor, moeda: true });

  const periodo = `${dataCurta(rel.inicio)} a ${dataCurta(rel.fim)}`;
  const emitido = new Date().toLocaleDateString("pt-BR");
  const nomeFazenda = cab.fazenda || "Propriedade";
  const subtitulo = `Período: ${periodo}  ·  Gerado pelo Curral Online em ${emitido}`;
  const aba = (
    nome: string,
    titulo: string,
    corpo: Omit<AbaXLSX, "nome" | "titulo" | "subtitulo">,
  ): AbaXLSX => ({ nome, titulo: `${nomeFazenda}  ·  ${titulo}`, subtitulo, ...corpo });

  const identificacao: LinhaXLSX[] = [
    { secao: "Identificação" },
    ["Propriedade", cab.fazenda || "—"],
    ["Município/UF", cab.municipio || "—"],
    ["Produtor(a)", cab.produtor || "—"],
    ["CPF/CNPJ", cab.documento || "—"],
    ["CAF/DAP", cab.caf || "—"],
    ["Inscrição estadual", cab.inscricao || "—"],
    ["Período do relatório", periodo],
  ];
  const resumo: LinhaXLSX[] = [
    ...identificacao,
    { secao: "Rebanho" },
    ["Rebanho no início do período (cabeças)", soma("inicial")],
    ["Nascimentos", soma("nascimentos")],
    ["Outras entradas (compras e cadastros)", soma("entradas")],
    ["Vendas de animais", soma("vendas")],
    ["Mortes", soma("mortes")],
    { total: ["Rebanho no fim do período (cabeças)", soma("final")] },
    { secao: "Financeiro" },
    ["Receitas realizadas", dinheiro(rel.totalReceitas)],
    ["Custos e despesas pagos", dinheiro(rel.totalDespesas)],
    { total: ["Resultado (receitas - custos)", dinheiro(rel.totalReceitas - rel.totalDespesas)] },
  ];
  if (rel.litrosLeite) {
    resumo.push({ secao: "Produção" }, ["Leite produzido (litros)", Math.round(rel.litrosLeite)]);
  }

  const multi = rel.especies.length > 1;
  const animais = (linhas: Relatorio["nascimentos"]): CelulaXLSX[][] =>
    linhas.map((l) => [dataCurta(l.data), l.nome, l.brinco, l.categoria, l.sexo, l.detalhe]);
  const fimIso = dataCurta(rel.fim).replace(/\//g, "-");

  const abas: AbaXLSX[] = [
    aba("Resumo", "Relatório do rebanho e da atividade rural", {
      colunas: ["Indicador", "Valor"],
      linhas: resumo,
      colunasDireita: [1],
      larguras: [48, 34],
      notas: [`Notas: ${NOTAS}`],
    }),
    aba("Evolução do rebanho", "Evolução do rebanho", {
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
      larguras: [22, 14, 16, 18, 14, 14, 14],
      vazio: "Nenhum animal no período.",
    }),
    aba(`Inventário ${fimIso}`, `Inventário do rebanho em ${dataCurta(rel.fim)}`, {
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
              {
                total: [
                  ...(multi ? [""] : []),
                  "Total",
                  rel.inventario.reduce((s, l) => s + l.machos, 0),
                  rel.inventario.reduce((s, l) => s + l.femeas, 0),
                  rel.inventario.reduce((s, l) => s + l.total, 0),
                ] as CelulaXLSX[],
              },
            ]
          : []),
      ],
      vazio: "Nenhum animal no rebanho nessa data.",
    }),
    aba("Nascimentos", "Nascimentos", {
      colunas: ["Data", "Animal", "Brinco", "Categoria", "Sexo", "Observação"],
      linhas: animais(rel.nascimentos),
      larguras: [14, 26, 14, 20, 12, 36],
      vazio: "Nenhum nascimento registrado no período.",
    }),
    aba("Saídas", "Saídas: vendas e mortes", {
      colunas: ["Data", "Animal", "Brinco", "Categoria", "Sexo", "Motivo"],
      linhas: animais(rel.saidas),
      larguras: [14, 26, 14, 20, 12, 36],
      vazio: "Nenhuma venda ou morte de animal registrada no período.",
    }),
    aba("Receitas", "Receitas por categoria", {
      colunas: ["Categoria", "Valor"],
      linhas: [
        ...rel.receitas.map((l): CelulaXLSX[] => [l.categoria, dinheiro(l.valor)]),
        ...(rel.receitas.length
          ? [{ total: ["Total de receitas", dinheiro(rel.totalReceitas)] as CelulaXLSX[] }]
          : []),
      ],
      larguras: [44, 20],
      vazio: "Nenhuma receita realizada no período.",
    }),
    aba("Custos", "Custos por categoria", {
      colunas: ["Categoria", "Valor"],
      linhas: [
        ...rel.despesas.map((l): CelulaXLSX[] => [l.categoria, dinheiro(l.valor)]),
        ...(rel.despesas.length
          ? [{ total: ["Total de custos", dinheiro(rel.totalDespesas)] as CelulaXLSX[] }]
          : []),
      ],
      larguras: [44, 20],
      vazio: "Nenhum custo pago no período.",
    }),
    aba("Sanidade", "Sanidade: vacinas, vermífugos e tratamentos", {
      colunas: ["Data", "Tipo", "Produto", "Animais"],
      linhas: rel.sanidade.map((l) => [dataCurta(l.data), l.tipo, l.produto, l.animais]),
      larguras: [14, 18, 40, 12],
      vazio: "Nenhuma aplicação registrada no período.",
    }),
  ];
  return construirXLSXAbas(abas);
}
