/**
 * Notificações no celular (Web Push): chave pública, cadastro e remoção do
 * aparelho, e um envio de teste. O envio diário fica em avisos.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { planoDaFazenda } from "./planos";
import type { Sql } from "./pg.server";

type Resp<T> = { data: T; error: null } | { data: null; error: { message: string } };
const erro = (message: string) => ({ data: null, error: { message } }) as const;

async function banco(): Promise<Sql> {
  const { conexao } = await import("./pg.server");
  return conexao();
}

async function usuario(sql: Sql, token: string | null | undefined) {
  if (!token) return null;
  const l: { id: string }[] = await sql`
    select u.id from sessoes s join usuarios u on u.id = s.user_id where s.token = ${token} limit 1`;
  return l[0] ?? null;
}

/** Algum plano da pessoa (dona ou colaboradora) inclui os avisos fora do sistema? */
async function temPlanoComAvisos(sql: Sql, userId: string): Promise<boolean> {
  const fs: { plano: string | null; acesso_total: boolean | null }[] = await sql`
    select f.plano, f.acesso_total from fazendas f
    where f.dono_id = ${userId}
       or exists (select 1 from fazenda_membros m where m.fazenda_id = f.id
                  and m.user_id = ${userId} and m.papel = 'colaborador')`;
  return fs.some((f) => planoDaFazenda(f).recursos.alertasEmail);
}

export const statusPush = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string | null; endpoint?: string | null }) => d)
  .handler(
    async ({ data }): Promise<Resp<{ chave: string; liberado: boolean; ativo: boolean }>> => {
      try {
        const sql = await banco();
        const u = await usuario(sql, data.token);
        if (!u) return erro("Não autenticado.");
        const { chavesVapid } = await import("./push.server");
        const { publica } = await chavesVapid(sql);
        const ativo = data.endpoint
          ? (
              await sql`select 1 from push_assinaturas where user_id = ${u.id} and endpoint = ${data.endpoint}`
            ).length > 0
          : false;
        return {
          data: { chave: publica, liberado: await temPlanoComAvisos(sql, u.id), ativo },
          error: null,
        };
      } catch (e) {
        console.error("statusPush", e);
        return erro("Não conseguimos verificar agora.");
      }
    },
  );

export const salvarAssinaturaPush = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      token: string | null;
      endpoint: string;
      p256dh: string;
      auth: string;
      userAgent?: string | null;
    }) => d,
  )
  .handler(async ({ data }): Promise<Resp<{ ok: true }>> => {
    try {
      const sql = await banco();
      const u = await usuario(sql, data.token);
      if (!u) return erro("Não autenticado.");
      if (!/^https:\/\//.test(data.endpoint) || !data.p256dh || !data.auth) {
        return erro("Aparelho inválido.");
      }
      if (!(await temPlanoComAvisos(sql, u.id))) {
        return erro("Notificações no celular fazem parte do plano Caderno ou superior.");
      }
      await sql`
        insert into push_assinaturas (user_id, endpoint, p256dh, auth, user_agent)
        values (${u.id}, ${data.endpoint}, ${data.p256dh}, ${data.auth}, ${(data.userAgent ?? "").slice(0, 200)})
        on conflict (endpoint) do update
          set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;
      return { data: { ok: true }, error: null };
    } catch (e) {
      console.error("salvarAssinaturaPush", e);
      return erro("Não conseguimos ativar agora.");
    }
  });

export const removerAssinaturaPush = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string | null; endpoint: string }) => d)
  .handler(async ({ data }): Promise<Resp<{ ok: true }>> => {
    try {
      const sql = await banco();
      const u = await usuario(sql, data.token);
      if (!u) return erro("Não autenticado.");
      await sql`delete from push_assinaturas where user_id = ${u.id} and endpoint = ${data.endpoint}`;
      return { data: { ok: true }, error: null };
    } catch (e) {
      console.error("removerAssinaturaPush", e);
      return erro("Não conseguimos desativar agora.");
    }
  });

export const testarPush = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string | null }) => d)
  .handler(async ({ data }): Promise<Resp<{ entregues: number }>> => {
    try {
      const sql = await banco();
      const u = await usuario(sql, data.token);
      if (!u) return erro("Não autenticado.");
      const { enviarPush } = await import("./push.server");
      const entregues = await enviarPush(sql, u.id, {
        titulo: "Curral Online",
        corpo: "Pronto! Você vai receber aqui os compromissos do dia seguinte.",
        url: "/notificacoes",
      });
      return { data: { entregues }, error: null };
    } catch (e) {
      console.error("testarPush", e);
      return erro("Não conseguimos enviar o teste.");
    }
  });
