import { zipSync, strToU8 } from "fflate";
import { db } from "@/lib/local-db";
import { baixarXLSX } from "@/lib/xlsx";
import { dataCurta, hojeISO } from "@/lib/formato";
import { statusExibicaoConta, statusUnificadoLancamento } from "@/lib/parcelamento";

// Tudo que é exportado. Inclui vendas/destinacoes_leite, que só podem ser
// *lidas* pela consulta genérica (consultar.ts as trata como somente
// leitura) — por isso elas entram aqui, mas não em TABELAS_APAGAR abaixo.
const TABELAS_EXPORTAR = [
  "animais",
  "manejos",
  "producao_leite",
  "reproducao",
  "financeiro_lancamentos",
  "eventos_agenda",
  "precos_produto",
  "destinacoes_leite",
  "vendas",
] as const;

// "Apagar todos os registros" some só com o que dá pra apagar pela consulta
// genérica. vendas/destinacoes_leite ficam de fora porque essas tabelas são
// somente-leitura ali (ver TABELAS_SOMENTE_LEITURA em dados.functions.ts) —
// apagar em massa exigiria uma função dedicada, que ainda não existe.
const TABELAS_APAGAR = [
  "animais",
  "manejos",
  "producao_leite",
  "reproducao",
  "financeiro_lancamentos",
  "eventos_agenda",
  "precos_produto",
] as const;

function paraCSV(linhas: Record<string, unknown>[]) {
  if (linhas.length === 0) return "";
  const colunas = Object.keys(linhas[0]!);
  const escapar = (v: unknown) => {
    const texto = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return [
    colunas.join(";"),
    ...linhas.map((l) => colunas.map((c) => escapar(l[c])).join(";")),
  ].join("\n");
}

export async function exportarDadosDaFazenda(fazendaId: string, nomeFazenda: string) {
  const arquivos: Record<string, Uint8Array> = {};
  for (const tabela of TABELAS_EXPORTAR) {
    const { data, error } = await db.from(tabela).select("*").eq("fazenda_id", fazendaId);
    if (error) throw error;
    arquivos[`${tabela}.csv`] = strToU8(paraCSV((data ?? []) as Record<string, unknown>[]));
  }
  const zip = zipSync(arquivos, { level: 6 });
  const blob = new Blob([zip as unknown as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug =
    nomeFazenda
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "fazenda";
  link.href = url;
  link.download = `dados-${slug}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function apagarRegistrosDaFazenda(fazendaId: string) {
  for (const tabela of TABELAS_APAGAR) {
    const { error } = await db.from(tabela).delete().eq("fazenda_id", fazendaId);
    if (error) throw error;
  }
}

const STATUS_ROTULO: Record<string, string> = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

const COLUNAS_RECEITAS = [
  "Data",
  "Origem",
  "Descrição",
  "Pessoa/Categoria",
  "Forma de pagamento",
  "Status",
  "Valor",
];

export async function exportarReceitasExcel(fazendaId: string, nomeFazenda: string) {
  const hoje = hojeISO();

  const { data: lancamentos, error: errLancamentos } = await db
    .from("financeiro_lancamentos")
    .select("*")
    .eq("fazenda_id", fazendaId)
    .eq("tipo", "receita");
  if (errLancamentos) throw errLancamentos;

  const { data: contas, error: errContas } = await db
    .from("contas")
    .select("*")
    .eq("fazenda_id", fazendaId)
    .eq("tipo", "a_receber");
  if (errContas) throw errContas;

  const { data: parcelas, error: errParcelas } = await db
    .from("parcelas")
    .select("*")
    .eq("fazenda_id", fazendaId);
  if (errParcelas) throw errParcelas;

  const parcelasPorConta = new Map<string, { status: string; vencimento: string | Date }[]>();
  for (const p of (parcelas ?? []) as {
    conta_id: string;
    status: string;
    vencimento: string | Date;
  }[]) {
    const lista = parcelasPorConta.get(p.conta_id) ?? [];
    lista.push(p);
    parcelasPorConta.set(p.conta_id, lista);
  }

  const linhas: (string | number | null)[][] = [];

  for (const l of (lancamentos ?? []) as {
    data: string | Date;
    descricao: string;
    forma_pagamento: string | null;
    valor: string | number;
    tipo: string;
    status: string;
  }[]) {
    const status = statusUnificadoLancamento(l, hoje);
    linhas.push([
      dataCurta(l.data),
      "Lançamento",
      l.descricao,
      "",
      l.forma_pagamento ?? "",
      STATUS_ROTULO[status] ?? status,
      Number(l.valor),
    ]);
  }

  for (const c of (contas ?? []) as {
    id: string;
    data_emissao: string | Date;
    descricao: string;
    pessoa: string | null;
    categoria: string | null;
    forma_pagamento: string | null;
    valor_total: string | number;
    status: string;
  }[]) {
    const status = statusExibicaoConta(c, parcelasPorConta.get(c.id) ?? []);
    linhas.push([
      dataCurta(c.data_emissao),
      "Conta a receber",
      c.descricao,
      c.pessoa || c.categoria || "",
      c.forma_pagamento ?? "",
      STATUS_ROTULO[status] ?? status,
      Number(c.valor_total),
    ]);
  }

  linhas.sort((a, b) => String(b[0]).localeCompare(String(a[0])));

  const slug =
    nomeFazenda
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "fazenda";
  baixarXLSX(`receitas-${slug}.xlsx`, "Receitas", COLUNAS_RECEITAS, linhas);
}
