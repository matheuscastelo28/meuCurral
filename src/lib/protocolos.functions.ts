/**
 * Revisão da tabela de protocolos de vacinação pelo veterinário. Quem tem
 * acesso à fazenda vê a situação de cada protocolo; só o veterinário vinculado
 * à fazenda (papel "veterinario") pode validar ou pedir ajuste.
 */
import { createServerFn } from "@tanstack/react-start";
import type { Sql } from "./pg.server";
import { PROTOCOLOS, versaoDoProtocolo, type ValidacaoProtocolo } from "./protocolos-sanitarios";

type Resp<T> = { data: T; error: null } | { data: null; error: { message: string } };
const erro = (message: string) => ({ data: null, error: { message } }) as const;

async function banco(): Promise<Sql> {
  const { conexao } = await import("./pg.server");
  return conexao();
}

async function acesso(sql: Sql, token: string | null | undefined, fazendaId: string) {
  if (!token) return null;
  const l: { id: string; papel: string }[] = await sql`
    select u.id,
      case when f.dono_id = u.id then 'dono' else m.papel end as papel
    from sessoes s
    join usuarios u on u.id = s.user_id
    join fazendas f on f.id = ${fazendaId}
    left join fazenda_membros m on m.fazenda_id = f.id and m.user_id = u.id
    where s.token = ${token} and (f.dono_id = u.id or m.id is not null)
    limit 1`;
  return l[0] ?? null;
}

export const listarValidacoes = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string | null; fazendaId: string }) => d)
  .handler(async ({ data }): Promise<Resp<{ papel: string; validacoes: ValidacaoProtocolo[] }>> => {
    try {
      const sql = await banco();
      const a = await acesso(sql, data.token, data.fazendaId);
      if (!a) return erro("Sem acesso a esta fazenda.");
      const linhas: {
        protocolo_id: string;
        versao: string;
        status: "validado" | "ajustar";
        nota: string | null;
        por: string | null;
        em: Date;
      }[] = await sql`
          select v.protocolo_id, v.versao, v.status, v.nota, p.nome as por, v.updated_at as em
          from protocolos_validacao v left join perfis p on p.id = v.user_id
          where v.fazenda_id = ${data.fazendaId}`;
      return {
        data: {
          papel: a.papel,
          validacoes: linhas.map((l) => ({ ...l, em: new Date(l.em).toISOString() })),
        },
        error: null,
      };
    } catch (e) {
      console.error("listarValidacoes", e);
      return erro("Não conseguimos carregar a revisão agora.");
    }
  });

export const validarProtocolo = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      token: string | null;
      fazendaId: string;
      protocoloId: string;
      status: "validado" | "ajustar" | "limpar";
      nota?: string | null;
    }) => d,
  )
  .handler(async ({ data }): Promise<Resp<{ ok: true }>> => {
    try {
      const sql = await banco();
      const a = await acesso(sql, data.token, data.fazendaId);
      if (!a) return erro("Sem acesso a esta fazenda.");
      if (a.papel !== "veterinario") {
        return erro("Só o veterinário vinculado à fazenda pode validar os protocolos.");
      }
      const protocolo = PROTOCOLOS.find((p) => p.id === data.protocoloId);
      if (!protocolo) return erro("Protocolo desconhecido.");
      if (data.status === "limpar") {
        await sql`delete from protocolos_validacao
                  where fazenda_id = ${data.fazendaId} and protocolo_id = ${protocolo.id}`;
        return { data: { ok: true }, error: null };
      }
      const nota = (data.nota ?? "").trim().slice(0, 500) || null;
      if (data.status === "ajustar" && !nota) {
        return erro("Explique o que ajustar (idade, dose, intervalo…).");
      }
      await sql`
        insert into protocolos_validacao (fazenda_id, protocolo_id, versao, status, nota, user_id)
        values (${data.fazendaId}, ${protocolo.id}, ${versaoDoProtocolo(protocolo)}, ${data.status}, ${nota}, ${a.id})
        on conflict (fazenda_id, protocolo_id) do update
          set versao = excluded.versao, status = excluded.status, nota = excluded.nota,
              user_id = excluded.user_id, updated_at = now()`;
      return { data: { ok: true }, error: null };
    } catch (e) {
      console.error("validarProtocolo", e);
      return erro("Não conseguimos salvar agora.");
    }
  });
