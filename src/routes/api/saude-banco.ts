import { createFileRoute } from "@tanstack/react-router";

/**
 * Diagnóstico do banco nos links de teste (preview) da Vercel: diz a qual
 * banco o sistema está ligado e quantos registros enxerga — só contagens,
 * nenhum dado pessoal. Em produção responde 404.
 */
export const Route = createFileRoute("/api/saude-banco")({
  server: {
    handlers: {
      GET: async () => {
        if (process.env["VERCEL_ENV"] === "production") {
          return new Response("Not found", { status: 404 });
        }
        const json = (dados: unknown, status = 200) =>
          new Response(JSON.stringify(dados, null, 2), {
            status,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        const { conexao, urlBanco } = await import("@/lib/pg.server");
        const url = urlBanco();
        let host: string | null = null;
        let banco: string | null = null;
        try {
          const u = new URL(url ?? "");
          host = u.hostname;
          banco = u.pathname.replace(/^\//, "") || null;
        } catch {
          // sem URL válida
        }
        if (!url) return json({ ok: false, erro: "DATABASE_URL não definida" }, 500);
        try {
          // mesmo caminho do sistema: garante o esquema (e as migrações) antes de contar
          const sql = await conexao();
          const [info] = await sql`select current_database() as banco, version() as versao`;
          const tabelas: { table_name: string }[] = await sql`
            select table_name from information_schema.tables
            where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`;
          const nomes = tabelas.map((t) => t.table_name);
          const contagens: Record<string, number> = {};
          for (const t of [
            "usuarios",
            "fazendas",
            "animais",
            "manejos",
            "financeiro_lancamentos",
          ]) {
            if (!nomes.includes(t)) continue;
            const [linha] = await sql`select count(*)::int as n from ${sql(t)}`;
            contagens[t] = linha?.["n"] ?? 0;
          }
          // Planos: quantas fazendas têm acesso total (cadastros antigos) e
          // quantas já nasceram sob os planos.
          let planos: Record<string, number | string | null> | undefined;
          const temColuna: { n: number }[] = await sql`
            select count(*)::int as n from information_schema.columns
            where table_schema = current_schema()
              and table_name = 'fazendas' and column_name = 'acesso_total'`;
          if ((temColuna[0]?.n ?? 0) > 0) {
            const [p] = await sql`
              select count(*) filter (where acesso_total)::int as acesso_total,
                     count(*) filter (where not acesso_total)::int as sob_planos,
                     min(created_at) filter (where not acesso_total) as sob_planos_desde
              from fazendas`;
            planos = {
              acesso_total: p?.["acesso_total"] ?? 0,
              sob_planos: p?.["sob_planos"] ?? 0,
              sob_planos_desde: p?.["sob_planos_desde"] ?? null,
            };
          }
          const { diagnosticoMercadoPago } = await import("@/lib/mercadopago.server");
          const mercadopago = await diagnosticoMercadoPago();
          // Assinaturas gravadas aqui x status no Mercado Pago (sem e-mail).
          let assinaturasLocais: unknown[] = [];
          if (nomes.includes("assinaturas")) {
            const { mercadoPago } = await import("@/lib/mercadopago.server");
            const linhas: {
              plano: string;
              status: string;
              mp: string | null;
              criada: Date;
              plano_fazenda: string;
            }[] = await sql`
              select a.plano, a.status, a.mp_preapproval_id as mp, a.created_at as criada,
                     f.plano as plano_fazenda
              from assinaturas a join fazendas f on f.id = a.fazenda_id
              order by a.created_at desc limit 10`;
            assinaturasLocais = await Promise.all(
              linhas.map(async (l) => ({
                criada: l.criada,
                plano: l.plano,
                status_aqui: l.status,
                plano_da_fazenda: l.plano_fazenda,
                status_no_mp: l.mp
                  ? await mercadoPago
                      .buscar(l.mp)
                      .then((p) => p.status)
                      .catch((e: Error) => `erro: ${e.message}`)
                  : null,
              })),
            );
          }
          return json({
            ok: true,
            mercadopago,
            assinaturasLocais,
            planos,
            host,
            banco_na_url: banco,
            banco_conectado: info?.["banco"],
            versao: String(info?.["versao"] ?? "").split(" on ")[0],
            tabelas: nomes.length,
            contagens,
          });
        } catch (erro) {
          return json({ ok: false, host, banco_na_url: banco, erro: (erro as Error).message }, 500);
        }
      },
    },
  },
});
