import { dataISO } from "@/lib/formato";
import {
  femeasImprodutivas as calcularImprodutivas,
  estadoDaFemea,
  agruparPorAnimal,
  DIAS_PARA_DIAGNOSTICO,
  DIAS_SECAGEM_ANTES_PARTO,
  type RegistroRepro,
} from "@/lib/reproducao";
import { especieDoAnimal } from "@/lib/especies";

/**
 * Notificações internas: avisos calculados na hora a partir dos dados da
 * fazenda (Agenda, Financeiro, Reprodução, Confinamento, plano). Nada é
 * gravado: o aviso existe enquanto a situação existe. Só "lida" fica neste
 * aparelho. Reaproveita as mesmas regras das telas de cada setor.
 */

export type TipoNotificacao =
  "financeiro" | "reproducao" | "confinamento" | "sanidade" | "agenda" | "plano";

export type SituacaoNotificacao = "atrasada" | "hoje" | "proxima" | "info";

export interface Notificacao {
  /** Muda quando a situação muda (ex.: nova data), então volta a ser não lida. */
  id: string;
  tipo: TipoNotificacao;
  situacao: SituacaoNotificacao;
  titulo: string;
  detalhe: string;
  /** Data de referência (ordenação e exibição). */
  data: string | null;
  destino: { to: string; search?: Record<string, string>; hash?: string };
}

export const ROTULO_TIPO: Record<TipoNotificacao, string> = {
  financeiro: "Financeiro",
  reproducao: "Reprodução",
  confinamento: "Confinamento",
  sanidade: "Sanidade",
  agenda: "Agenda",
  plano: "Plano",
};

export const ROTULO_SITUACAO: Record<SituacaoNotificacao, string> = {
  atrasada: "Atrasadas",
  hoje: "Para hoje",
  proxima: "Próximas",
  info: "Avisos",
};

/** Quantos dias à frente um compromisso já vira aviso. */
export const DIAS_ANTECEDENCIA = 7;
const DIAS_PARTO_PROXIMO = 14;
const DIAS_SEM_PESAGEM = 30;

function diasEntre(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  );
}

