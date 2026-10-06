import { dataISO, hojeISO } from "./formato";

export interface ParcelaGerada {
  numero: number;
  totalParcelas: number;
  valor: number;
  vencimento: string;
}

/**
 * Gera as parcelas de uma conta em matemática de centavos, pra garantir que
 * a soma bate exatamente com o valor total mesmo quando ele não divide
 * certo (ex: R$100 em 3x = 33,34 + 33,33 + 33,33) — a sobra do arredondamento
 * fica sempre na primeira parcela. As datas avançam por dia de calendário
 * (não por mês), então meses de tamanhos diferentes não distorcem o intervalo.
 */
export function gerarParcelas(
  valorTotal: number,
  numParcelas: number,
  primeiroVencimento: string,
  intervaloDias: number,
): ParcelaGerada[] {
  const totalCentavos = Math.round(valorTotal * 100);
  const baseCentavos = Math.floor(totalCentavos / numParcelas);
  const sobraCentavos = totalCentavos - baseCentavos * numParcelas;
  const dataBase = new Date(`${primeiroVencimento}T00:00:00Z`);

  const parcelas: ParcelaGerada[] = [];
  for (let i = 0; i < numParcelas; i++) {
    const centavos = baseCentavos + (i === 0 ? sobraCentavos : 0);
    const data = new Date(dataBase);
    data.setUTCDate(data.getUTCDate() + intervaloDias * i);
    parcelas.push({
      numero: i + 1,
      totalParcelas: numParcelas,
      valor: centavos / 100,
      vencimento: data.toISOString().slice(0, 10),
    });
  }
  return parcelas;
}

export type StatusParcela = "pendente" | "pago" | "atrasado" | "cancelado";
export type StatusConta = "pendente" | "parcial" | "pago" | "atrasado" | "cancelado";

interface ParcelaComoNoBanco {
  status: string;
  vencimento: string | Date;
}

/**
 * "Atrasado" não é um status guardado — é sempre vencimento no passado e a
 * parcela ainda pendente, igual ao padrão já usado pros eventos da Agenda.
 */
export function statusExibicaoParcela(parcela: ParcelaComoNoBanco): StatusParcela {
  if (parcela.status === "pago" || parcela.status === "cancelado") return parcela.status;
  if (dataISO(parcela.vencimento) < hojeISO()) return "atrasado";
  return "pendente";
}

export function statusExibicaoConta(
  conta: { status: string },
  parcelas: ParcelaComoNoBanco[],
): StatusConta {
  if (conta.status === "cancelado" || conta.status === "pago") return conta.status as StatusConta;
  const temAtrasada = parcelas.some((p) => statusExibicaoParcela(p) === "atrasado");
  if (temAtrasada) return "atrasado";
  return conta.status === "parcial" ? "parcial" : "pendente";
}
