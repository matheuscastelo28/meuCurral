/**
 * Acesso compartilhado: o dono convida um veterinário ou colaborador por
 * e-mail; ao aceitar, a pessoa vira membro (fazenda_membros) e troca de
 * fazenda pelo menu. O limite de colaboradores segue o plano da fazenda
 * (usuários do plano − o dono); veterinário não conta nesse limite.
 */
import { createServerFn } from "@tanstack/react-start";
import { planoDaFazenda } from "./planos";
import type { Sql } from "./pg.server";

export const PAPEIS = ["veterinario", "colaborador"] as const;
export type PapelMembro = (typeof PAPEIS)[number];
/** Veterinários por fazenda, em qualquer plano. */
const MAX_VETERINARIOS = 2;

function erro(mensagem: string) {
  return { data: null, error: { message: mensagem } };
}

async function banco(): Promise<Sql> {
  const { conexao } = await import("./pg.server");
  return conexao();
}

async function usuarioDaSessao(sql: Sql, token: string | null | undefined) {
  if (!token) return null;
  const linhas: { id: string; email: string; nome: string | null }[] = await sql`
    select u.id, u.email, p.nome from sessoes s
    join usuarios u on u.id = s.user_id
    left join perfis p on p.id = u.id
    where s.token = ${token} limit 1`;
  return linhas[0] ?? null;
}

async function fazendaDoDono(sql: Sql, userId: string, fazendaId: string) {
  const linhas: { id: string; nome: string; plano: string | null; acesso_total: boolean | null }[] =
    await sql`select id, nome, plano, acesso_total from fazendas
              where id = ${fazendaId} and dono_id = ${userId}`;
  return linhas[0] ?? null;
}

/** Fazendas que a pessoa acessa: a(s) dela e as em que é membro. */
export const minhasFazendas = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null }) => dados)
  .handler(async ({ data }) => {
    try {
      const sql = await banco();
      const u = await usuarioDaSessao(sql, data.token);
      if (!u) return erro("Não autenticado.");
      const linhas: {
        id: string;
        nome: string;
        cidade: string | null;
        estado: string | null;
        papel: string;
        dono_nome: string | null;
      }[] = await sql`
        select f.id, f.nome, f.cidade, f.estado,
          case when f.dono_id = ${u.id} then 'dono' else m.papel end as papel,
          p.nome as dono_nome
        from fazendas f
        left join fazenda_membros m on m.fazenda_id = f.id and m.user_id = ${u.id}
        left join perfis p on p.id = f.dono_id
        where f.dono_id = ${u.id} or m.user_id = ${u.id}
        order by (f.dono_id = ${u.id}) desc, f.created_at asc`;
      return { data: linhas, error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao listar fazendas.");
    }
  });

/** Equipe da fazenda (só o dono vê): membros, convites pendentes e limites. */
export const listarEquipe = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null; fazendaId: string }) => dados)
  .handler(async ({ data }) => {
    try {
      const sql = await banco();
      const u = await usuarioDaSessao(sql, data.token);
      if (!u) return erro("Não autenticado.");
      const fazenda = await fazendaDoDono(sql, u.id, data.fazendaId);
      if (!fazenda) return erro("Só o dono da fazenda gerencia a equipe.");
      const membros: {
        id: string;
        nome: string | null;
        email: string;
        papel: string;
        desde: Date;
      }[] = await sql`
          select m.id, p.nome, us.email, m.papel, m.created_at as desde
          from fazenda_membros m
          join usuarios us on us.id = m.user_id
          left join perfis p on p.id = m.user_id
          where m.fazenda_id = ${fazenda.id}
          order by m.created_at`;
      const convites: { id: string; email: string; papel: string; token: string; criado: Date }[] =
        await sql`
          select id, email, papel, token, created_at as criado from convites
          where fazenda_id = ${fazenda.id} and status = 'pendente'
          order by created_at`;
      const { urlDoSistema } = await import("./mercadopago.server");
      const plano = planoDaFazenda(fazenda);
      const conta = (papel: string) =>
        membros.filter((m) => m.papel === papel).length +
        convites.filter((c) => c.papel === papel).length;
      return {
        data: {
          membros: membros.map((m) => ({ ...m, desde: new Date(m.desde).toISOString() })),
          convites: convites.map((c) => ({
            id: c.id,
            email: c.email,
            papel: c.papel,
            link: `${urlDoSistema()}/convite?token=${c.token}`,
            criado: new Date(c.criado).toISOString(),
          })),
          limites: {
            colaboradores: {
              usados: conta("colaborador"),
              max: Number.isFinite(plano.limiteUsuarios) ? plano.limiteUsuarios - 1 : null,
            },
            veterinarios: { usados: conta("veterinario"), max: MAX_VETERINARIOS },
          },
          plano: plano.nome,
        },
        error: null,
      };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao listar a equipe.");
    }
  });

