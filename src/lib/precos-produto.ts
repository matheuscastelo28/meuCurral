import { dataISO } from "@/lib/formato";

/** Preço vigente pra uma data: data_inicio <= dataAlvo && (data_fim == null || data_fim >= dataAlvo). */
export function encontrarPrecoVigente(precos: any[] | undefined, dataAlvo: string) {
  return (precos ?? []).find((p: any) => {
    const inicio = dataISO(p.data_inicio);
    const fim = p.data_fim ? dataISO(p.data_fim) : null;
    return inicio <= dataAlvo && (!fim || fim >= dataAlvo);
  });
}
