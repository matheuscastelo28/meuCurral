import type { jsPDF } from "jspdf";
import { dataCurta, moeda } from "@/lib/formato";
import type { Relatorio } from "@/lib/relatorio";

export type CabecalhoRelatorio = {
  fazenda: string;
  municipio: string;
  produtor: string;
  documento: string;
  caf: string;
  inscricao: string;
};

const VERDE: [number, number, number] = [29, 122, 69];
const VERDE_ESCURO: [number, number, number] = [19, 58, 40];
const CINZA: [number, number, number] = [110, 110, 110];
const MARGEM = 14;

const NOME_ESPECIE = { bovino: "Bovinos", ovino: "Ovinos" } as const;

async function carregarLogo(): Promise<string | null> {
  try {
    const resposta = await fetch("/logo-icon.png");
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
    return await new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => resolve(null);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function numero(n: number) {
  return n.toLocaleString("pt-BR");
}

/**
 * Monta o PDF do relatório (A4 retrato). jsPDF/autotable entram por import
 * dinâmico: só pesam no bundle de quem gera o relatório, e não rodam no SSR.
 */
export async function gerarRelatorioPDF(rel: Relatorio, cab: CabecalhoRelatorio): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf/dist/jspdf.es.min.js"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const logo = await carregarLogo();

  // ---- Cabeçalho -------------------------------------------------------
  doc.setFillColor(...VERDE_ESCURO);
  doc.rect(0, 0, largura, 30, "F");
  if (logo) {
    // Fundo claro: o ícone é escuro e sumiria na faixa verde.
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARGEM, 7, 16, 16, 2.5, 2.5, "F");
    doc.addImage(logo, "PNG", MARGEM + 2, 9, 12, 12);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Relatório do rebanho e da atividade rural", MARGEM + (logo ? 20 : 0), 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Período: ${dataCurta(rel.inicio)} a ${dataCurta(rel.fim)}`,
    MARGEM + (logo ? 20 : 0),
    21,
  );

  const identificacao: [string, string][] = [
    ["Propriedade", cab.fazenda],
    ["Município/UF", cab.municipio],
    ["Produtor(a)", cab.produtor],
    ["CPF/CNPJ", cab.documento],
    ["CAF/DAP", cab.caf],
    ["Inscrição estadual", cab.inscricao],
  ];
  autoTable(doc, {
    startY: 36,
    margin: { left: MARGEM, right: MARGEM },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 32, textColor: CINZA },
      2: { fontStyle: "bold", cellWidth: 32, textColor: CINZA },
    },
    body: [0, 2, 4].map((i) => [
      identificacao[i]![0],
      identificacao[i]![1] || "—",
      identificacao[i + 1]![0],
      identificacao[i + 1]![1] || "—",
    ]),
  });

  let y = posicaoFinal(doc) + 6;

  function titulo(texto: string) {
    if (y > altura - 40) {
      doc.addPage();
      y = 18;
    }
    doc.setTextColor(...VERDE_ESCURO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(texto, MARGEM, y);
    doc.setDrawColor(...VERDE);
    doc.setLineWidth(0.4);
    doc.line(MARGEM, y + 1.5, largura - MARGEM, y + 1.5);
    y += 4;
  }

  function nota(texto: string) {
    doc.setTextColor(...CINZA);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    const linhas = doc.splitTextToSize(texto, largura - 2 * MARGEM);
    if (y + linhas.length * 3.5 > altura - 16) {
      doc.addPage();
      y = 18;
    }
    doc.text(linhas, MARGEM, y);
    y += linhas.length * 3.5 + 3;
  }

  function tabela(
    cabecalho: string[],
    corpo: (string | number)[][],
    opcoes: { rodape?: (string | number)[]; alinharDireita?: number[] } = {},
  ) {
    const colunas: Record<number, { halign: "right" }> = {};
    for (const c of opcoes.alinharDireita ?? []) colunas[c] = { halign: "right" };
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEM, right: MARGEM, bottom: 16 },
      head: [cabecalho],
      body: corpo.map((l) => l.map(String)),
      ...(opcoes.rodape ? { foot: [opcoes.rodape.map(String)] } : {}),
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [235, 242, 237], textColor: VERDE_ESCURO, fontStyle: "bold" },
      columnStyles: colunas,
      // columnStyles só vale pro corpo; cabeçalho e total seguem o mesmo
      // alinhamento pra os números ficarem na mesma coluna visual.
      didParseCell: (celula) => {
        if (celula.section !== "body" && opcoes.alinharDireita?.includes(celula.column.index)) {
          celula.cell.styles.halign = "right";
        }
      },
    });
    y = posicaoFinal(doc) + 7;
  }

  function vazio(texto: string) {
    nota(texto);
    y += 1;
  }

  // ---- 1. Resumo ---------------------------------------------------------
  const soma = (campo: "inicial" | "nascimentos" | "entradas" | "vendas" | "mortes" | "final") =>
    rel.evolucao.reduce((s, l) => s + l[campo], 0);
  titulo("1. Resumo do período");
  const resumo: (string | number)[][] = [
    ["Rebanho no início do período", `${numero(soma("inicial"))} cabeças`],
    ["Nascimentos", numero(soma("nascimentos"))],
    ["Outras entradas (compras e cadastros)", numero(soma("entradas"))],
    ["Vendas de animais", numero(soma("vendas"))],
    ["Mortes", numero(soma("mortes"))],
    ["Rebanho no fim do período", `${numero(soma("final"))} cabeças`],
    ["Receitas realizadas", moeda(rel.totalReceitas)],
    ["Custos e despesas pagos", moeda(rel.totalDespesas)],
    ["Resultado (receitas - custos)", moeda(rel.totalReceitas - rel.totalDespesas)],
  ];
  if (rel.litrosLeite) {
    resumo.push(["Leite produzido", `${numero(Math.round(rel.litrosLeite))} litros`]);
  }
  tabela(["Indicador", "Valor"], resumo, { alinharDireita: [1] });

  // ---- 2. Evolução -------------------------------------------------------
  titulo("2. Evolução do rebanho");
  tabela(
    ["Espécie", "Início", "Nascimentos", "Outras entradas", "Vendas", "Mortes", "Fim"],
    rel.evolucao.map((l) => [
      NOME_ESPECIE[l.especie],
      l.inicial,
      l.nascimentos,
      l.entradas,
      l.vendas,
      l.mortes,
      l.final,
    ]),
    { alinharDireita: [1, 2, 3, 4, 5, 6] },
  );

  // ---- 3. Inventário ------------------------------------------------------
  titulo(`3. Inventário do rebanho em ${dataCurta(rel.fim)}`);
  if (rel.inventario.length === 0) {
    vazio("Nenhum animal no rebanho nessa data.");
  } else {
    const multi = rel.especies.length > 1;
    tabela(
      [...(multi ? ["Espécie"] : []), "Categoria", "Machos", "Fêmeas", "Total"],
      rel.inventario.map((l) => [
        ...(multi ? [NOME_ESPECIE[l.especie]] : []),
        l.categoria,
        l.machos,
        l.femeas,
        l.total,
      ]),
      {
        rodape: [
          ...(multi ? [""] : []),
          "Total",
          rel.inventario.reduce((s, l) => s + l.machos, 0),
          rel.inventario.reduce((s, l) => s + l.femeas, 0),
          rel.inventario.reduce((s, l) => s + l.total, 0),
        ],
        alinharDireita: multi ? [2, 3, 4] : [1, 2, 3],
      },
    );
  }

  // ---- 4. Nascimentos -----------------------------------------------------
  titulo("4. Nascimentos");
  if (rel.nascimentos.length === 0) vazio("Nenhum nascimento registrado no período.");
  else
    tabela(
      ["Data", "Animal", "Brinco", "Categoria", "Sexo", "Observação"],
      rel.nascimentos.map((l) => [
        dataCurta(l.data),
        l.nome,
        l.brinco,
        l.categoria,
        l.sexo,
        l.detalhe,
      ]),
    );

  // ---- 5. Saídas ----------------------------------------------------------
  titulo("5. Saídas: vendas e mortes");
  if (rel.saidas.length === 0) vazio("Nenhuma venda ou morte de animal registrada no período.");
  else
    tabela(
      ["Data", "Animal", "Brinco", "Categoria", "Sexo", "Motivo"],
      rel.saidas.map((l) => [dataCurta(l.data), l.nome, l.brinco, l.categoria, l.sexo, l.detalhe]),
    );

  // ---- 6. Receitas e custos ----------------------------------------------
  titulo("6. Receitas e custos");
  if (rel.receitas.length === 0) vazio("Nenhuma receita realizada no período.");
  else
    tabela(
      ["Receitas por categoria", "Valor"],
      rel.receitas.map((l) => [l.categoria, moeda(l.valor)]),
      { rodape: ["Total de receitas", moeda(rel.totalReceitas)], alinharDireita: [1] },
    );
  if (rel.despesas.length === 0) vazio("Nenhum custo pago no período.");
  else
    tabela(
      ["Custos por categoria", "Valor"],
      rel.despesas.map((l) => [l.categoria, moeda(l.valor)]),
      { rodape: ["Total de custos", moeda(rel.totalDespesas)], alinharDireita: [1] },
    );

  // ---- 7. Sanidade --------------------------------------------------------
  titulo("7. Sanidade: vacinas, vermífugos e tratamentos");
  if (rel.sanidade.length === 0) vazio("Nenhuma aplicação registrada no período.");
  else
    tabela(
      ["Data", "Tipo", "Produto", "Animais"],
      rel.sanidade.map((l) => [dataCurta(l.data), l.tipo, l.produto, l.animais]),
      { alinharDireita: [3] },
    );

  // ---- Notas e assinatura -------------------------------------------------
  nota(
    "Notas: valores financeiros consideram o que foi efetivamente recebido ou pago no período. " +
      "A data de venda ou morte é a data em que a saída foi registrada no sistema. " +
      "Animais sem data de nascimento contam a partir da data de cadastro. " +
      "A categoria exibida é a categoria atual de cada animal.",
  );

  if (y > altura - 50) {
    doc.addPage();
    y = 24;
  }
  y += 4;
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    doc.splitTextToSize(
      "Declaro, para os devidos fins, que as informações acima correspondem à realidade da minha atividade rural no período informado.",
      largura - 2 * MARGEM,
    ),
    MARGEM,
    y,
  );
  y += 22;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.line(MARGEM, y, MARGEM + 80, y);
  doc.line(largura - MARGEM - 60, y, largura - MARGEM, y);
  doc.setFontSize(8.5);
  doc.text(cab.produtor || "Assinatura do(a) produtor(a)", MARGEM, y + 4.5);
  doc.text("Local e data", largura - MARGEM - 60, y + 4.5);

  // ---- Rodapé em todas as páginas -----------------------------------------
  const paginas = doc.getNumberOfPages();
  const emitido = new Date().toLocaleDateString("pt-BR");
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(`Gerado pelo Curral Online em ${emitido}`, MARGEM, altura - 8);
    doc.text(`Página ${p} de ${paginas}`, largura - MARGEM, altura - 8, { align: "right" });
  }

  return doc.output("blob");
}

function posicaoFinal(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
}

/**
 * Entrega o PDF: no celular, a folha de compartilhar do sistema (WhatsApp,
 * e-mail, salvar em arquivos) quando disponível; senão, download direto.
 */
export async function entregarPDF(blob: Blob, nomeArquivo: string, compartilhar: boolean) {
  const arquivo = new File([blob], nomeArquivo, { type: "application/pdf" });
  if (
    compartilhar &&
    typeof navigator !== "undefined" &&
    navigator.canShare?.({ files: [arquivo] })
  ) {
    try {
      await navigator.share({ files: [arquivo], title: nomeArquivo });
      return;
    } catch (erro) {
      if ((erro as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function podeCompartilharArquivo() {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({
      files: [new File([new Blob(["x"])], "teste.pdf", { type: "application/pdf" })],
    });
  } catch {
    return false;
  }
}