export const convidarMembro = createServerFn({ method: "POST" })
  .inputValidator(
    (dados: { token: string | null; fazendaId: string; email: string; papel: string }) => dados,
  )
  .handler(async ({ data }) => {
    try {
      const sql = await banco();
      const u = await usuarioDaSessao(sql, data.token);
      if (!u) return erro("Não autenticado.");
      const fazenda = await fazendaDoDono(sql, u.id, data.fazendaId);
      if (!fazenda) return erro("Só o dono da fazenda pode convidar.");
      const papel = data.papel as PapelMembro;
      if (!PAPEIS.includes(papel)) return erro("Escolha veterinário ou colaborador.");
      const email = data.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro("Informe um e-mail válido.");
      if (email === u.email.toLowerCase()) return erro("Esse é o seu próprio e-mail.");

      const jaMembro: { id: string }[] = await sql`
        select m.id from fazenda_membros m join usuarios us on us.id = m.user_id
        where m.fazenda_id = ${fazenda.id} and lower(us.email) = ${email}`;
      if (jaMembro.length > 0) return erro("Essa pessoa já acessa a fazenda.");

      const { urlDoSistema } = await import("./mercadopago.server");
      const pendente: { token: string; papel: string }[] = await sql`
        select token, papel from convites
        where fazenda_id = ${fazenda.id} and status = 'pendente' and lower(email) = ${email}`;
      if (pendente[0] && pendente[0].papel === papel) {
        return {
          data: {
            link: `${urlDoSistema()}/convite?token=${pendente[0].token}`,
            emailEnviado: false,
            jaExistia: true,
          },
          error: null,
        };
      }

      // Limites: colaborador segue os usuários do plano; veterinário, fixo.
      const usados: { n: number }[] = await sql`
        select
          (select count(*) from fazenda_membros where fazenda_id = ${fazenda.id} and papel = ${papel})
          + (select count(*) from convites where fazenda_id = ${fazenda.id} and status = 'pendente'
               and papel = ${papel} and lower(email) <> ${email}) as n`;
      const n = Number(usados[0]?.n ?? 0);
      const plano = planoDaFazenda(fazenda);
      if (papel === "colaborador") {
        const max = plano.limiteUsuarios - 1;
        if (n >= max) {
          return erro(
            max <= 0
              ? `O plano ${plano.nome} tem 1 usuário. Vários usuários fazem parte do plano Profissional.`
              : `O plano ${plano.nome} permite ${max} colaborador${max === 1 ? "" : "es"} além de você.`,
          );
        }
      } else if (n >= MAX_VETERINARIOS) {
        return erro(`Cada fazenda pode ter até ${MAX_VETERINARIOS} veterinários.`);
      }

      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      await sql`
        update convites set status = 'cancelado', updated_at = now()
        where fazenda_id = ${fazenda.id} and status = 'pendente' and lower(email) = ${email}`;
      await sql`
        insert into convites (fazenda_id, email, papel, token, convidado_por)
        values (${fazenda.id}, ${email}, ${papel}, ${token}, ${u.id})`;
      const link = `${urlDoSistema()}/convite?token=${token}`;
      const { enviarConviteEmail } = await import("./email.server");
      const emailEnviado = await enviarConviteEmail({
        to: email,
        fazenda: fazenda.nome,
        papel,
        quem: u.nome,
        link,
      });
      return { data: { link, emailEnviado, jaExistia: false }, error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao convidar.");
    }
  });

export const cancelarConvite = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null; fazendaId: string; conviteId: string }) => dados)
  .handler(async ({ data }) => {
    try {
      const sql = await banco();
      const u = await usuarioDaSessao(sql, data.token);
      if (!u) return erro("Não autenticado.");
      if (!(await fazendaDoDono(sql, u.id, data.fazendaId))) return erro("Sem permissão.");
      await sql`
        update convites set status = 'cancelado', updated_at = now()
        where id = ${data.conviteId} and fazenda_id = ${data.fazendaId} and status = 'pendente'`;
      return { data: { ok: true }, error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao cancelar o convite.");
    }
  });

/** O dono tira alguém da equipe, ou o próprio membro sai da fazenda. */
export const removerMembro = createServerFn({ method: "POST" })
  .inputValidator(
    (dados: { token: string | null; fazendaId: string; membroId?: string | null }) => dados,
  )
  .handler(async ({ data }) => {
    try {
      const sql = await banco();
      const u = await usuarioDaSessao(sql, data.token);
      if (!u) return erro("Não autenticado.");
      const dono = await fazendaDoDono(sql, u.id, data.fazendaId);
      const apagados =
        dono && data.membroId
          ? await sql`delete from fazenda_membros
                    where id = ${data.membroId} and fazenda_id = ${data.fazendaId} returning id`
          : await sql`delete from fazenda_membros
                    where fazenda_id = ${data.fazendaId} and user_id = ${u.id} returning id`;
      if (apagados.length === 0) return erro("Acesso não encontrado.");
      return { data: { ok: true }, error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao remover o acesso.");
    }
  });

/** Dados do convite para a tela de aceite (não exige login). */
export const verConvite = createServerFn({ method: "POST" })
  .inputValidator((dados: { conviteToken: string }) => dados)
  .handler(async ({ data }) => {
    try {
      const sql = await banco();
      const linhas: {
        email: string;
        papel: string;
        status: string;
        fazenda: string;
        cidade: string | null;
        estado: string | null;
        quem: string | null;
      }[] = await sql`
        select c.email, c.papel, c.status, f.nome as fazenda, f.cidade, f.estado, p.nome as quem
        from convites c
        join fazendas f on f.id = c.fazenda_id
        left join perfis p on p.id = c.convidado_por
        where c.token = ${data.conviteToken} limit 1`;
      if (!linhas[0]) return erro("Convite não encontrado.");
      return { data: linhas[0], error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao abrir o convite.");
    }
  });

export const aceitarConvite = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null; conviteToken: string }) => dados)
  .handler(async ({ data }) => {
    try {
      const sql = await banco();
      const u = await usuarioDaSessao(sql, data.token);
      if (!u) return erro("Entre na sua conta para aceitar o convite.");
      const resultado = await sql.begin(async (tx) => {
        const cs: {
          id: string;
          fazenda_id: string;
          email: string;
          papel: string;
          status: string;
          dono_id: string;
        }[] = await tx`
          select c.id, c.fazenda_id, c.email, c.papel, c.status, f.dono_id
          from convites c join fazendas f on f.id = c.fazenda_id
          where c.token = ${data.conviteToken} for update of c`;
        const c = cs[0];
        if (!c) throw new Error("Convite não encontrado.");
        if (c.status === "cancelado")
          throw new Error("Este convite foi cancelado por quem enviou.");
        if (c.email.toLowerCase() !== u.email.toLowerCase()) {
          throw new Error(
            `Este convite foi enviado para ${c.email}. Entre com essa conta para aceitar.`,
          );
        }
        if (c.dono_id === u.id) throw new Error("Você já é o dono desta fazenda.");
        await tx`
          insert into fazenda_membros (fazenda_id, user_id, papel)
          values (${c.fazenda_id}, ${u.id}, ${c.papel})
          on conflict (fazenda_id, user_id) do update set papel = excluded.papel, updated_at = now()`;
        await tx`
          update convites set status = 'aceito', aceito_por = ${u.id}, updated_at = now()
          where id = ${c.id}`;
        return { fazendaId: c.fazenda_id };
      });
      return { data: resultado, error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao aceitar o convite.");
    }
  });

/**
 * Relatório mensal do veterinário: nas fazendas em que a pessoa é
 * veterinária, os atendimentos (dias com registro lançado por ela), a
 * sanidade e a reprodução do mês.
 */
export const relatorioVeterinario = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null; mes: string }) => dados)
  .handler(async ({ data }) => {
    try {
      if (!/^\d{4}-\d{2}$/.test(data.mes)) return erro("Mês inválido.");
      const sql = await banco();
      const u = await usuarioDaSessao(sql, data.token);
      if (!u) return erro("Não autenticado.");
      const inicio = `${data.mes}-01`;
      const [a, m] = data.mes.split("-").map(Number) as [number, number];
      const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);

      const fazendas: {
        id: string;
        nome: string;
        cidade: string | null;
        estado: string | null;
        dono: string | null;
      }[] = await sql`
          select f.id, f.nome, f.cidade, f.estado, p.nome as dono
          from fazenda_membros mb
          join fazendas f on f.id = mb.fazenda_id
          left join perfis p on p.id = f.dono_id
          where mb.user_id = ${u.id} and mb.papel = 'veterinario'
          order by f.nome`;
      const ids = fazendas.map((f) => f.id);
      if (ids.length === 0) {
        return {
          data: { mes: data.mes, inicio, fim, veterinario: u.nome, fazendas: [] },
          error: null,
        };
      }
      const manejos: {
        fazenda_id: string;
        data: Date;
        tipo: string | null;
        descricao: string | null;
        animal: string | null;
        criado_por: string | null;
      }[] = await sql`
        select m.fazenda_id, m.data, m.tipo, m.descricao,
          coalesce(a.nome, a.brinco) as animal, m.criado_por
        from manejos m left join animais a on a.id = m.animal_id
        where m.fazenda_id = any(${ids}) and m.data between ${inicio} and ${fim}
          and m.tipo in ('vacina', 'vermifugo', 'tratamento', 'outro')
        order by m.data`;
      const repro: {
        fazenda_id: string;
        data: Date;
        tipo: string | null;
        resultado: string | null;
        animal: string | null;
        criado_por: string | null;
      }[] = await sql`
        select r.fazenda_id, r.data, r.tipo, r.resultado,
          coalesce(a.nome, a.brinco) as animal, r.criado_por
        from reproducao r left join animais a on a.id = r.animal_id
        where r.fazenda_id = any(${ids}) and r.data between ${inicio} and ${fim}
        order by r.data`;
      const dia = (d: Date) => new Date(d).toISOString().slice(0, 10);

      const porFazenda = fazendas.map((f) => {
        const ms = manejos.filter((x) => x.fazenda_id === f.id);
        const rs = repro.filter((x) => x.fazenda_id === f.id);
        const atendimentos = new Set(
          [...ms, ...rs].filter((x) => x.criado_por === u.id).map((x) => dia(x.data)),
        );
        const conta = <T extends { tipo: string | null }>(l: T[], t: string) =>
          l.filter((x) => x.tipo === t).length;
        return {
          id: f.id,
          nome: f.nome,
          local: [f.cidade, f.estado].filter(Boolean).join("/"),
          dono: f.dono,
          atendimentos: [...atendimentos].sort(),
          sanidade: {
            vacinas: conta(ms, "vacina"),
            vermifugos: conta(ms, "vermifugo"),
            tratamentos: conta(ms, "tratamento"),
            outros: conta(ms, "outro"),
          },
          reproducao: {
            servicos: conta(rs, "cobertura") + conta(rs, "inseminacao"),
            diagnosticosPositivos: rs.filter(
              (x) => x.tipo === "diagnostico" && x.resultado !== "negativo",
            ).length,
            diagnosticosNegativos: rs.filter(
              (x) => x.tipo === "diagnostico" && x.resultado === "negativo",
            ).length,
            partos: conta(rs, "parto"),
          },
          registros: [
            ...ms.map((x) => ({
              data: dia(x.data),
              area: "Sanidade",
              tipo: x.tipo ?? "",
              detalhe: x.descricao ?? "",
              animal: x.animal ?? "",
              seu: x.criado_por === u.id,
            })),
            ...rs.map((x) => ({
              data: dia(x.data),
              area: "Reprodução",
              tipo: x.tipo ?? "",
              detalhe: x.tipo === "diagnostico" ? (x.resultado ?? "") : "",
              animal: x.animal ?? "",
              seu: x.criado_por === u.id,
            })),
          ].sort((p, q) => p.data.localeCompare(q.data)),
        };
      });
      return {
        data: { mes: data.mes, inicio, fim, veterinario: u.nome, fazendas: porFazenda },
        error: null,
      };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao montar o relatório.");
    }
  });
