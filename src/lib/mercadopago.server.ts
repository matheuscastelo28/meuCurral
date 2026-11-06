/**
 * Integração com as assinaturas do Mercado Pago (API "preapproval").
 *
 * Configuração (variáveis de ambiente, nunca no código):
 *   MERCADOPAGO_ACCESS_TOKEN   — Access Token de produção (ou de teste) da aplicação
 *   MERCADOPAGO_WEBHOOK_SECRET — "assinatura secreta" dos webhooks, pra validar o aviso
 *   APP_URL                    — endereço público do sistema (volta do checkout)
 *   MERCADOPAGO_API_URL        — só pra testes locais; padrão https://api.mercadopago.com
 *
 * O status de uma assinatura é sempre lido da própria API do Mercado Pago:
 * um aviso de webhook só diz "olhe a assinatura X", e é a resposta da API
 * que decide o plano da fazenda. Assim um aviso forjado não libera nada.
 */
import type { Sql } from "./pg.server";

export type Preapproval = {
  id: string;
  status: string;
  external_reference?: string | null;
  init_point?: string | null;
  payer_email?: string | null;
  reason?: string | null;
  auto_recurring?: { transaction_amount?: number | null } | null;
};

function urlApi() {
  return process.env["MERCADOPAGO_API_URL"] ?? "https://api.mercadopago.com";
}

export function mercadoPagoConfigurado() {
  return !!process.env["MERCADOPAGO_ACCESS_TOKEN"];
}

/** Endereço público do sistema, pra onde o Mercado Pago devolve o usuário. */
export function urlDoSistema() {
  if (process.env["APP_URL"]) return process.env["APP_URL"].replace(/\/$/, "");
  if (process.env["VERCEL_ENV"] === "production") return "https://curralonline.com";
  if (process.env["VERCEL_URL"]) return `https://${process.env["VERCEL_URL"]}`;
  return "http://127.0.0.1:5173";
}

async function chamar<T>(metodo: "GET" | "POST" | "PUT", caminho: string, corpo?: unknown) {
  const token = process.env["MERCADOPAGO_ACCESS_TOKEN"];
  if (!token) {
    throw new Error("O pagamento online ainda não está configurado. Fale com a gente.");
  }
  const resposta = await fetch(`${urlApi()}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(metodo === "POST" ? { "X-Idempotency-Key": crypto.randomUUID() } : {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const json = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok) {
    const detalhe = typeof json["message"] === "string" ? `: ${json["message"]}` : "";
    throw new Error(`O Mercado Pago recusou a operação (${resposta.status})${detalhe}.`);
  }
  return json as T;
}

export const mercadoPago = {
  criarAssinatura(dados: {
    motivo: string;
    referencia: string;
    email: string;
    valor: number;
    voltarPara: string;
  }) {
    return chamar<Preapproval>("POST", "/preapproval", {
      reason: dados.motivo,
      external_reference: dados.referencia,
      payer_email: dados.email,
      back_url: dados.voltarPara,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: dados.valor,
        currency_id: "BRL",
      },
    });
  },
  buscar(id: string) {
    return chamar<Preapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);
  },
  cancelar(id: string) {
    return chamar<Preapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, {
      status: "cancelled",
    });
  },
};

const STATUS_INTERNO: Record<string, string> = {
  authorized: "ativa",
  pending: "pendente",
  paused: "pausada",
  cancelled: "cancelada",
};

/**
 * Leva o status que o Mercado Pago informou pra assinatura e pro plano da
 * fazenda: ativa → plano da assinatura; pausada/cancelada → volta ao Grátis
 * (se não houver outra assinatura ativa). Devolve o status interno.
 */
export async function aplicarPreapproval(sql: Sql, pre: Preapproval): Promise<string | null> {
  const linhas: { id: string; fazenda_id: string; plano: string }[] = await sql`
    select id, fazenda_id, plano from assinaturas where mp_preapproval_id = ${pre.id}`;
  const assinatura = linhas[0];
  if (!assinatura) return null;
  const status = STATUS_INTERNO[pre.status] ?? pre.status;

  await sql.begin(async (tx) => {
    await tx`
      update assinaturas set status = ${status}, updated_at = now()
      where id = ${assinatura.id}`;
    if (status === "ativa") {
      await tx`update fazendas set plano = ${assinatura.plano}, updated_at = now()
               where id = ${assinatura.fazenda_id}`;
    } else if (status === "pausada" || status === "cancelada") {
      const outras: { n: number }[] = await tx`
        select count(*)::int as n from assinaturas
        where fazenda_id = ${assinatura.fazenda_id} and status = 'ativa' and id <> ${assinatura.id}`;
      if ((outras[0]?.n ?? 0) === 0) {
        await tx`update fazendas set plano = 'gratis', updated_at = now()
                 where id = ${assinatura.fazenda_id} and plano = ${assinatura.plano}`;
      }
    }
  });
  return status;
}

/**
 * Confere a assinatura do aviso (cabeçalho x-signature) com a "assinatura
 * secreta" configurada no painel do Mercado Pago. Sem segredo configurado,
 * não dá pra validar — mas o aviso ainda passa pela consulta na API.
 */
export async function webhookAutentico(
  cabecalhos: Headers,
  dataId: string,
): Promise<"valido" | "invalido" | "sem_segredo"> {
  const segredo = process.env["MERCADOPAGO_WEBHOOK_SECRET"];
  if (!segredo) return "sem_segredo";
  const assinatura = cabecalhos.get("x-signature") ?? "";
  const requestId = cabecalhos.get("x-request-id") ?? "";
  const partes = Object.fromEntries(
    assinatura.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k?.trim() ?? "", v.join("=").trim()];
    }),
  );
  const ts = partes["ts"];
  const v1 = partes["v1"];
  if (!ts || !v1) return "invalido";
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifesto = `id:${id};request-id:${requestId};ts:${ts};`;
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto)),
  );
  const esperado = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return esperado === v1 ? "valido" : "invalido";
}
