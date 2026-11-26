import { createFileRoute } from "@tanstack/react-router";

/**
 * Tarefa agendada (Vercel Cron, todo dia às 6h de Brasília): manda por e-mail
 * e por notificação no celular o que vence amanhã. Exige
 * `Authorization: Bearer ${CRON_SECRET}` (a Vercel envia sozinha quando a
 * variável existe). `?dry=1` só mostra quem receberia, sem enviar nada.
 */
export const Route = createFileRoute("/api/cron-avisos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const json = (dados: unknown, status = 200) =>
          new Response(JSON.stringify(dados), {
            status,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        const segredo = process.env["CRON_SECRET"];
        const emProducao = process.env["VERCEL_ENV"] === "production";
        if (!segredo && emProducao) {
          return json({ ok: false, erro: "CRON_SECRET não configurada" }, 503);
        }
        if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
          return json({ ok: false, erro: "não autorizado" }, 401);
        }
        const url = new URL(request.url);
        try {
          const { conexao } = await import("@/lib/pg.server");
          const { enviarAvisosDoDia } = await import("@/lib/avisos.server");
          const sql = await conexao();
          const dia = url.searchParams.get("dia") ?? undefined;
          const resumo = await enviarAvisosDoDia(sql, {
            ...(dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? { amanha: dia } : {}),
            simular: url.searchParams.get("dry") === "1",
          });
          // Avisos oficiais com e-mail marcado que ainda faltam enviar.
          let avisosOficiais = 0;
          if (url.searchParams.get("dry") !== "1") {
            const { enviarEmailsPendentes } = await import("@/lib/avisos-oficiais.server");
            avisosOficiais = await enviarEmailsPendentes(sql);
          }
          // Registros de acesso que passaram dos 6 meses do Marco Civil.
          let registrosEliminados = 0;
          if (url.searchParams.get("dry") !== "1") {
            const { eliminarRegistrosVencidos } = await import("@/lib/acesso.server");
            registrosEliminados = await eliminarRegistrosVencidos(sql);
          }
          // Assinaturas canceladas cujo período pago acabou voltam ao Grátis.
          let periodosEncerrados = 0;
          if (url.searchParams.get("dry") !== "1") {
            const { encerrarPeriodosVencidos } = await import("@/lib/mercadopago.server");
            periodosEncerrados = await encerrarPeriodosVencidos(sql);
          }
          return json({
            ok: true,
            ...resumo,
            avisosOficiais,
            registrosEliminados,
            periodosEncerrados,
          });
        } catch (e) {
          console.error("cron-avisos falhou", e);
          return json({ ok: false, erro: "falha ao enviar os avisos" }, 500);
        }
      },
    },
  },
});
