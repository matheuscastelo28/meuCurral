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

/**
 * Access Token como foi colado no painel, limpo de espaços, aspas e de um
 * "Bearer " na frente — erros comuns de colagem que dão 401 no Mercado Pago.
 */
function tokenMercadoPago(): string | null {
  const bruto = process.env["MERCADOPAGO_ACCESS_TOKEN"];
  if (!bruto) return null;
  const limpo = bruto
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  return limpo || null;
}

/** Public Key (APP_USR-<uuid>) não serve pra API: só o Access Token. */
const FORMATO_PUBLIC_KEY =
  /^(APP_USR|TEST)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mercadoPagoConfigurado() {
  return !!tokenMercadoPago();
}

/**
 * Diagnóstico da credencial sem expor o valor: formato, tipo (produção ou
 * teste), conta dona do token e se a API do Mercado Pago aceita o token.
 */
export async function diagnosticoMercadoPago() {
  const bruto = process.env["MERCADOPAGO_ACCESS_TOKEN"] ?? "";
  const token = tokenMercadoPago();
  if (!token) return { configurado: false as const };
  const formato = FORMATO_PUBLIC_KEY.test(token)
    ? "public_key (errado: use o Access Token)"
    : /^(APP_USR|TEST)-\d+-\d+-[0-9a-f]+-\d+$/i.test(token)
      ? "access_token"
      : "desconhecido";
  const tipo = token.startsWith("TEST-")
    ? "teste"
    : token.startsWith("APP_USR-")
      ? "producao"
      : "desconhecido";
  const contaNoToken = formato === "access_token" ? (token.split("-").pop() ?? null) : null;
  let api: Record<string, unknown>;
  try {
    const r = await fetch(`${urlApi()}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    api = r.ok
      ? { aceito: true, conta: j["id"] ?? null, pais: j["site_id"] ?? null }
      : { aceito: false, status: r.status, mensagem: j["message"] ?? null };
  } catch (e) {
    api = { aceito: false, erro: e instanceof Error ? e.message : String(e) };
  }
  // Últimos pagamentos e assinaturas da conta: só status, motivo e valor
  // (sem nome, e-mail ou cartão) — explica recusas do checkout.
  const consultar = async (caminho: string) => {
    try {
      const r = await fetch(`${urlApi()}${caminho}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.ok ? ((await r.json()) as { results?: Record<string, unknown>[] }) : null;
    } catch {
      return null;
    }
  };
  const [pagamentos, assinaturas] = await Promise.all([
    consultar("/v1/payments/search?sort=date_created&criteria=desc&limit=8"),
    consultar("/preapproval/search?sort=date_created&criteria=desc&limit=8"),
  ]);
  const ultimosPagamentos = (pagamentos?.results ?? []).map((p) => ({
    data: p["date_created"],
    status: p["status"],
    motivo: p["status_detail"],
    meio: p["payment_method_id"],
    tipo: p["payment_type_id"],
    valor: p["transaction_amount"],
    assinatura: (p["metadata"] as Record<string, unknown> | undefined)?.["preapproval_id"] ?? null,
    operacao: p["operation_type"],
    descricao: p["description"] ?? null,
    origem: (p["point_of_interaction"] as Record<string, unknown> | undefined)?.["type"] ?? null,
    // O Mercado Pago não deixa a própria conta vendedora assinar/pagar a si mesma.
    pagadorEhVendedor:
      String((p["payer"] as Record<string, unknown> | undefined)?.["id"] ?? "") ===
      String(p["collector_id"] ?? "-"),
  }));
  const ultimasAssinaturas = (assinaturas?.results ?? []).map((a) => ({
    id: a["id"],
    data: a["date_created"],
    status: a["status"],
    referencia: a["external_reference"],
    valor: (a["auto_recurring"] as Record<string, unknown> | undefined)?.["transaction_amount"],
    proximaCobranca: a["next_payment_date"] ?? null,
    pagas: (a["summarized"] as Record<string, unknown> | undefined)?.["charged_quantity"] ?? null,
  }));
  return {
    configurado: true as const,
    ultimosPagamentos,
    ultimasAssinaturas,
    formato,
    tipo,
    tamanho: token.length,
    colagemCorrigida: bruto !== token,
    contaNoToken,
    api,
  };
}

/** Endereço público do sistema, pra onde o Mercado Pago devolve o usuário. */
export function urlDoSistema() {
  if (process.env["APP_URL"]) return process.env["APP_URL"].replace(/\/$/, "");
  if (process.env["VERCEL_ENV"] === "production") return "https://curralonline.com";
  if (process.env["VERCEL_URL"]) return `https://${process.env["VERCEL_URL"]}`;
  return "http://127.0.0.1:5173";
}

async function chamar<T>(metodo: "GET" | "POST" | "PUT", caminho: string, corpo?: unknown) {
  const token = tokenMercadoPago();
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
    // Fica no log do servidor (sem o token) pra dar pra investigar depois.
    console.error(
      `[mercadopago] ${metodo} ${caminho} -> ${resposta.status}`,
      JSON.stringify({ message: json["message"], error: json["error"], cause: json["cause"] }),
    );
    if (resposta.status === 401 || resposta.status === 403) {
      throw new Error(
        "O pagamento online está com a credencial do Mercado Pago inválida. Já fomos avisados; tente de novo mais tarde.",
      );
    }
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
