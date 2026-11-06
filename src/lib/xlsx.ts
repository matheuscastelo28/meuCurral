import { zipSync, strToU8 } from "fflate";

/**
 * Gerador mínimo de .xlsx (OOXML) — uma aba só, sem dependência externa.
 * Reaproveita o fflate (já usado em exportar.ts) pra zipar as partes XML do
 * formato. Strings vão como "inline string" (t="inlineStr"), o que evita
 * precisar de uma tabela de shared strings separada; número puro vira
 * célula numérica normal, o resto vira texto.
 */

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A, B, ..., Z, AA, AB, ... — só precisamos de poucas colunas, mas fica genérico. */
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

/** Célula de valor em reais: número de verdade no Excel, mostrado como R$ 1.234,56. */
export type CelulaMoeda = { valor: number; moeda: true };
export type CelulaXLSX = string | number | null | CelulaMoeda;

export type AbaXLSX = {
  nome: string;
  colunas: string[];
  linhas: CelulaXLSX[][];
  /** Colunas (0 = A) cujos números são em reais. */
  colunasMoeda?: number[];
  /** Larguras em caracteres; sem isso, calcula pelo conteúdo. */
  larguras?: number[];
};

const ESTILO_CABECALHO = 1;
const ESTILO_MOEDA = 2;

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

function xmlDaAba(aba: AbaXLSX): string {
  const moedaCols = new Set(aba.colunasMoeda ?? []);
  const todas: CelulaXLSX[][] = [aba.colunas, ...aba.linhas];
  const larguras = aba.colunas.map((c, i) => {
    if (aba.larguras?.[i]) return aba.larguras[i]!;
    let max = c.length;
    for (const l of aba.linhas) {
      const v = l[i];
      const t =
        v === null || v === undefined ? "" : typeof v === "object" ? "R$ 0.000,00" : String(v);
      if (t.length > max) max = t.length;
    }
    return Math.min(60, Math.max(10, max + 2));
  });
  const linhasXml = todas
    .map((linha, i) => {
      const r = i + 1;
      const celulas = linha
        .map((valor, c) => {
          const ref = `${colunaLetra(c)}${r}`;
          if (valor === null || valor === undefined || valor === "") return "";
          const estilo = i === 0 ? ` s="${ESTILO_CABECALHO}"` : "";
          if (typeof valor === "object") {
            return `<c r="${ref}" s="${ESTILO_MOEDA}"><v>${valor.valor}</v></c>`;
          }
          if (typeof valor === "number" && Number.isFinite(valor)) {
            const s = i > 0 && moedaCols.has(c) ? ` s="${ESTILO_MOEDA}"` : estilo;
            return `<c r="${ref}"${s}><v>${valor}</v></c>`;
          }
          return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(String(valor))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r}">${celulas}</row>`;
    })
    .join("");
  const cols = larguras
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${linhasXml}</sheetData></worksheet>`;
}

/** Monta um .xlsx com uma ou mais abas (cabeçalho em negrito, linha fixa, larguras). */
export function construirXLSXAbas(abas: AbaXLSX[]): Uint8Array {
  const usados = new Set<string>();
  const nomes = abas.map((a) => nomeDeAba(a.nome, usados));
  const n = abas.length;

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

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3EFE7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/styles.xml": strToU8(styles),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
  };
  abas.forEach((aba, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xmlDaAba(aba));
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
