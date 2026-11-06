/**
 * Assinatura dos planos pelo Mercado Pago: o navegador só pede pra começar,
 * conferir ou cancelar. Preço vem da tabela de planos do servidor, nunca do
 * navegador, e o plano da fazenda só muda com a confirmação do Mercado Pago.
 */
import { createServerFn } from "@tanstack/react-start";
import { getPlano } from "./planos";

type Contexto = { userId: string; email: string; fazendaId: string; acessoTotal: boolean };

async function contexto(token: string | null): Promise<Contexto | null> {
  const { conexao } = await import("./pg.server");
  const sql = await conexao();
  if (!token) return null;
  const linhas: { user_id: string; email: string; fazenda_id: string; acesso_total: boolean }[] =
    await sql`
      select s.user_id, u.email, f.id as fazenda_id, coalesce(f.acesso_total, false) as acesso_total
      from sessoes s
      join usuarios u on u.id = s.user_id
      join fazendas f on f.dono_id = s.user_id
      where s.token = ${token}
      order by f.created_at asc
      limit 1`;
  const l = linhas[0];
  return l
    ? { userId: l.user_id, email: l.email, fazendaId: l.fazenda_id, acessoTotal: l.acesso_total }
    : null;
}

type AssinaturaResumo = {
  id: string;
  plano: string;
  valor: number;
  status: string;
  initPoint: string | null;
  criadaEm: string;
};

async function ultimaAssinatura(
  fazendaId: string,
): Promise<(AssinaturaResumo & { mpId: string | null }) | null> {
  const { conexao } = await import("./pg.server");
  const sql = await conexao();
  const linhas: {
    id: string;
    plano: string;
    valor: string;
    status: string;
    init_point: string | null;
    mp_preapproval_id: string | null;
    created_at: Date;
  }[] = await sql`
    select id, plano, valor, status, init_point, mp_preapproval_id, created_at
    from assinaturas where fazenda_id = ${fazendaId}
    order by (status = 'ativa') desc, created_at desc
    limit 1`;
  const a = linhas[0];
  return a
    ? {
        id: a.id,
        plano: a.plano,
        valor: Number(a.valor),
        status: a.status,
        initPoint: a.init_point,
        mpId: a.mp_preapproval_id,
        criadaEm: new Date(a.created_at).toISOString(),
      }
    : null;
}

function semMpId(a: (AssinaturaResumo & { mpId: string | null }) | null): AssinaturaResumo | null {
  if (!a) return null;
  return {
    id: a.id,
    plano: a.plano,
    valor: a.valor,
    status: a.status,
    initPoint: a.initPoint,
    criadaEm: a.criadaEm,
  };
}

function erro(mensagem: string) {
  return { data: null, error: { message: mensagem } };
}

/** Situação da assinatura da fazenda do usuário. */
export const minhaAssinatura = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null }) => dados)
  .handler(async ({ data }) => {
    try {
      const ctx = await contexto(data.token);
      if (!ctx) return erro("Não autenticado.");
      const { mercadoPagoConfigurado } = await import("./mercadopago.server");
      return {
        data: {
          configurado: mercadoPagoConfigurado(),
          acessoTotal: ctx.acessoTotal,
          email: ctx.email,
          assinatura: semMpId(await ultimaAssinatura(ctx.fazendaId)),
        },
        error: null,
      };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao consultar a assinatura.");
    }
  });

/** Cria a assinatura no Mercado Pago e devolve o link do checkout. */
export const iniciarAssinatura = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null; plano: string; email: string }) => dados)
  .handler(async ({ data }) => {
    try {
      const ctx = await contexto(data.token);
      if (!ctx) return erro("Não autenticado.");
      if (ctx.acessoTotal) return erro("Sua conta já tem acesso total — não precisa assinar.");
      const plano = getPlano(data.plano);
      if (plano.id !== data.plano || !plano.valorMensal) {
        return erro("Esse plano não tem assinatura online.");
      }
      const email = data.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro("Informe um e-mail válido.");

      const atual = await ultimaAssinatura(ctx.fazendaId);
      if (atual?.status === "ativa") {
        return erro("Você já tem uma assinatura ativa. Cancele a atual antes de trocar de plano.");
      }

      const { mercadoPago, urlDoSistema } = await import("./mercadopago.server");
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const pre = await mercadoPago.criarAssinatura({
        motivo: `Curral Online — Plano ${plano.nome}`,
        referencia: `fazenda:${ctx.fazendaId};plano:${plano.id}`,
        email,
        valor: plano.valorMensal,
        voltarPara: `${urlDoSistema()}/config?assinatura=retorno`,
      });
      if (!pre.init_point) return erro("O Mercado Pago não devolveu o link de pagamento.");

      // Assinaturas pendentes antigas da fazenda ficam pra trás.
      await sql`
        update assinaturas set status = 'cancelada', updated_at = now()
        where fazenda_id = ${ctx.fazendaId} and status = 'pendente'`;
      await sql`
        insert into assinaturas (fazenda_id, plano, valor, mp_preapproval_id, init_point, payer_email, status)
        values (${ctx.fazendaId}, ${plano.id}, ${plano.valorMensal}, ${pre.id}, ${pre.init_point},
                ${email}, 'pendente')`;
      return { data: { initPoint: pre.init_point }, error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao iniciar a assinatura.");
    }
  });

/** Confere no Mercado Pago o status da assinatura (volta do checkout). */
export const sincronizarAssinatura = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null }) => dados)
  .handler(async ({ data }) => {
    try {
      const ctx = await contexto(data.token);
      if (!ctx) return erro("Não autenticado.");
      const atual = await ultimaAssinatura(ctx.fazendaId);
      if (!atual?.mpId) return { data: { status: null as string | null }, error: null };
      const { mercadoPago, aplicarPreapproval } = await import("./mercadopago.server");
      const { conexao } = await import("./pg.server");
      const pre = await mercadoPago.buscar(atual.mpId);
      const status = await aplicarPreapproval(await conexao(), pre);
      return { data: { status }, error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao conferir a assinatura.");
    }
  });

/** Cancela a assinatura no Mercado Pago; o plano volta ao Grátis. */
export const cancelarAssinatura = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null }) => dados)
  .handler(async ({ data }) => {
    try {
      const ctx = await contexto(data.token);
      if (!ctx) return erro("Não autenticado.");
      const atual = await ultimaAssinatura(ctx.fazendaId);
      if (!atual?.mpId || (atual.status !== "ativa" && atual.status !== "pausada")) {
        return erro("Não há assinatura ativa para cancelar.");
      }
      const { mercadoPago, aplicarPreapproval } = await import("./mercadopago.server");
      const { conexao } = await import("./pg.server");
      const pre = await mercadoPago.cancelar(atual.mpId);
      const status = await aplicarPreapproval(await conexao(), pre);
      return { data: { status }, error: null };
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Erro ao cancelar a assinatura.");
    }
  });
