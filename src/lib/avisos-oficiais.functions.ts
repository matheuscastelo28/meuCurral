/**
 * Avisos oficiais: o administrador publica (com filtro por estado) e o aviso
 * aparece como faixa no Início da fazenda do estado e, se marcado, por e-mail.
 * Administrador = e-mail listado em ADMIN_EMAILS (variável do ambiente).
 */
import { createServerFn } from "@tanstack/react-start";
import type { Sql } from "./pg.server";
import { UFS } from "./ufs";

type Resp<T> = { data: T; error: null } | { data: null; error: { message: string } };
const erro = (message: string) => ({ data: null, error: { message } }) as const;

export type AvisoOficial = {
  id: string;
  titulo: string;
  texto: string;
  link: string | null;
  estados: string[];
};
export type AvisoAdmin = AvisoOficial & {
  enviar_email: boolean;
  ativo: boolean;
  expira_em: string | null;
  created_at: string;
  emails_enviados: number;
  expirado: boolean;
};

async function banco(): Promise<Sql> {
  const { conexao } = await import("./pg.server");
  return conexao();
}

async function usuario(sql: Sql, token: string | null | undefined) {
  if (!token) return null;
  const l: { id: string; email: string }[] = await sql`
    select u.id, u.email from sessoes s join usuarios u on u.id = s.user_id
    where s.token = ${token} limit 1`;
  return l[0] ?? null;
}

function ehAdmin(email: string): boolean {
  const lista = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.toLowerCase());
}

export const souAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string | null }) => d)
  .handler(async ({ data }): Promise<Resp<{ admin: boolean }>> => {
    try {
      const sql = await banco();
      const u = await usuario(sql, data.token);
      if (!u) return erro("Não autenticado.");
      return { data: { admin: ehAdmin(u.email) }, error: null };
    } catch (e) {
      console.error("souAdmin", e);
      return erro("Não conseguimos verificar agora.");
    }
  });

/** Avisos em vigor para a fazenda (pelo estado dela). */
export const avisosParaMim = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string | null; fazendaId: string }) => d)
  .handler(async ({ data }): Promise<Resp<AvisoOficial[]>> => {
    try {
      const sql = await banco();
      const u = await usuario(sql, data.token);
      if (!u) return erro("Não autenticado.");
      const f: { estado: string | null }[] = await sql`
        select f.estado from fazendas f
        where f.id = ${data.fazendaId}
          and (f.dono_id = ${u.id}
               or exists (select 1 from fazenda_membros m
                          where m.fazenda_id = f.id and m.user_id = ${u.id}))`;
      if (!f[0]) return erro("Sem acesso a esta fazenda.");
      const estado = f[0].estado ?? "";
      const linhas: AvisoOficial[] = await sql`
        select id, titulo, texto, link, estados from avisos_oficiais
        where ativo
          and (expira_em is null or expira_em >= (now() at time zone 'America/Fortaleza')::date)
          and (cardinality(estados) = 0 or ${estado} = any(estados))
        order by created_at desc limit 5`;
      return { data: linhas, error: null };
    } catch (e) {
      console.error("avisosParaMim", e);
      return erro("Não conseguimos carregar os avisos.");
    }
  });

export const listarAvisosAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string | null }) => d)
  .handler(async ({ data }): Promise<Resp<AvisoAdmin[]>> => {
    try {
      const sql = await banco();
      const u = await usuario(sql, data.token);
      if (!u || !ehAdmin(u.email)) return erro("Acesso restrito ao administrador.");
      const linhas: (Omit<AvisoAdmin, "expira_em" | "created_at"> & {
        expira_em: Date | null;
        created_at: Date;
      })[] = await sql`
        select a.id, a.titulo, a.texto, a.link, a.estados, a.enviar_email, a.ativo,
               a.expira_em, a.created_at,
               (select count(*)::int from avisos_oficiais_envios e where e.aviso_id = a.id) as emails_enviados,
               coalesce(a.expira_em < (now() at time zone 'America/Fortaleza')::date, false) as expirado
        from avisos_oficiais a order by a.created_at desc limit 50`;
      return {
        data: linhas.map((l) => ({
          ...l,
          expira_em: l.expira_em ? new Date(l.expira_em).toISOString().slice(0, 10) : null,
          created_at: new Date(l.created_at).toISOString(),
        })),
        error: null,
      };
    } catch (e) {
      console.error("listarAvisosAdmin", e);
      return erro("Não conseguimos carregar agora.");
    }
  });

export const publicarAviso = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      token: string | null;
      titulo: string;
      texto: string;
      link?: string | null;
      estados: string[];
      enviarEmail: boolean;
      expiraEm?: string | null;
    }) => d,
  )
  .handler(async ({ data }): Promise<Resp<{ id: string; emails: number; restantes: number }>> => {
    try {
      const sql = await banco();
      const u = await usuario(sql, data.token);
      if (!u || !ehAdmin(u.email)) return erro("Acesso restrito ao administrador.");
      const titulo = data.titulo.trim().slice(0, 120);
      const texto = data.texto.trim().slice(0, 1000);
      if (!titulo || !texto) return erro("Preencha o título e o texto.");
      const link = (data.link ?? "").trim();
      if (link && !/^https?:\/\/\S+$/i.test(link)) {
        return erro("O link precisa começar com http:// ou https://.");
      }
      const estados = [...new Set(data.estados)].filter((e) => UFS.includes(e));
      const expiraEm =
        data.expiraEm && /^\d{4}-\d{2}-\d{2}$/.test(data.expiraEm) ? data.expiraEm : null;
      const [novo]: { id: string }[] = await sql`
          insert into avisos_oficiais (titulo, texto, link, estados, enviar_email, expira_em, criado_por)
          values (${titulo}, ${texto}, ${link || null}, ${estados}, ${data.enviarEmail}, ${expiraEm}, ${u.id})
          returning id`;
      let emails = 0;
      let restantes = 0;
      if (data.enviarEmail) {
        const { enviarEmailsDoAviso } = await import("./avisos-oficiais.server");
        const r = await enviarEmailsDoAviso(sql, novo!.id, 100);
        emails = r.enviados;
        restantes = r.restantes;
      }
      return { data: { id: novo!.id, emails, restantes }, error: null };
    } catch (e) {
      console.error("publicarAviso", e);
      return erro("Não conseguimos publicar agora.");
    }
  });

export const encerrarAviso = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string | null; id: string }) => d)
  .handler(async ({ data }): Promise<Resp<{ ok: true }>> => {
    try {
      const sql = await banco();
      const u = await usuario(sql, data.token);
      if (!u || !ehAdmin(u.email)) return erro("Acesso restrito ao administrador.");
      await sql`update avisos_oficiais set ativo = false where id = ${data.id}`;
      return { data: { ok: true }, error: null };
    } catch (e) {
      console.error("encerrarAviso", e);
      return erro("Não conseguimos encerrar agora.");
    }
  });
