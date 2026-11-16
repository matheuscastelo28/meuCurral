import { idadeEmMeses } from "@/lib/estagios";
import { dataISO } from "@/lib/formato";
import type { Especie } from "@/lib/especies";
import { somarDias } from "@/lib/sanidade";

/**
 * Tabela de protocolos de vacinação por espécie, categoria, idade e estado,
 * usada para SUGERIR as vacinas de um animal. É sugestão, não receita: os
 * produtos, as doses e as datas devem ser confirmados com o médico-veterinário
 * e com a exigência do órgão de defesa do estado.
 *
 * Rascunho montado de referências técnicas públicas, ainda a validar com um
 * veterinário (a tabela inteira está aqui, num lugar só, para ajustar):
 * - Bovinos: Cronograma sanitário e Manual de Boas Práticas de Vacinação da
 *   Embrapa (brucelose em fêmeas de 3 a 8 meses, dose única — PNCEBT;
 *   clostridioses e raiva a partir de 4 meses, reforço em 30 dias, depois
 *   anual; IBR/BVD nas fêmeas cerca de 60 dias antes da monta, anual;
 *   leptospirose conforme o sorotipo da região).
 * - Ovinos: Embrapa Tabuleiros Costeiros (clostridioses aos 4 meses, reforço
 *   em 28 dias, depois anual) e Esalq (clostridioses nas ovelhas 30 a 40 dias
 *   antes do parto; raiva acima de 4 meses, só em região endêmica).
 */

export interface Protocolo {
  id: string;
  vacina: string;
  especie: Especie;
  /** Categorias a que se aplica; vazio = qualquer. */
  categorias?: string[];
  sexo?: "femea" | "macho";
  /** Idade (meses) a partir da qual vale. */
  idadeMinMeses: number;
  /** Idade (meses) até a qual ainda vale; null = sem limite. */
  idadeMaxMeses: number | null;
  /** Só para animais nestes estados (status no cadastro). */
  soEstados?: string[];
  /** Não sugerir nestes estados. */
  exceto?: string[];
  /** Dias entre as doses a partir da primeira (ex.: [0, 30]). */
  doses: number[];
  obrigatoria?: boolean;
  nota: string;
}

export const PROTOCOLOS: Protocolo[] = [
  {
    id: "bov-brucelose",
    vacina: "Brucelose (B19 ou RB51)",
    especie: "bovino",
    sexo: "femea",
    idadeMinMeses: 3,
    idadeMaxMeses: 8,
    doses: [0],
    obrigatoria: true,
    nota: "Obrigatória em fêmeas de 3 a 8 meses, dose única, aplicada por veterinário cadastrado.",
  },
  {
    id: "bov-clostridioses",
    vacina: "Clostridioses",
    especie: "bovino",
    idadeMinMeses: 4,
    idadeMaxMeses: null,
    doses: [0, 30],
    nota: "A partir dos 4 meses, com reforço 30 dias depois e depois uma vez por ano.",
  },
  {
    id: "bov-raiva",
    vacina: "Raiva",
    especie: "bovino",
    idadeMinMeses: 4,
    idadeMaxMeses: null,
    doses: [0, 30],
    nota: "Obrigatória em área de risco (morcego hematófago). Confirme a exigência no seu estado.",
  },
  {
    id: "bov-leptospirose",
    vacina: "Leptospirose",
    especie: "bovino",
    idadeMinMeses: 4,
    idadeMaxMeses: null,
    doses: [0, 30],
    nota: "Depende do sorotipo presente na região; o veterinário define a vacina e o intervalo.",
  },
  {
    id: "bov-ibr-bvd",
    vacina: "IBR e BVD (reprodutivas)",
    especie: "bovino",
    sexo: "femea",
    categorias: ["novilha", "vaca"],
    idadeMinMeses: 12,
    idadeMaxMeses: null,
    exceto: ["prenhe", "engorda"],
    doses: [0],
    nota: "Vacas e novilhas, cerca de 60 dias antes da monta, com reforço anual.",
  },
  {
    id: "ovi-clostridioses",
    vacina: "Clostridioses",
    especie: "ovino",
    idadeMinMeses: 4,
    idadeMaxMeses: null,
    exceto: ["prenhe"],
    doses: [0, 28],
    nota: "Cordeiros aos 4 meses, reforço 28 dias depois e depois anual. Alguns protocolos começam aos 60 dias.",
  },
  {
    id: "ovi-clostridioses-gestante",
    vacina: "Clostridioses (pré-parto)",
    especie: "ovino",
    sexo: "femea",
    idadeMinMeses: 6,
    idadeMaxMeses: null,
    soEstados: ["prenhe"],
    doses: [0],
    nota: "Ovelha gestante, de 30 a 40 dias antes do parto, para proteger o cordeiro pelo leite.",
  },
  {
    id: "ovi-raiva",
    vacina: "Raiva",
    especie: "ovino",
    idadeMinMeses: 4,
    idadeMaxMeses: null,
    doses: [0, 30],
    nota: "Só em região endêmica, conforme o órgão de defesa do estado.",
  },
];

