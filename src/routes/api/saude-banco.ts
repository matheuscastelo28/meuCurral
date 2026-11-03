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
        const { sqlCliente, urlBanco } = await import("@/lib/pg.server");
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
          const sql = sqlCliente();
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
          return json({
            ok: true,
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
