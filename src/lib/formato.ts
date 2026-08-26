export function moeda(valor: number | null | undefined, codigo = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: codigo }).format(
    Number(valor ?? 0),
  );
}

export function pesoTexto(kg: number | null | undefined, unidade = "kg") {
  if (kg === null || kg === undefined) return "—";
  const numero = Number(kg);
  if (!Number.isFinite(numero)) return "—";
  if (unidade === "arroba") {
    return `${(numero / 15).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} @`;
  }
  return `${numero.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}

export function dataCurta(iso: string | Date | null | undefined) {
  if (!iso) return "—";
  const texto = iso instanceof Date ? iso.toISOString() : iso;
  const [ano, mes, dia] = texto.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function hojeISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function idadeEmMeses(nascimento: string | Date | null | undefined) {
  if (!nascimento) return null;
  const nasc = new Date(nascimento);
  const hoje = new Date();
  return (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
}

export function idadeTexto(nascimento: string | Date | null | undefined) {
  const meses = idadeEmMeses(nascimento);
  if (meses === null || meses < 0) return "—";
  if (meses < 24) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  return `${Math.floor(meses / 12)} anos`;
}

export function forcaSenha(senha: string) {
  let pontos = 0;
  if (senha.length >= 8) pontos++;
  if (senha.length >= 12) pontos++;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos++;
  if (/\d/.test(senha)) pontos++;
  if (/[^A-Za-z0-9]/.test(senha)) pontos++;
  const nivel = Math.min(pontos, 4);
  const rotulos = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
  return { nivel, rotulo: rotulos[nivel]! };
}
