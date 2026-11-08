import { dataISO } from "@/lib/formato";

/**
 * Leitura do histórico reprodutivo de cada fêmea: gestação em aberto,
 * pendência de diagnóstico, vazias e os índices do rebanho. Tudo calculado
 * a partir dos registros (cobertura, inseminação, diagnóstico, parto,
 * secagem) — a situação gravada no animal é só um reflexo disso.
 */

export type RegistroRepro = {
  id?: string;
  animal_id: string | null;
  tipo: string | null;
  data: string | Date;
  resultado?: string | null;
  previsao_parto?: string | Date | null;
  touro?: string | null;
  created_at?: string | Date | null;
};

export const DIAS_PARA_DIAGNOSTICO = 30;
export const DIAS_SECAGEM_ANTES_PARTO = 60;
/** Depois do parto, a partir de quantos dias a fêmea sem novo serviço conta como "vazia". */
export const DIAS_VAZIA = { bovino: 90, ovino: 60 } as const;

const SERVICO = new Set(["cobertura", "inseminacao"]);

export type EstadoFemea = {
  /** Último serviço sem parto depois dele (gestação possível em aberto). */
  servicoAberto: RegistroRepro | null;
  /** Resultado do diagnóstico desse serviço, se houve. */
  diagnostico: "positivo" | "negativo" | null;
  ultimoParto: string | null;
  /** Último evento que deixou a fêmea vazia (parto ou diagnóstico negativo). */
  vaziaDesde: string | null;
  secagemDepoisDoServico: boolean;
};

// Mesmo dia: vale a ordem em que foi lançado (diagnóstico e parto no mesmo dia).
function ordenar(lista: RegistroRepro[]) {
  const hora = (r: RegistroRepro) => (r.created_at ? new Date(r.created_at).getTime() : 0);
  return [...lista].sort(
    (a, b) => dataISO(a.data).localeCompare(dataISO(b.data)) || hora(a) - hora(b),
  );
}

export function agruparPorAnimal(registros: RegistroRepro[]) {
  const mapa = new Map<string, RegistroRepro[]>();
  for (const r of registros) {
    if (!r.animal_id) continue;
    const lista = mapa.get(r.animal_id) ?? [];
    lista.push(r);
    mapa.set(r.animal_id, lista);
  }
  for (const [k, v] of mapa) mapa.set(k, ordenar(v));
  return mapa;
}

export function estadoDaFemea(historico: RegistroRepro[]): EstadoFemea {
  let servicoAberto: RegistroRepro | null = null;
  let diagnostico: "positivo" | "negativo" | null = null;
  let ultimoParto: string | null = null;
  let vaziaDesde: string | null = null;
  let secagemDepoisDoServico = false;
  for (const r of ordenar(historico)) {
    const d = dataISO(r.data);
    if (SERVICO.has(r.tipo ?? "")) {
      servicoAberto = r;
      diagnostico = null;
      vaziaDesde = null;
      secagemDepoisDoServico = false;
    } else if (r.tipo === "diagnostico" && servicoAberto) {
      diagnostico = r.resultado === "negativo" ? "negativo" : "positivo";
      if (diagnostico === "negativo") {
        servicoAberto = null;
        vaziaDesde = d;
      }
    } else if (r.tipo === "parto") {
      servicoAberto = null;
      diagnostico = null;
      ultimoParto = d;
      vaziaDesde = d;
      secagemDepoisDoServico = false;
    } else if (r.tipo === "secagem" && servicoAberto) {
      secagemDepoisDoServico = true;
    }
  }
  return { servicoAberto, diagnostico, ultimoParto, vaziaDesde, secagemDepoisDoServico };
}

function diasEntre(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  );
}

