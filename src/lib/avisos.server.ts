/**
 * Avisos fora do sistema: todo dia às 6h (horário de Brasília) manda, por
 * e-mail e por notificação no celular, o que vence amanhã na fazenda — mesmas
 * regras da página de Notificações (lib/notificacoes). Quem recebe: o dono e
 * os colaboradores de fazendas cujo plano inclui os avisos. Roda por uma
 * tarefa agendada (Vercel Cron → /api/cron-avisos) e pode rodar de novo sem
 * repetir: cada pessoa/canal/dia só sai uma vez (tabela avisos_enviados).
 */
import { montarNotificacoes, type DadosNotificacoes, type Notificacao } from "./notificacoes";
import { planoDaFazenda } from "./planos";
import type { Sql } from "./pg.server";
import type { ItemAviso } from "./email.server";

/** Dia seguinte no horário de Brasília (sem horário de verão). */
export function diaDeAmanha(agora = new Date()): string {
  const d = new Date(agora.getTime() - 3 * 3600_000);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type Destinatario = {
  userId: string;
  email: string;
  nome: string | null;
  avisoEmail: boolean;
  prefs: { vacina: boolean; pesagem: boolean; parto: boolean };
  fazendas: { nome: string; itens: ItemAviso[] }[];
};

const TIPOS_DO_DIA = new Set(["agenda", "sanidade", "financeiro", "reproducao"]);

async function itensDaFazenda(
  sql: Sql,
  fazendaId: string,
  amanha: string,
  prefs: Destinatario["prefs"],
): Promise<Notificacao[]> {
  const [eventos, contas, parcelas, animais, reproducao] = await Promise.all([
    sql`select id, titulo, data, tipo from eventos_agenda
        where fazenda_id = ${fazendaId} and concluido = false and cancelado = false
          and data = ${amanha}`,
    sql`select id, tipo, descricao, status from contas where fazenda_id = ${fazendaId}`,
    sql`select id, conta_id, numero, total_parcelas, valor, vencimento, status from parcelas
        where fazenda_id = ${fazendaId} and status = 'pendente' and vencimento = ${amanha}`,
    sql`select id, nome, brinco, categoria, especie, sexo, status, lote, created_at, nascimento
        from animais where fazenda_id = ${fazendaId}`,
    sql`select id, animal_id, tipo, data, resultado, previsao_parto, touro, created_at
        from reproducao where fazenda_id = ${fazendaId}`,
  ]);
  const dados = {
    // "Hoje" do cálculo é amanhã: o que cai nesse dia é o que o aviso lista.
    hoje: amanha,
    eventos: eventos,
    contas,
    parcelas,
    aReceber: [],
    animais,
    reproducao,
    ultimaPesagem: {},
    uso: { usados: 0, limite: Number.POSITIVE_INFINITY, planoNome: "" },
    prefs,
    indicesAvancados: false,
  } as unknown as DadosNotificacoes;
  // O cálculo usa amanhã como "hoje", então os textos relativos saem com
  // "hoje" ("vence hoje", "previsão hoje"); no aviso, isso é amanhã.
  return montarNotificacoes(dados)
    .filter((n) => n.data === amanha && TIPOS_DO_DIA.has(n.tipo))
    .map((n) => ({ ...n, detalhe: n.detalhe.replace(/\bhoje\b/g, "amanhã") }));
}

/** Quem recebe o quê amanhã (sem enviar nada). */
export async function montarAvisosDoDia(sql: Sql, amanha: string): Promise<Destinatario[]> {
  const fazendas: {
    id: string;
    nome: string;
    dono_id: string;
    plano: string | null;
    acesso_total: boolean | null;
  }[] = await sql`select id, nome, dono_id, plano, acesso_total from fazendas`;
  const elegiveis = fazendas.filter((f) => planoDaFazenda(f).recursos.alertasEmail);
  if (elegiveis.length === 0) return [];

  const ids = elegiveis.map((f) => f.id);
  const membros: { fazenda_id: string; user_id: string }[] = await sql`
    select fazenda_id, user_id from fazenda_membros
    where fazenda_id = any(${ids}) and papel = 'colaborador'`;
  const pessoas = new Set<string>([
    ...elegiveis.map((f) => f.dono_id),
    ...membros.map((m) => m.user_id),
  ]);
  const usuarios: {
    id: string;
    email: string;
    nome: string | null;
    aviso_email: boolean | null;
    alerta_vacina: boolean | null;
    alerta_pesagem: boolean | null;
    alerta_parto: boolean | null;
  }[] = await sql`
    select u.id, u.email, p.nome, p.aviso_email, p.alerta_vacina, p.alerta_pesagem, p.alerta_parto
    from usuarios u left join perfis p on p.id = u.id
    where u.id = any(${[...pessoas]})`;
  const porUsuario = new Map<string, Destinatario>();
  for (const u of usuarios) {
    porUsuario.set(u.id, {
      userId: u.id,
      email: u.email,
      nome: u.nome,
      avisoEmail: u.aviso_email ?? true,
      prefs: {
        vacina: u.alerta_vacina ?? true,
        pesagem: u.alerta_pesagem ?? true,
        parto: u.alerta_parto ?? true,
      },
      fazendas: [],
    });
  }

  for (const f of elegiveis) {
    const equipe = [
      f.dono_id,
      ...membros.filter((m) => m.fazenda_id === f.id).map((m) => m.user_id),
    ];
    // Uma consulta por fazenda e por jogo de preferências (quase sempre um só).
    const cache = new Map<string, Notificacao[]>();
    for (const uid of equipe) {
      const dest = porUsuario.get(uid);
      if (!dest) continue;
      const chave = `${dest.prefs.vacina}${dest.prefs.pesagem}${dest.prefs.parto}`;
      if (!cache.has(chave)) cache.set(chave, await itensDaFazenda(sql, f.id, amanha, dest.prefs));
      const itens = cache.get(chave)!;
      if (itens.length > 0) {
        dest.fazendas.push({
          nome: f.nome,
          itens: itens.map((n) => ({ titulo: n.titulo, detalhe: n.detalhe, tipo: n.tipo })),
        });
      }
    }
  }
  return [...porUsuario.values()].filter((d) => d.fazendas.length > 0);
}

export interface ResumoEnvio {
  dia: string;
  destinatarios: number;
  emails: number;
  pushes: number;
  jaEnviados: number;
  falhas: number;
}

async function reservar(sql: Sql, userId: string, dia: string, canal: string): Promise<boolean> {
  const r = await sql`
    insert into avisos_enviados (user_id, dia, canal) values (${userId}, ${dia}, ${canal})
    on conflict do nothing returning user_id`;
  return r.length > 0;
}

export async function enviarAvisosDoDia(
  sql: Sql,
  opcoes: { amanha?: string; simular?: boolean } = {},
): Promise<ResumoEnvio & { detalhes?: { email: string; itens: number }[] }> {
  const amanha = opcoes.amanha ?? diaDeAmanha();
  const hoje = new Date(new Date(`${amanha}T00:00:00Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const dest = await montarAvisosDoDia(sql, amanha);
  const resumo: ResumoEnvio = {
    dia: amanha,
    destinatarios: dest.length,
    emails: 0,
    pushes: 0,
    jaEnviados: 0,
    falhas: 0,
  };
  if (opcoes.simular) {
    return {
      ...resumo,
      detalhes: dest.map((d) => ({
        email: d.email.replace(/^(.).*(@.*)$/, "$1***$2"),
        itens: d.fazendas.reduce((s, f) => s + f.itens.length, 0),
      })),
    };
  }
  const { enviarAvisoDiarioEmail } = await import("./email.server");
  const { enviarPush } = await import("./push.server");
  const { urlDoSistema } = await import("./mercadopago.server");

  for (const d of dest) {
    const total = d.fazendas.reduce((s, f) => s + f.itens.length, 0);
    if (d.avisoEmail) {
      if (await reservar(sql, d.userId, hoje, "email")) {
        const r = await enviarAvisoDiarioEmail({
          to: d.email,
          nome: d.nome,
          dataAmanha: amanha,
          fazendas: d.fazendas,
          link: `${urlDoSistema()}/notificacoes`,
        });
        if (r.enviado) resumo.emails++;
        else {
          resumo.falhas++;
          // Não saiu: libera para a próxima rodada tentar de novo.
          await sql`delete from avisos_enviados where user_id = ${d.userId} and dia = ${hoje} and canal = 'email'`;
        }
      } else resumo.jaEnviados++;
    }
    const temAparelho: { n: number }[] = await sql`
      select count(*)::int as n from push_assinaturas where user_id = ${d.userId}`;
    if ((temAparelho[0]?.n ?? 0) > 0) {
      if (await reservar(sql, d.userId, hoje, "push")) {
        const primeiros = d.fazendas
          .flatMap((f) => f.itens)
          .slice(0, 3)
          .map((i) => i.titulo)
          .join(" · ");
        const entregues = await enviarPush(sql, d.userId, {
          titulo: `Amanhã: ${total} ${total === 1 ? "compromisso" : "compromissos"}`,
          corpo: primeiros + (total > 3 ? ` e mais ${total - 3}` : ""),
          url: "/notificacoes",
        });
        if (entregues > 0) resumo.pushes++;
        else {
          resumo.falhas++;
          await sql`delete from avisos_enviados where user_id = ${d.userId} and dia = ${hoje} and canal = 'push'`;
        }
      } else resumo.jaEnviados++;
    }
  }
  return resumo;
}
