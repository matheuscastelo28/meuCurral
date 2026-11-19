/**
 * Avisos oficiais por e-mail: manda aos donos das fazendas dos estados do
 * aviso (quem não desligou os e-mails nas Preferências), uma vez por pessoa.
 * Chamado ao publicar e, para o que sobrar, pela tarefa agendada das 6h.
 */
import type { Sql } from "./pg.server";

export async function enviarEmailsDoAviso(
  sql: Sql,
  avisoId: string,
  limite = 200,
): Promise<{ enviados: number; restantes: number }> {
  const [aviso]: {
    titulo: string;
    texto: string;
    link: string | null;
    estados: string[];
    enviar_email: boolean;
    ativo: boolean;
  }[] = await sql`select titulo, texto, link, estados, enviar_email, ativo
                  from avisos_oficiais where id = ${avisoId}`;
  if (!aviso || !aviso.enviar_email || !aviso.ativo) return { enviados: 0, restantes: 0 };

  const pendentes: { id: string; email: string; nome: string | null }[] = await sql`
    select distinct u.id, u.email, p.nome
    from fazendas f
    join usuarios u on u.id = f.dono_id
    left join perfis p on p.id = u.id
    where (${aviso.estados.length} = 0 or f.estado = any(${aviso.estados}))
      and coalesce(p.aviso_email, true)
      and not exists (select 1 from avisos_oficiais_envios e
                      where e.aviso_id = ${avisoId} and e.user_id = u.id)
    order by u.id
    limit ${limite + 1}`;
  const lote = pendentes.slice(0, limite);
  const { enviarAvisoOficialEmLote } = await import("./email.server");
  const { urlDoSistema } = await import("./mercadopago.server");
  const aceitos = new Set(await enviarAvisoOficialEmLote(aviso, lote, `${urlDoSistema()}/inicio`));
  for (const d of lote) {
    if (aceitos.has(d.email)) {
      await sql`insert into avisos_oficiais_envios (aviso_id, user_id) values (${avisoId}, ${d.id})
                on conflict do nothing`;
    }
  }
  return { enviados: aceitos.size, restantes: Math.max(0, pendentes.length - lote.length) };
}

/** Avisos com e-mail marcado que ainda têm gente por receber (tarefa das 6h). */
export async function enviarEmailsPendentes(sql: Sql): Promise<number> {
  const avisos: { id: string }[] = await sql`
    select id from avisos_oficiais
    where ativo and enviar_email
      and (expira_em is null or expira_em >= (now() at time zone 'America/Fortaleza')::date)
      and created_at > now() - interval '14 days'`;
  let total = 0;
  for (const a of avisos) total += (await enviarEmailsDoAviso(sql, a.id)).enviados;
  return total;
}