export type IndicesReproducao = {
  /** Fêmeas com gestação em aberto (confirmada ou ainda sem diagnóstico). */
  gestantes: number;
  confirmadas: number;
  /** % de serviços que resultaram em prenhez, entre os com desfecho conhecido (12 meses). */
  taxaPrenhezServico: number | null;
  servicosComDesfecho: number;
  /** Média de serviços por prenhez (12 meses). */
  servicosPorConcepcao: number | null;
  /** Intervalo médio entre partos, em dias. */
  intervaloEntrePartos: number | null;
  partosConsiderados: number;
};

/**
 * Desfecho de cada serviço: prenhez (diagnóstico positivo ou parto antes do
 * próximo serviço) ou falha (diagnóstico negativo ou novo serviço sem
 * prenhez no meio). Serviço ainda sem desfecho não entra na conta.
 */
export function indicesReproducao(
  porAnimal: Map<string, RegistroRepro[]>,
  hoje: string,
): IndicesReproducao {
  const limite = new Date(`${hoje}T00:00:00Z`);
  limite.setUTCFullYear(limite.getUTCFullYear() - 1);
  const desde = limite.toISOString().slice(0, 10);

  let gestantes = 0;
  let confirmadas = 0;
  let prenhezes = 0;
  let falhas = 0;
  const intervalos: number[] = [];

  for (const historico of porAnimal.values()) {
    const est = estadoDaFemea(historico);
    if (est.servicoAberto) {
      gestantes++;
      if (est.diagnostico === "positivo") confirmadas++;
    }

    const lista = ordenar(historico);
    for (let i = 0; i < lista.length; i++) {
      const s = lista[i]!;
      if (!SERVICO.has(s.tipo ?? "") || dataISO(s.data) < desde) continue;
      let desfecho: "prenhez" | "falha" | null = null;
      for (let j = i + 1; j < lista.length; j++) {
        const r = lista[j]!;
        if (r.tipo === "diagnostico") {
          desfecho = r.resultado === "negativo" ? "falha" : "prenhez";
          if (desfecho === "falha") break;
        } else if (r.tipo === "parto") {
          desfecho = "prenhez";
          break;
        } else if (SERVICO.has(r.tipo ?? "")) {
          if (desfecho !== "prenhez") desfecho = "falha";
          break;
        }
      }
      if (desfecho === "prenhez") prenhezes++;
      else if (desfecho === "falha") falhas++;
    }

    const partos = lista.filter((r) => r.tipo === "parto").map((r) => dataISO(r.data));
    for (let i = 1; i < partos.length; i++) {
      const d = diasEntre(partos[i - 1]!, partos[i]!);
      // Ignora registro duplicado/gêmeos (mesmo parto lançado duas vezes).
      if (d > 120) intervalos.push(d);
    }
  }

  const comDesfecho = prenhezes + falhas;
  return {
    gestantes,
    confirmadas,
    taxaPrenhezServico: comDesfecho > 0 ? Math.round((prenhezes / comDesfecho) * 100) : null,
    servicosComDesfecho: comDesfecho,
    servicosPorConcepcao: prenhezes > 0 ? Math.round((comDesfecho / prenhezes) * 10) / 10 : null,
    intervaloEntrePartos:
      intervalos.length > 0
        ? Math.round(intervalos.reduce((s, d) => s + d, 0) / intervalos.length)
        : null,
    partosConsiderados: intervalos.length,
  };
}

/**
 * Situação do animal depois de um registro, sem atropelar o que importa
 * pro dia a dia: vaca em lactação continua em lactação (o leite dela segue
 * sendo registrado) e animal em engorda continua em engorda. Devolve null
 * quando não há o que mudar.
 */
export function statusAposRegistro(
  statusAtual: string | null | undefined,
  tipo: string,
  resultado?: string | null,
): string | null {
  const s = statusAtual ?? "ativo";
  if (s === "vendido" || s === "morto" || s === "engorda") return null;
  if (tipo === "diagnostico" && resultado === "positivo" && s === "ativo") return "prenhe";
  if (tipo === "diagnostico" && resultado === "negativo" && s === "prenhe") return "ativo";
  if (tipo === "secagem" && s !== "seca") return "seca";
  return null;
}
