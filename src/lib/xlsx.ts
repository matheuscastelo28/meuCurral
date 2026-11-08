import { zipSync, strToU8 } from "fflate";

/**
 * Gerador de .xlsx (OOXML) sem dependência externa. Reaproveita o fflate (já
 * usado em exportar.ts) pra zipar as partes XML. Textos vão como "inline
 * string"; números são células numéricas de verdade (somam e filtram no Excel).
 *
 * Visual (paleta do Curral Online): faixa de título verde-escura, cabeçalho
 * verde, linhas zebradas com borda suave, totais em destaque, sem linhas de
 * grade, primeira linha da tabela fixa e página A4 paisagem ajustada à largura.
 */

const VERDE_ESCURO = "FF133A28";
const VERDE = "FF1D7A45";
const VERDE_CLARO = "FFE3EFE7";
const ZEBRA = "FFF5F9F6";
const BORDA = "FFD5DFD8";
const CINZA = "FF6B7A70";
const TEXTO = "FF1F2A24";

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A, B, ..., Z, AA, AB, ... */
function colunaLetra(indice: number): string {
  let n = indice + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/** Valor em reais: número de verdade no Excel, mostrado como R$ 1.234,56. */
export type CelulaMoeda = { valor: number; moeda: true };
export type CelulaXLSX = string | number | null | CelulaMoeda;
export type LinhaXLSX = CelulaXLSX[] | { secao: string } | { total: CelulaXLSX[] };

export type AbaXLSX = {
  nome: string;
  /** Faixa de título no topo da aba (e subtítulo logo abaixo). */
  titulo?: string;
  subtitulo?: string;
  colunas: string[];
  linhas: LinhaXLSX[];
  /** Colunas (0 = A) alinhadas à direita; as só de números já vão sozinhas. */
  colunasDireita?: number[];
  /** Larguras em caracteres; sem isso, calcula pelo conteúdo. */
  larguras?: number[];
  /** Texto cinza quando a tabela não tem linhas. */
  vazio?: string;
  /** Observações em cinza, abaixo da tabela. */
  notas?: string[];
};

// ---------------------------------------------------------------------------
// Estilos: registro com dedup, pra montar styles.xml só com o que foi usado.
// ---------------------------------------------------------------------------

type Fonte = { tam?: number; negrito?: boolean; italico?: boolean; cor?: string };
type EstiloCelula = {
  fonte?: Fonte;
  fundo?: string;
  borda?: "baixo" | "total";
  fmt?: "inteiro" | "decimal" | "moeda";
  alinhar?: "left" | "right" | "center";
  recuo?: number;
  quebrar?: boolean;
};

const FORMATOS = {
  inteiro: { id: 3 },
  decimal: { id: 4 },
  moeda: { id: 164, codigo: '"R$" #,##0.00;[Red]-"R$" #,##0.00' },
} as const;

class Estilos {
  private fontes: string[] = [];
  private fundos: string[] = [];
  private bordas: string[] = [];
  private xfs: string[] = [];
  private mapa = new Map<string, number>();
  private usaMoeda = false;

  constructor() {
    this.indice(this.fontes, fonteXml({ cor: TEXTO }));
    this.indice(this.fundos, '<fill><patternFill patternType="none"/></fill>');
    this.indice(this.fundos, '<fill><patternFill patternType="gray125"/></fill>');
    this.indice(this.bordas, "<border><left/><right/><top/><bottom/><diagonal/></border>");
    this.id({}); // xf 0 = padrão
  }

  private indice(lista: string[], xml: string): number {
    const i = lista.indexOf(xml);
    if (i >= 0) return i;
    lista.push(xml);
    return lista.length - 1;
  }

  id(e: EstiloCelula): number {
    const chave = JSON.stringify(e);
    const existente = this.mapa.get(chave);
    if (existente !== undefined) return existente;
    const fonte = this.indice(this.fontes, fonteXml({ cor: TEXTO, ...e.fonte }));
    const fundo = e.fundo
      ? this.indice(
          this.fundos,
          `<fill><patternFill patternType="solid"><fgColor rgb="${e.fundo}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const borda = e.borda
      ? this.indice(
          this.bordas,
          e.borda === "total"
            ? `<border><left/><right/><top style="thin"><color rgb="${VERDE}"/></top><bottom style="thin"><color rgb="${VERDE}"/></bottom><diagonal/></border>`
            : `<border><left/><right/><top/><bottom style="thin"><color rgb="${BORDA}"/></bottom><diagonal/></border>`,
        )
      : 0;
    const fmt = e.fmt ? FORMATOS[e.fmt].id : 0;
    if (e.fmt === "moeda") this.usaMoeda = true;
    const alinhamento =
      e.alinhar || e.recuo || e.quebrar
        ? `<alignment vertical="center"${e.alinhar ? ` horizontal="${e.alinhar}"` : ""}${e.recuo ? ` indent="${e.recuo}"` : ""}${e.quebrar ? ' wrapText="1"' : ""}/>`
        : "";
    const xf =
      `<xf numFmtId="${fmt}" fontId="${fonte}" fillId="${fundo}" borderId="${borda}" xfId="0"` +
      `${fmt ? ' applyNumberFormat="1"' : ""}${fonte ? ' applyFont="1"' : ""}${fundo ? ' applyFill="1"' : ""}` +
      `${borda ? ' applyBorder="1"' : ""}${alinhamento ? ' applyAlignment="1">' + alinhamento + "</xf>" : "/>"}`;
    this.xfs.push(xf);
    const novo = this.xfs.length - 1;
    this.mapa.set(chave, novo);
    return novo;
  }

  xml(): string {
    const numFmts = this.usaMoeda
      ? `<numFmts count="1"><numFmt numFmtId="164" formatCode="${escaparXml(FORMATOS.moeda.codigo)}"/></numFmts>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${numFmts}<fonts count="${this.fontes.length}">${this.fontes.join("")}</fonts>
<fills count="${this.fundos.length}">${this.fundos.join("")}</fills>
<borders count="${this.bordas.length}">${this.bordas.join("")}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }
}

function fonteXml(f: Fonte): string {
  return `<font>${f.negrito ? "<b/>" : ""}${f.italico ? "<i/>" : ""}<sz val="${f.tam ?? 11}"/><color rgb="${f.cor ?? TEXTO}"/><name val="Calibri"/></font>`;
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

function nomeDeAba(nome: string, usados: Set<string>): string {
  const base =
    nome
      .replace(/[\\/?*[\]:]/g, " ")
      .trim()
      .slice(0, 31) || "Planilha";
  let final = base;
  let n = 2;
  while (usados.has(final.toLowerCase())) {
    const sufixo = ` ${n++}`;
    final = base.slice(0, 31 - sufixo.length) + sufixo;
  }
  usados.add(final.toLowerCase());
  return final;
}

function tipoCelula(v: CelulaXLSX): "vazio" | "texto" | "numero" | "moeda" {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "object") return "moeda";
  if (typeof v === "number" && Number.isFinite(v)) return "numero";
  return "texto";
}

function textoDaCelula(v: CelulaXLSX): string {
  const t = tipoCelula(v);
  if (t === "vazio") return "";
  if (t === "moeda") return "R$ 0.000,00";
  return String(v);
}

function xmlDaAba(aba: AbaXLSX, est: Estilos): string {
  const nCols = aba.colunas.length;
  const ultimaCol = colunaLetra(nCols - 1);
  const linhasXml: string[] = [];
  const mesclar: string[] = [];
  let r = 0;

  const celulaTexto = (c: number, linha: number, texto: string, estilo: number) =>
    `<c r="${colunaLetra(c)}${linha}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
  const celulaVazia = (c: number, linha: number, estilo: number) =>
    `<c r="${colunaLetra(c)}${linha}" s="${estilo}"/>`;
  const linha = (n: number, celulas: string, altura?: number) =>
    `<row r="${n}"${altura ? ` ht="${altura}" customHeight="1"` : ""}>${celulas}</row>`;

  // Faixa de título + subtítulo (mescladas na largura da tabela).
  if (aba.titulo) {
    r++;
    const sTitulo = est.id({
      fonte: { tam: 16, negrito: true, cor: "FFFFFFFF" },
      fundo: VERDE_ESCURO,
      alinhar: "left",
      recuo: 1,
    });
    let cel = celulaTexto(0, r, aba.titulo, sTitulo);
    for (let c = 1; c < nCols; c++) cel += celulaVazia(c, r, sTitulo);
    linhasXml.push(linha(r, cel, 32));
    if (nCols > 1) mesclar.push(`A${r}:${ultimaCol}${r}`);
    if (aba.subtitulo) {
      r++;
      const sSub = est.id({
        fonte: { tam: 10, cor: "FFCFE5D6" },
        fundo: VERDE_ESCURO,
        alinhar: "left",
        recuo: 1,
      });
      let sub = celulaTexto(0, r, aba.subtitulo, sSub);
      for (let c = 1; c < nCols; c++) sub += celulaVazia(c, r, sSub);
      linhasXml.push(linha(r, sub, 20));
      if (nCols > 1) mesclar.push(`A${r}:${ultimaCol}${r}`);
    }
    r++;
    linhasXml.push(linha(r, "", 10)); // respiro
  }

  // Colunas à direita: as marcadas ou as que só têm números.
  const direita = new Set(aba.colunasDireita ?? []);
  for (let c = 0; c < nCols; c++) {
    const valores = aba.linhas
      .flatMap((l) => (Array.isArray(l) ? [l[c]] : "total" in l ? [l.total[c]] : []))
      .filter((v): v is CelulaXLSX => v !== undefined)
      .filter((v) => tipoCelula(v) !== "vazio");
    if (valores.length && valores.every((v) => ["numero", "moeda"].includes(tipoCelula(v)))) {
      direita.add(c);
    }
  }

  // Cabeçalho da tabela.
  r++;
  const linhaCabecalho = r;
  let cab = "";
  aba.colunas.forEach((nome, c) => {
    const s = est.id({
      fonte: { negrito: true, cor: "FFFFFFFF" },
      fundo: VERDE,
      alinhar: direita.has(c) ? "right" : "left",
      recuo: 1,
      quebrar: true,
    });
    cab += celulaTexto(c, r, nome, s);
  });
  linhasXml.push(linha(r, cab, 24));

  // Corpo.
  let idxNormal = 0;
  const estiloValor = (
    v: CelulaXLSX,
    c: number,
    base: { fundo?: string; borda?: "baixo" | "total"; fonte?: Fonte },
  ) => {
    const t = tipoCelula(v);
    const comum = { ...base, recuo: 1 };
    if (t === "moeda") return est.id({ ...comum, fmt: "moeda", alinhar: "right" });
    if (t === "numero") {
      const inteiro = Number.isInteger(v as number);
      return est.id({ ...comum, fmt: inteiro ? "inteiro" : "decimal", alinhar: "right" });
    }
    return est.id({ ...comum, alinhar: direita.has(c) ? "right" : "left" });
  };
  const celulaValor = (v: CelulaXLSX, c: number, linhaN: number, estilo: number) => {
    const t = tipoCelula(v);
    if (t === "vazio") return celulaVazia(c, linhaN, estilo);
    if (t === "moeda")
      return `<c r="${colunaLetra(c)}${linhaN}" s="${estilo}"><v>${(v as CelulaMoeda).valor}</v></c>`;
    if (t === "numero") return `<c r="${colunaLetra(c)}${linhaN}" s="${estilo}"><v>${v}</v></c>`;
    return celulaTexto(c, linhaN, String(v), estilo);
  };

  for (const l of aba.linhas) {
    r++;
    if (!Array.isArray(l) && "secao" in l) {
      const sSecao = est.id({
        fonte: { negrito: true, cor: VERDE_ESCURO },
        fundo: VERDE_CLARO,
        alinhar: "left",
        recuo: 1,
      });
      let cel = celulaTexto(0, r, l.secao, sSecao);
      for (let c = 1; c < nCols; c++) cel += celulaVazia(c, r, sSecao);
      linhasXml.push(linha(r, cel, 22));
      idxNormal = 0;
      continue;
    }
    if (!Array.isArray(l)) {
      const base = {
        fundo: VERDE_CLARO,
        borda: "total" as const,
        fonte: { negrito: true, cor: VERDE_ESCURO },
      };
      let cel = "";
      for (let c = 0; c < nCols; c++) {
        cel += celulaValor(l.total[c] ?? null, c, r, estiloValor(l.total[c] ?? null, c, base));
      }
      linhasXml.push(linha(r, cel, 22));
      continue;
    }
    const base = { borda: "baixo" as const, ...(idxNormal % 2 === 1 ? { fundo: ZEBRA } : {}) };
    idxNormal++;
    let cel = "";
    for (let c = 0; c < nCols; c++) {
      cel += celulaValor(l[c] ?? null, c, r, estiloValor(l[c] ?? null, c, base));
    }
    linhasXml.push(linha(r, cel, 20));
  }

  if (aba.linhas.length === 0 && aba.vazio) {
    r++;
    const s = est.id({ fonte: { italico: true, cor: CINZA }, alinhar: "left", recuo: 1 });
    linhasXml.push(linha(r, celulaTexto(0, r, aba.vazio, s), 22));
    if (nCols > 1) mesclar.push(`A${r}:${ultimaCol}${r}`);
  }

  // Observações abaixo da tabela.
  if (aba.notas?.length) {
    r++;
    linhasXml.push(linha(r, "", 10));
    const s = est.id({
      fonte: { tam: 9, italico: true, cor: CINZA },
      alinhar: "left",
      quebrar: true,
    });
    for (const nota of aba.notas) {
      r++;
      let cel = celulaTexto(0, r, nota, s);
      for (let c = 1; c < nCols; c++) cel += celulaVazia(c, r, s);
      const larguraTotal = larguras(aba).reduce((a, b) => a + b, 0);
      const linhasNecessarias = Math.max(1, Math.ceil(nota.length / (larguraTotal * 1.1)));
      linhasXml.push(linha(r, cel, 14 * linhasNecessarias));
      if (nCols > 1) mesclar.push(`A${r}:${ultimaCol}${r}`);
    }
  }

  const cols = larguras(aba)
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><tabColor rgb="${VERDE}"/><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${linhaCabecalho}" topLeftCell="A${linhaCabecalho + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${linhasXml.join("")}</sheetData>${
    mesclar.length
      ? `<mergeCells count="${mesclar.length}">${mesclar.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
      : ""
  }<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="${r <= 45 ? 1 : 0}"/></worksheet>`;
}

function larguras(aba: AbaXLSX): number[] {
  return aba.colunas.map((nome, i) => {
    if (aba.larguras?.[i]) return aba.larguras[i]!;
    let max = nome.length;
    for (const l of aba.linhas) {
      const celulas = Array.isArray(l) ? l : "total" in l ? l.total : [];
      const t = textoDaCelula(celulas[i] ?? null).length;
      if (t > max) max = t;
    }
    return Math.min(60, Math.max(12, max + 4));
  });
}

/** Monta um .xlsx com uma ou mais abas. */
export function construirXLSXAbas(abas: AbaXLSX[]): Uint8Array {
  const est = new Estilos();
  const usados = new Set<string>();
  const nomes = abas.map((a) => nomeDeAba(a.nome, usados));
  const n = abas.length;
  const folhas = abas.map((a) => xmlDaAba(a, est));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomes.map((nome, i) => `<sheet name="${escaparXml(nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`;

  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/styles.xml": strToU8(est.xml()),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
  };
  folhas.forEach((xml, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml);
  });
  return zipSync(arquivos, { level: 6 });
}

export function construirXLSX(
  nomeAba: string,
  colunas: string[],
  linhas: (string | number | null)[][],
): Uint8Array {
  return construirXLSXAbas([{ nome: nomeAba, colunas, linhas }]);
}

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function baixarBytesXLSX(nomeArquivo: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: TIPO_XLSX });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function baixarXLSX(
  nomeArquivo: string,
  nomeAba: string,
  colunas: string[],
  linhas: (string | number | null)[][],
) {
  baixarBytesXLSX(nomeArquivo, construirXLSX(nomeAba, colunas, linhas));
}
