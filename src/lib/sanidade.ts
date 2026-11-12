/**
 * Intervalos de reforço e de manejo periódico. Cada regra diz "depois de
 * aplicar X, repetir em N dias" — a próxima dose sai sugerida ao registrar e
 * vira lembrete na Agenda; ao cumprir o lembrete, a regra gera o seguinte.
 * A fazenda pode mudar os intervalos padrão ou criar os seus.
 */

export type RegraSanitaria = {
  id?: string;
  /** Trecho do nome do produto (sem acento/maiúscula). Vazio = vale para todo o tipo. */
  produto: string;
  /** vacina | vermifugo | tratamento | outro — vazio vale para qualquer tipo. */
  tipo: string | null;
  /** 0 = sem reforço (desliga a regra padrão). */
  intervalo_dias: number;
};

export type RegraPadrao = RegraSanitaria & { rotulo: string };

export const REGRAS_PADRAO: RegraPadrao[] = [
  { rotulo: "Raiva", produto: "raiva", tipo: null, intervalo_dias: 365 },
  { rotulo: "Clostridioses", produto: "clostrid", tipo: null, intervalo_dias: 365 },
  { rotulo: "Febre aftosa", produto: "aftosa", tipo: null, intervalo_dias: 180 },
  { rotulo: "Vermífugo (qualquer produto)", produto: "", tipo: "vermifugo", intervalo_dias: 60 },
];

export function normalizar(t: string | null | undefined) {
  return (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function casa(regra: RegraSanitaria, produto: string, tipo: string | null) {
  const chave = normalizar(regra.produto);
  if (regra.tipo && regra.tipo !== tipo) return false;
  if (!chave) return !!regra.tipo;
  return normalizar(produto).includes(chave);
}

/**
 * Regra que vale para o produto: as da fazenda têm prioridade sobre as
 * padrão, e a mais específica (nome do produto) vence a do tipo inteiro.
 * Devolve null quando não há regra ou ela está desligada (0 dias).
 */
export function acharRegra(
  produto: string,
  tipo: string | null,
  daFazenda: RegraSanitaria[],
): RegraSanitaria | null {
  if (!produto.trim()) return null;
  const ordem = (r: RegraSanitaria) => (normalizar(r.produto) ? 1 : 0);
  for (const lista of [daFazenda, REGRAS_PADRAO]) {
    const achada = lista
      .filter((r) => casa(r, produto, tipo))
      .sort(
        (a, b) =>
          ordem(b) - ordem(a) || normalizar(b.produto).length - normalizar(a.produto).length,
      )[0];
    if (achada) return achada.intervalo_dias > 0 ? achada : null;
  }
  return null;
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function textoIntervalo(dias: number): string {
  if (dias === 365) return "1 ano";
  if (dias >= 60 && dias % 30 === 0) return `${dias / 30} meses`;
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}
