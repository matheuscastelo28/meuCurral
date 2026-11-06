import { createFileRoute } from "@tanstack/react-router";

/**
 * Aviso (webhook) do Mercado Pago sobre assinaturas. Configure no painel do
 * Mercado Pago → Suas integrações → Webhooks, evento "Planos e assinaturas",
 * com a URL https://curralonline.com/api/mercadopago/webhook.
 *
 * O aviso só diz qual assinatura mudou; o status de verdade é lido da API do
 * Mercado Pago antes de mexer no plano da fazenda.
 */
export const Route = createFileRoute("/api/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const responder = (status: number, corpo: unknown) =>
          new Response(JSON.stringify(corpo), {
            status,
            headers: { "content-type": "application/json" },
          });

        const url = new URL(request.url);
        const corpo = (await request.json().catch(() => ({}))) as {
          type?: string;
          topic?: string;
          data?: { id?: string | number };
        };
        const tipo = corpo.type ?? corpo.topic ?? url.searchParams.get("type") ?? "";
        const dataId = String(url.searchParams.get("data.id") ?? corpo.data?.id ?? "");

        // Outros avisos (pagamentos avulsos etc.) não mudam plano.
        if (!["subscription_preapproval", "preapproval"].includes(tipo) || !dataId) {
          return responder(200, { ok: true, ignorado: true });
        }

        const { webhookAutentico, mercadoPago, aplicarPreapproval } =
          await import("@/lib/mercadopago.server");
        if ((await webhookAutentico(request.headers, dataId)) === "invalido") {
          return responder(401, { ok: false, erro: "assinatura inválida" });
        }
        try {
          const { conexao } = await import("@/lib/pg.server");
          const pre = await mercadoPago.buscar(dataId);
          const status = await aplicarPreapproval(await conexao(), pre);
          return responder(200, { ok: true, status });
        } catch (erro) {
          // 500 faz o Mercado Pago tentar de novo mais tarde.
          return responder(500, {
            ok: false,
            erro: erro instanceof Error ? erro.message : "erro",
          });
        }
      },
    },
  },
});
