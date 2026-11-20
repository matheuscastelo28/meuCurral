/**
 * Senhas com scrypt (resistente a tentativas de adivinhação em massa) e sal
 * aleatório por conta. Parâmetros da recomendação da OWASP para scrypt
 * (N=2^15, r=8, p=3, cerca de 32 MiB de memória por cálculo).
 *
 * Formato guardado: scrypt$N$r$p$sal(base64)$hash(base64).
 * Contas antigas têm SHA-256 sem sal ("legado"): continuam entrando e a senha
 * é refeita em scrypt no primeiro login, sem o usuário perceber.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 3;
const TAMANHO = 32;
const MEMORIA_MAX = 64 * 1024 * 1024;

function calcular(senha: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(senha, sal, TAMANHO, { N: n, r, p, maxmem: MEMORIA_MAX }, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    ),
  );
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await calcular(senha, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64")}$${chave.toString("base64")}`;
}

function hashLegado(senha: string): string {
  return createHash("sha256").update(`mcd:${senha}`, "utf8").digest("hex");
}

function iguais(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Confere a senha. `atualizar` = está certa, mas guardada num formato mais fraco. */
export async function conferirSenha(
  senha: string,
  guardado: string | null | undefined,
): Promise<{ ok: boolean; atualizar: boolean }> {
  if (!guardado) return { ok: false, atualizar: false };
  if (guardado.startsWith("scrypt$")) {
    const [, n, r, p, sal, hash] = guardado.split("$");
    if (!n || !r || !p || !sal || !hash) return { ok: false, atualizar: false };
    const chave = await calcular(senha, Buffer.from(sal, "base64"), +n, +r, +p);
    const ok = iguais(chave, Buffer.from(hash, "base64"));
    return { ok, atualizar: ok && (+n !== N || +r !== R || +p !== P) };
  }
  // O formato antigo é rápido: gasta o tempo de um scrypt para a resposta não
  // denunciar, pela demora, que o e-mail tem conta.
  await gastarTempoDeConferencia(senha);
  const ok = iguais(Buffer.from(hashLegado(senha)), Buffer.from(guardado));
  return { ok, atualizar: ok };
}

/** Gasta o mesmo tempo de uma conferência quando o e-mail não existe (não denuncia quem tem conta). */
export async function gastarTempoDeConferencia(senha: string): Promise<void> {
  await calcular(senha, Buffer.alloc(16), N, R, P);
}