export interface AnimalParaSugestao {
  especie: Especie;
  sexo: string | null | undefined;
  categoria: string | null | undefined;
  status: string | null | undefined;
  nascimento: string | Date | null | undefined;
}

export interface DoseSugerida {
  /** 1 para a primeira dose; sem série (dose única) fica 1 de 1. */
  numero: number;
  total: number;
  data: string;
}

export interface SugestaoVacina {
  protocolo: Protocolo;
  doses: DoseSugerida[];
  /** Sem data de nascimento: a idade não foi conferida. */
  idadeNaoConferida: boolean;
}

/** Texto do compromisso na Agenda, no formato que o resto do sistema lê. */
export function tituloDaDose(vacina: string, alvo: string, dose: DoseSugerida): string {
  return `Vacina: ${vacina} — ${alvo}${dose.total > 1 ? ` (${dose.numero}ª dose)` : ""}`;
}

/** Tira o "(1ª dose)" do título (para casar com a regra/intervalo da vacina). */
export function semSufixoDeDose(titulo: string): string {
  return titulo.replace(/\s*\(\d+ª dose\)\s*$/, "");
}

export function numeroDaDose(titulo: string): { numero: number } | null {
  const m = titulo.match(/\((\d+)ª dose\)\s*$/);
  return m ? { numero: Number(m[1]) } : null;
}

function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Vacinas sugeridas para um animal hoje, pela espécie, categoria, idade e
 * estado. Animal novo demais ganha a data em que completa a idade mínima;
 * animal na faixa ganha hoje; passou da faixa não recebe sugestão.
 */
export function sugerirVacinas(animal: AnimalParaSugestao, hoje: string): SugestaoVacina[] {
  const nasc = animal.nascimento ? dataISO(animal.nascimento) : null;
  const meses = nasc ? idadeEmMeses(nasc, hoje) : null;
  const estado = animal.status ?? "ativo";
  const sugestoes: SugestaoVacina[] = [];

  for (const p of PROTOCOLOS) {
    if (p.especie !== animal.especie) continue;
    if (p.sexo) {
      const femea = animal.sexo === "femea";
      if (p.sexo === "femea" ? !femea : femea) continue;
    }
    if (p.categorias && !p.categorias.includes(animal.categoria ?? "")) continue;
    if (p.soEstados && !p.soEstados.includes(estado)) continue;
    if (p.exceto?.includes(estado)) continue;
    if (estado === "vendido" || estado === "morto") continue;

    let primeira = hoje;
    if (meses !== null && nasc) {
      if (p.idadeMaxMeses !== null && meses > p.idadeMaxMeses) continue;
      if (meses < p.idadeMinMeses) primeira = somarMeses(nasc, p.idadeMinMeses);
    } else if (p.idadeMinMeses > 0 && p.idadeMaxMeses !== null) {
      // Sem idade não dá para saber se está dentro de uma faixa fechada (ex.: brucelose).
      // Mantém a sugestão, avisando que a idade não foi conferida.
    }
    // A série de doses é a primovacinação do animal jovem. Adulto de histórico
    // desconhecido recebe uma dose (reforço) — o veterinário decide se refaz a série.
    const jovem =
      meses !== null ? meses < 12 : ["bezerro", "cordeiro"].includes(animal.categoria ?? "");
    const dosesDoAnimal = jovem ? p.doses : [0];
    const total = dosesDoAnimal.length;
    sugestoes.push({
      protocolo: p,
      idadeNaoConferida: meses === null,
      doses: dosesDoAnimal.map((dias, i) => ({
        numero: i + 1,
        total,
        data: dias === 0 ? primeira : somarDias(primeira, dias),
      })),
    });
  }
  return sugestoes;
}
