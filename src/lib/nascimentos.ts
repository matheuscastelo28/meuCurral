import { dataISO } from "@/lib/formato";
import type { RegistroRepro } from "@/lib/reproducao";

/**
 * Base dos nascimentos: junta cada parto registrado em Reprodução com a(s)
 * cria(s) cadastrada(s) no Rebanho. A ficha da fêmea (bloco "Partos") e a
 * aba de Nascimentos leem daqui, então os dois sempre mostram o mesmo.
 */

export type AnimalNascimento = {
  id: string;
  nome: string | null;
  brinco?: string | null;
  sexo?: string | null;
  raca?: string | null;
  mae?: string | null;
  pai?: string | null;
  nascimento?: string | Date | null;
  peso_nascimento?: string | number | null;
  parto_id?: string | null;
};

export type FemeaNascimento = {
  id: string;
  nome: string | null;
  brinco?: string | null;
};

export type CriaNascimento = {
  id: string;
  nome: string;
  sexo: "macho" | "femea" | null;
  pesoKg: number | null;
  raca: string | null;
};

export type Nascimento = {
  partoId: string | null;
  femeaId: string;
  data: string;
  crias: CriaNascimento[];
  /** Dias desde o parto anterior da mesma fêmea (null no primeiro). */
  intervaloDias: number | null;
};

function normaliza(t: string | null | undefined) {
  return (t ?? "").trim().toLowerCase();
}

function diasEntre(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  );
}

function paraCria(a: AnimalNascimento): CriaNascimento {
  const peso = Number(a.peso_nascimento);
  return {
    id: a.id,
    nome: a.nome || a.brinco || "Cria",
    sexo: a.sexo === "macho" || a.sexo === "femea" ? a.sexo : null,
    pesoKg: Number.isFinite(peso) && peso > 0 ? peso : null,
    raca: a.raca ?? null,
  };
}

/**
 * Monta os nascimentos de uma ou mais fêmeas. A cria é achada pelo vínculo
 * direto (parto_id); registros antigos, sem vínculo, casam por mãe + data de
 * nascimento igual à do parto.
 */
export function montarNascimentos(
  partos: RegistroRepro[],
  femeas: FemeaNascimento[],
  animais: AnimalNascimento[],
): Nascimento[] {
  const femeaPorId = new Map(femeas.map((f) => [f.id, f]));
  const usadas = new Set<string>();
  const porAnimal = new Map<string, RegistroRepro[]>();
  for (const p of partos) {
    if (p.tipo !== "parto" || !p.animal_id || !femeaPorId.has(p.animal_id)) continue;
    const l = porAnimal.get(p.animal_id) ?? [];
    l.push(p);
    porAnimal.set(p.animal_id, l);
  }

  // Primeiro os vínculos diretos, para a heurística não roubar a cria deles.
  for (const a of animais) if (a.parto_id) usadas.add(a.id);

  const resultado: Nascimento[] = [];
  for (const [femeaId, lista] of porAnimal) {
    const femea = femeaPorId.get(femeaId)!;
    const nomes = [normaliza(femea.nome), normaliza(femea.brinco)].filter(Boolean);
    const ordenados = [...lista].sort((x, y) => dataISO(x.data).localeCompare(dataISO(y.data)));
    let anterior: string | null = null;
    for (const p of ordenados) {
      const data = dataISO(p.data);
      const doParto = animais.filter((a) => a.parto_id && a.parto_id === p.id);
      const porHeuristica = animais.filter(
        (a) =>
          !a.parto_id &&
          !usadas.has(a.id) &&
          a.nascimento &&
          dataISO(a.nascimento) === data &&
          nomes.includes(normaliza(a.mae)),
      );
      for (const a of porHeuristica) usadas.add(a.id);
      resultado.push({
        partoId: p.id ?? null,
        femeaId,
        data,
        crias: [...doParto, ...porHeuristica].map(paraCria),
        intervaloDias: anterior ? diasEntre(anterior, data) : null,
      });
      anterior = data;
    }
  }
  return resultado.sort((a, b) => b.data.localeCompare(a.data));
}

/** Média de dias entre partos (ignora lançamento duplicado, < 120 dias). */
export function intervaloMedio(nascimentos: Nascimento[]): number | null {
  const v = nascimentos
    .map((n) => n.intervaloDias)
    .filter((d): d is number => d != null && d > 120);
  return v.length ? Math.round(v.reduce((s, d) => s + d, 0) / v.length) : null;
}

/**
 * Raça da cria: igual à dos pais quando coincide; cruzamento ("Gir x
 * Holandesa") quando diferem; a do pai que tiver raça cadastrada quando só
 * um tem.
 */
export function racaDaCria(
  racaMae: string | null | undefined,
  racaPai: string | null | undefined,
): string | null {
  const m = racaMae?.trim() || null;
  const p = racaPai?.trim() || null;
  if (m && p) return normaliza(m) === normaliza(p) ? m : `${m} x ${p}`;
  return m ?? p;
}
