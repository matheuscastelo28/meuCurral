import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { dataISO, hojeISO } from "@/lib/formato";
import { statusExibicaoConta, statusExibicaoParcela } from "@/lib/parcelamento";

export interface ResumoFinanceiro {
  recebido: number;
  despesas: number;
  aReceber: number;
  aPagar: number;
  saldoRealizado: number;
  emAtraso: number;
}

interface ContaResumo {
  id: string;
  tipo: "a_receber" | "a_pagar";
  status: string;
  valor_total: string | number;
  valor_restante: string | number;
}

interface ParcelaResumo {
  conta_id: string;
  status: string;
  vencimento: string | Date;
  valor: string | number;
}

/**
 * Mesma conta — "Recebido"/"Despesas"/"A receber"/"A pagar" — que a aba
 * Financeiro mostra nos cards de resumo, reaproveitada aqui (Início) pra
 * não ter dois números diferentes pra "quanto a fazenda recebeu/gastou".
 * Usa as mesmas queryKeys de financeiro.tsx ("financeiro"/"contas"/
 * "parcelas") de propósito: navegar entre Início e Financeiro reaproveita
 * o cache do react-query, e invalidar uma invalida a outra.
 */
export function useResumoFinanceiro(fazendaId: string | undefined) {
  const hoje = hojeISO();

  const lancamentos = useQuery({
    queryKey: ["financeiro", fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await db
        .from("financeiro_lancamentos")
        .select("tipo, status, valor, data")
        .eq("fazenda_id", fazendaId!)
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const contas = useQuery({
    queryKey: ["contas", fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await db
        .from("contas")
        .select("id, tipo, status, valor_total, valor_restante")
        .eq("fazenda_id", fazendaId!)
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContaResumo[];
    },
  });

  const parcelas = useQuery({
    queryKey: ["parcelas", fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await db
        .from("parcelas")
        .select("conta_id, status, vencimento, valor")
        .eq("fazenda_id", fazendaId!)
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ParcelaResumo[];
    },
  });

  const isLoading = lancamentos.isLoading || contas.isLoading || parcelas.isLoading;

  const parcelasPorConta = new Map<string, ParcelaResumo[]>();
  for (const p of parcelas.data ?? []) {
    const lista = parcelasPorConta.get(p.conta_id) ?? [];
    lista.push(p);
    parcelasPorConta.set(p.conta_id, lista);
  }
  const contasComStatus = (contas.data ?? []).map((c) => ({
    ...c,
    statusExibido: statusExibicaoConta(c, parcelasPorConta.get(c.id) ?? []),
  }));

  const recebido =
    (lancamentos.data ?? [])
      .filter((l) => l.tipo === "receita" && l.status === "recebido")
      .reduce((s, l) => s + Number(l.valor), 0) +
    (contas.data ?? [])
      .filter((c) => c.tipo === "a_receber")
      .reduce((s, c) => s + (Number(c.valor_total) - Number(c.valor_restante)), 0);

  const despesas =
    (lancamentos.data ?? [])
      .filter((l) => l.tipo === "despesa")
      .reduce((s, l) => s + Number(l.valor), 0) +
    (contas.data ?? [])
      .filter((c) => c.tipo === "a_pagar")
      .reduce((s, c) => s + (Number(c.valor_total) - Number(c.valor_restante)), 0);

  const aReceberContas = contasComStatus
    .filter(
      (c) =>
        c.tipo === "a_receber" && c.statusExibido !== "cancelado" && c.statusExibido !== "pago",
    )
    .reduce((s, c) => s + Number(c.valor_restante), 0);
  const aPagarContas = contasComStatus
    .filter(
      (c) => c.tipo === "a_pagar" && c.statusExibido !== "cancelado" && c.statusExibido !== "pago",
    )
    .reduce((s, c) => s + Number(c.valor_restante), 0);
  const aReceber =
    (lancamentos.data ?? [])
      .filter((l) => l.tipo === "receita" && l.status === "a_receber")
      .reduce((s, l) => s + Number(l.valor), 0) + aReceberContas;

  const emAtrasoLancamentos = (lancamentos.data ?? [])
    .filter((l) => l.tipo === "receita" && l.status === "a_receber" && dataISO(l.data) < hoje)
    .reduce((s, l) => s + Number(l.valor), 0);
  const emAtrasoContas = (parcelas.data ?? [])
    .filter((p) => statusExibicaoParcela(p) === "atrasado")
    .reduce((s, p) => s + Number(p.valor), 0);

  const resumo: ResumoFinanceiro = {
    recebido,
    despesas,
    aReceber,
    aPagar: aPagarContas,
    saldoRealizado: recebido - despesas,
    emAtraso: emAtrasoContas + emAtrasoLancamentos,
  };

  return { data: resumo, isLoading };
}