function somar(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function situacaoDaData(data: string, hoje: string): SituacaoNotificacao {
  if (data < hoje) return "atrasada";
  if (data === hoje) return "hoje";
  return "proxima";
}

function quando(data: string, hoje: string) {
  const d = diasEntre(hoje, data);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  return d < 0 ? `há ${-d} dias` : `em ${d} dias`;
}

const moedaBR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface DadosNotificacoes {
  hoje: string;
  eventos: { id: string; titulo: string | null; data: string | Date; tipo: string | null }[];
  contas: { id: string; tipo: string; descricao: string; status: string }[];
  parcelas: {
    id: string;
    conta_id: string;
    numero: number;
    total_parcelas: number;
    valor: string | number;
    vencimento: string | Date;
    status: string;
  }[];
  aReceber: { id: string; descricao: string | null; valor: string | number; data: string | Date }[];
  animais: {
    id: string;
    nome: string | null;
    brinco: string | null;
    categoria: string | null;
    especie: string | null;
    sexo: string | null;
    status: string | null;
    lote: string | null;
    created_at: string | Date | null;
    nascimento?: string | Date | null;
  }[];
  reproducao: RegistroRepro[];
  /** Data da última pesagem de cada animal (só dos em engorda). */
  ultimaPesagem: Record<string, string>;
  uso: { usados: number; limite: number; planoNome: string };
  prefs: { vacina: boolean; pesagem: boolean; parto: boolean };
  /** Índice avançado: false no plano que não inclui. */
  indicesAvancados: boolean;
}

export function montarNotificacoes(d: DadosNotificacoes): Notificacao[] {
  const { hoje } = d;
  const lista: Notificacao[] = [];
  const limite = somar(hoje, DIAS_ANTECEDENCIA);

  // ---- Agenda e sanidade ------------------------------------------------
  for (const e of d.eventos) {
    const data = dataISO(e.data);
    if (data > limite) continue;
    const sanitario = e.tipo === "vacina" || e.tipo === "tratamento";
    if (sanitario && !d.prefs.vacina) continue;
    lista.push({
      id: `evento:${e.id}:${data}`,
      tipo: sanitario ? "sanidade" : "agenda",
      situacao: situacaoDaData(data, hoje),
      titulo: e.titulo || "Compromisso",
      detalhe: `${quando(data, hoje)}`,
      data,
      destino: { to: "/calendario" },
    });
  }

  // ---- Financeiro: parcelas e recebimentos ------------------------------
  const contaPorId = new Map(d.contas.map((c) => [c.id, c]));
  for (const p of d.parcelas) {
    const conta = contaPorId.get(p.conta_id);
    if (!conta || conta.status === "cancelado" || p.status !== "pendente") continue;
    const venc = dataISO(p.vencimento);
    if (venc > limite) continue;
    const pagar = conta.tipo === "a_pagar";
    lista.push({
      id: `parcela:${p.id}:${venc}`,
      tipo: "financeiro",
      situacao: situacaoDaData(venc, hoje),
      titulo: `${pagar ? "Pagar" : "Receber"}: ${conta.descricao}${p.total_parcelas > 1 ? ` (${p.numero}/${p.total_parcelas})` : ""}`,
      detalhe: `${moedaBR(Number(p.valor))} · vence ${quando(venc, hoje)}`,
      data: venc,
      destino: { to: "/financeiro", search: { conta: conta.id } },
    });
  }
  for (const l of d.aReceber) {
    const data = dataISO(l.data);
    // Venda a receber sem prazo combinado: avisa depois de uma semana.
    if (diasEntre(data, hoje) < 7) continue;
    lista.push({
      id: `receber:${l.id}`,
      tipo: "financeiro",
      situacao: "atrasada",
      titulo: `Receber: ${l.descricao ?? "venda"}`,
      detalhe: `${moedaBR(Number(l.valor))} · em aberto desde ${data.split("-").reverse().join("/")}`,
      data,
      destino: { to: "/financeiro" },
    });
  }

  // ---- Reprodução --------------------------------------------------------
  if (d.prefs.parto) {
    const porAnimal = agruparPorAnimal(d.reproducao);
    for (const a of d.animais) {
      if (a.status === "vendido" || a.status === "morto") continue;
      if (a.sexo === "macho" || a.sexo === "castrado") continue;
      const ovino = especieDoAnimal(a) === "ovino";
      const historico = porAnimal.get(a.id);
      if (!historico) continue;
      const est = estadoDaFemea(historico);
      const s = est.servicoAberto;
      if (!s) continue;
      const nome = a.nome || a.brinco || "Animal";
      const dataServico = dataISO(s.data);
      const previsao = s.previsao_parto ? dataISO(s.previsao_parto) : null;
      if (est.diagnostico === null && !est.semServico) {
        const dias = diasEntre(dataServico, hoje);
        if (dias >= DIAS_PARA_DIAGNOSTICO) {
          lista.push({
            id: `diag:${a.id}:${dataServico}`,
            tipo: "reproducao",
            situacao: dias >= DIAS_PARA_DIAGNOSTICO * 2 ? "atrasada" : "hoje",
            titulo: `Fazer diagnóstico de prenhez: ${nome}`,
            detalhe: `serviço há ${dias} dias`,
            data: somar(dataServico, DIAS_PARA_DIAGNOSTICO),
            destino: { to: "/reproducao" },
          });
        }
        continue;
      }
      if (est.diagnostico !== "positivo") continue;
      if (previsao && previsao <= somar(hoje, DIAS_PARTO_PROXIMO)) {
        lista.push({
          id: `parto:${a.id}:${previsao}`,
          tipo: "reproducao",
          situacao: situacaoDaData(previsao, hoje),
          titulo: `Parto previsto: ${nome}`,
          detalhe: `previsão ${quando(previsao, hoje)}`,
          data: previsao,
          destino: { to: "/reproducao" },
        });
      }
      if (previsao && !ovino && a.status !== "seca" && !est.secagemDepoisDoServico) {
        const secar = somar(previsao, -DIAS_SECAGEM_ANTES_PARTO);
        if (secar <= limite) {
          lista.push({
            id: `secar:${a.id}:${secar}`,
            tipo: "reproducao",
            situacao: situacaoDaData(secar, hoje),
            titulo: `Secar a vaca: ${nome}`,
            detalhe: `secagem ${quando(secar, hoje)} (parto previsto ${previsao.split("-").reverse().join("/")})`,
            data: secar,
            destino: { to: "/reproducao" },
          });
        }
      }
    }
  }

  // ---- Fêmeas improdutivas (um aviso só, para não lotar a lista) ---------
  if (d.indicesAvancados) {
    const imp = calcularImprodutivas(d.animais, d.reproducao, hoje);
    if (imp.length > 0) {
      const ovelhas = imp.filter((f) => f.especie === "ovino").length;
      lista.push({
        id: `improdutivas:${imp
          .map((f) => f.animalId)
          .sort()
          .join(",")}`,
        tipo: "reproducao",
        situacao: "info",
        titulo: `${imp.length} ${imp.length === 1 ? "fêmea improdutiva" : "fêmeas improdutivas"}`,
        detalhe:
          (ovelhas > 0 ? `${ovelhas} ${ovelhas === 1 ? "ovelha" : "ovelhas"} · ` : "") +
          imp
            .slice(0, 3)
            .map((f) => f.nome)
            .join(", ") +
          (imp.length > 3 ? " e outras" : ""),
        data: null,
        destino: { to: "/reproducao", search: { improdutivas: "true" } },
      });
    }
  }

  // ---- Confinamento: lote sem pesagem -----------------------------------
  if (d.prefs.pesagem) {
    const lotes = new Map<string, { ultima: string; qtd: number }>();
    for (const a of d.animais) {
      if (a.status !== "engorda") continue;
      const nomeLote = (a.lote ?? "").trim() || "Sem lote";
      const ref = d.ultimaPesagem[a.id] ?? (a.created_at ? dataISO(a.created_at) : hoje);
      const atual = lotes.get(nomeLote);
      lotes.set(nomeLote, {
        // Vale a pesagem mais antiga do lote: é quem está sem pesar há mais tempo.
        ultima: atual && atual.ultima < ref ? atual.ultima : ref,
        qtd: (atual?.qtd ?? 0) + 1,
      });
    }
    for (const [nome, l] of lotes) {
      const dias = diasEntre(l.ultima, hoje);
      if (dias < DIAS_SEM_PESAGEM - 9) continue;
      lista.push({
        id: `pesagem:${nome}:${l.ultima}`,
        tipo: "confinamento",
        situacao: dias >= DIAS_SEM_PESAGEM ? "atrasada" : "proxima",
        titulo: `Pesar o lote ${nome}`,
        detalhe: `${l.qtd} ${l.qtd === 1 ? "animal" : "animais"} · última pesagem há ${dias} dias`,
        data: somar(l.ultima, DIAS_SEM_PESAGEM),
        destino: { to: "/engorda" },
      });
    }
  }

  // ---- Plano -------------------------------------------------------------
  if (Number.isFinite(d.uso.limite) && d.uso.limite > 0) {
    const pct = (d.uso.usados / d.uso.limite) * 100;
    if (pct >= 90) {
      lista.push({
        id: `plano:${pct >= 100 ? 100 : 90}`,
        tipo: "plano",
        situacao: pct >= 100 ? "atrasada" : "info",
        titulo: pct >= 100 ? "Limite de cabeças atingido" : "Limite de cabeças quase no fim",
        detalhe: `${d.uso.usados} de ${d.uso.limite} cabeças no plano ${d.uso.planoNome}`,
        data: null,
        destino: { to: "/config", hash: "plano" },
      });
    }
  }

  const ordem: Record<SituacaoNotificacao, number> = { atrasada: 0, hoje: 1, proxima: 2, info: 3 };
  return lista.sort(
    (x, y) =>
      ordem[x.situacao] - ordem[y.situacao] ||
      (x.data ?? "9999").localeCompare(y.data ?? "9999") ||
      x.titulo.localeCompare(y.titulo),
  );
}
