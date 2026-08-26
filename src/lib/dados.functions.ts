/**
 * Server functions que executam as consultas no PostgreSQL.
 *
 * Nada é configurado à mão: quando a variável DATABASE_URL existe, a primeira
 * chamada já cria todas as tabelas/colunas (ver src/lib/pg.server.ts). Sem
 * DATABASE_URL, as chamadas retornam erro — não há mais fallback local.
 */
import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Tipos trocados com o navegador
// ---------------------------------------------------------------------------

export interface FiltroRemoto {
  coluna: string;
  operador: "eq" | "neq" | "gte" | "lte" | "in" | "notIn";
  valor: unknown;
}

export interface PedidoConsulta {
  tabela: string;
  modo: "select" | "insert" | "update" | "delete";
  colunas?: string;
  filtros?: FiltroRemoto[];
  ordenacao?: { coluna: string; asc: boolean } | null;
  limite?: number | null;
  valores?: Record<string, unknown> | Record<string, unknown>[] | null;
  apenasContagem?: boolean;
  umUnico?: "single" | "maybe" | null;
}

export interface RespostaRemota {
  data: any;
  error: { message: string } | null;
  count: number;
}

// O driver do Postgres devolve colunas date/timestamp como objetos `Date`.
// O app inteiro trabalha com strings ISO, então normalizamos aqui antes de
// responder ao navegador.
function normalizarLinha(linha: unknown): unknown {
  if (linha === null || typeof linha !== "object") return linha;
  const normalizada: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(linha as Record<string, unknown>)) {
    normalizada[chave] = valor instanceof Date ? valor.toISOString() : valor;
  }
  return normalizada;
}

function normalizarLinhas(linhas: unknown[]): unknown[] {
  return linhas.map(normalizarLinha);
}

// Tabelas que o navegador pode acessar (proteção básica).
const TABELAS_PERMITIDAS = new Set([
  "perfis",
  "fazendas",
  "fazenda_membros",
  "animais",
  "manejos",
  "producao_leite",
  "reproducao",
  "financeiro_lancamentos",
  "eventos_agenda",
]);

// ---------------------------------------------------------------------------
// Consulta genérica (espelha o que as telas usam)
// ---------------------------------------------------------------------------

export const consultar = createServerFn({ method: "POST" })
  .inputValidator((dados: PedidoConsulta) => dados)
  .handler(async ({ data: pedido }): Promise<RespostaRemota> => {
    try {
      if (!TABELAS_PERMITIDAS.has(pedido.tabela)) {
        return { data: [], error: { message: "Tabela não permitida." }, count: 0 };
      }
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const tabela = pedido.tabela;

      const frag = (f: FiltroRemoto): any => {
        const col = sql(f.coluna);
        switch (f.operador) {
          case "eq":
            return sql`${col} = ${f.valor as any}`;
          case "neq":
            return sql`${col} is distinct from ${f.valor as any}`;
          case "gte":
            return sql`${col} >= ${f.valor as any}`;
          case "lte":
            return sql`${col} <= ${f.valor as any}`;
          case "in":
            return sql`${col} = any(${f.valor as any})`;
          case "notIn":
            return sql`(${col} is null or not (${col} = any(${f.valor as any})))`;
        }
      };
      const montarOnde = (filtros: FiltroRemoto[]): any =>
        filtros.length === 0
          ? sql`true`
          : filtros.slice(1).reduce((acc: any, f) => sql`${acc} and ${frag(f)}`, frag(filtros[0]!));

      const onde = montarOnde(pedido.filtros ?? []);

      // ----- INSERT -----
      if (pedido.modo === "insert") {
        const entrada = Array.isArray(pedido.valores) ? pedido.valores : [pedido.valores ?? {}];
        if (entrada.length === 0) return { data: [], error: null, count: 0 };
        const criadas: any[] = await sql`insert into ${sql(tabela)} ${sql(entrada as any)} returning *`;
        return { data: normalizarLinhas(criadas), error: null, count: criadas.length };
      }

      // ----- UPDATE -----
      if (pedido.modo === "update") {
        const atualizadas: any[] = await sql`
          update ${sql(tabela)} set ${sql((pedido.valores ?? {}) as any)}, updated_at = now()
          where ${onde} returning *`;
        return { data: normalizarLinhas(atualizadas), error: null, count: atualizadas.length };
      }

      // ----- DELETE -----
      if (pedido.modo === "delete") {
        await sql`delete from ${sql(tabela)} where ${onde}`;
        return { data: [], error: null, count: 0 };
      }

      // ----- SELECT -----
      const colunas = pedido.colunas ?? "*";
      const ordenacao = pedido.ordenacao;
      const limite = pedido.limite != null ? sql`limit ${pedido.limite}` : sql``;

      if (pedido.apenasContagem) {
        const total: any[] = await sql`select count(*)::int as n from ${sql(tabela)} where ${onde}`;
        return { data: null, error: null, count: Number(total[0]?.["n"] ?? 0) };
      }

      let linhas: any[];
      if (colunas.includes("animais(")) {
        // Relação simples usada no app: traz o nome do animal junto.
        const ondeJoin = montarOnde(
          (pedido.filtros ?? []).map((f) => ({ ...f, coluna: `t.${f.coluna}` })),
        );
        const ordemJoin = ordenacao
          ? sql`order by ${sql(`t.${ordenacao.coluna}`)} ${ordenacao.asc ? sql`asc` : sql`desc`} nulls last`
          : sql``;
        const brutas: any[] = await sql`
          select t.*, a.nome as animal_nome
          from ${sql(tabela)} t
          left join animais a on a.id = t.animal_id
          where ${ondeJoin} ${ordemJoin} ${limite}`;
        linhas = brutas.map((l) => {
          const { animal_nome, ...resto } = l;
          return { ...resto, animais: animal_nome ? { nome: animal_nome } : null };
        });
      } else {
        const ordem = ordenacao
          ? sql`order by ${sql(ordenacao.coluna)} ${ordenacao.asc ? sql`asc` : sql`desc`} nulls last`
          : sql``;
        if (colunas === "*" || colunas.trim() === "") {
          linhas = await sql`select * from ${sql(tabela)} where ${onde} ${ordem} ${limite}`;
        } else {
          const lista = colunas
            .split(",")
            .map((c) => c.trim())
            .filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
          linhas = await sql`
            select ${sql(lista.length ? lista : ["*"])} from ${sql(tabela)}
            where ${onde} ${ordem} ${limite}`;
        }
      }

      linhas = normalizarLinhas(linhas);
      const total = linhas.length;

      if (pedido.umUnico) {
        const primeiro = linhas[0] ?? null;
        if (!primeiro && pedido.umUnico === "single") {
          return { data: null, error: { message: "Nenhum registro encontrado." }, count: 0 };
        }
        return { data: primeiro, error: null, count: total };
      }

      return { data: linhas, error: null, count: total };
    } catch (erro) {
      return {
        data: [],
        error: { message: erro instanceof Error ? erro.message : "Erro no banco" },
        count: 0,
      };
    }
  });

// ---------------------------------------------------------------------------
// Autenticação (senha com hash SHA-256, sessão por token)
// ---------------------------------------------------------------------------

async function hashSenha(senha: string): Promise<string> {
  const bytes = new TextEncoder().encode(`mcd:${senha}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function paraSessao(u: any) {
  return {
    id: u["id"] as string,
    email: u["email"] as string,
    user_metadata: { nome: u["nome"] ?? null, objetivo: u["objetivo"] ?? null },
  };
}

export const cadastrar = createServerFn({ method: "POST" })
  .inputValidator(
    (dados: { email: string; senha: string; nome?: string | null; objetivo?: string | null }) => dados,
  )
  .handler(async ({ data }) => {
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const email = data.email.trim().toLowerCase();
      if (data.senha.length < 8) {
        return {
          data: { user: null, session: null },
          error: { message: "Password should be at least 8 characters" },
        };
      }
      const existe: any[] = await sql`select id from usuarios where email = ${email} limit 1`;
      if (existe.length > 0) {
        return { data: { user: null, session: null }, error: { message: "User already registered" } };
      }
      const senhaHash = await hashSenha(data.senha);
      const usuarios: any[] = await sql`
        insert into usuarios (email, senha_hash, nome, objetivo)
        values (${email}, ${senhaHash}, ${data.nome ?? null}, ${data.objetivo ?? null})
        returning id, email, nome, objetivo`;
      const usuario = usuarios[0];
      await sql`
        insert into perfis (id, nome, email, objetivo)
        values (${usuario["id"]}, ${data.nome ?? null}, ${email}, ${data.objetivo ?? null})
        on conflict (id) do nothing`;
      const token = crypto.randomUUID();
      await sql`insert into sessoes (token, user_id) values (${token}, ${usuario["id"]})`;
      const user = paraSessao(usuario);
      return { data: { user, session: { user, access_token: token } }, error: null };
    } catch (erro) {
      return {
        data: { user: null, session: null },
        error: { message: erro instanceof Error ? erro.message : "Erro no cadastro" },
      };
    }
  });

export const entrar = createServerFn({ method: "POST" })
  .inputValidator((dados: { email: string; senha: string }) => dados)
  .handler(async ({ data }) => {
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const email = data.email.trim().toLowerCase();
      const senhaHash = await hashSenha(data.senha);
      const usuarios: any[] = await sql`
        select id, email, nome, objetivo from usuarios
        where email = ${email} and senha_hash = ${senhaHash} limit 1`;
      const usuario = usuarios[0];
      if (!usuario) {
        return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
      }
      const token = crypto.randomUUID();
      await sql`insert into sessoes (token, user_id) values (${token}, ${usuario["id"]})`;
      const user = paraSessao(usuario);
      return { data: { user, session: { user, access_token: token } }, error: null };
    } catch (erro) {
      return {
        data: { user: null, session: null },
        error: { message: erro instanceof Error ? erro.message : "Erro ao entrar" },
      };
    }
  });

export const usuarioAtual = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null }) => dados)
  .handler(async ({ data }) => {
    if (!data.token) return { data: { user: null }, error: null };
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const usuarios: any[] = await sql`
        select u.id, u.email, u.nome, u.objetivo
        from sessoes s join usuarios u on u.id = s.user_id
        where s.token = ${data.token} limit 1`;
      const usuario = usuarios[0];
      return { data: { user: usuario ? paraSessao(usuario) : null }, error: null };
    } catch (erro) {
      return { data: { user: null }, error: { message: erro instanceof Error ? erro.message : "Erro de sessão" } };
    }
  });

export const sair = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null }) => dados)
  .handler(async ({ data }) => {
    if (data.token) {
      try {
        const { conexao } = await import("./pg.server");
        const sql = await conexao();
        await sql`delete from sessoes where token = ${data.token}`;
      } catch {
        // ignorar — sair sempre funciona no navegador
      }
    }
    return { error: null };
  });

export const atualizarUsuario = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null; password?: string; email?: string }) => dados)
  .handler(async ({ data }) => {
    if (!data.token) return { data: { user: null }, error: { message: "Sem sessão ativa." } };
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const sessoes: any[] = await sql`select user_id from sessoes where token = ${data.token} limit 1`;
      const sessao = sessoes[0];
      if (!sessao) return { data: { user: null }, error: { message: "Sem sessão ativa." } };
      if (data.password) {
        const senhaHash = await hashSenha(data.password);
        await sql`update usuarios set senha_hash = ${senhaHash}, updated_at = now() where id = ${sessao["user_id"]}`;
      }
      if (data.email) {
        await sql`update usuarios set email = ${data.email.trim().toLowerCase()}, updated_at = now() where id = ${sessao["user_id"]}`;
      }
      const usuarios: any[] = await sql`select id, email, nome, objetivo from usuarios where id = ${sessao["user_id"]}`;
      const usuario = usuarios[0];
      return { data: { user: usuario ? paraSessao(usuario) : null }, error: null };
    } catch (erro) {
      return { data: { user: null }, error: { message: erro instanceof Error ? erro.message : "Erro ao atualizar" } };
    }
  });

export const excluirConta = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null }) => dados)
  .handler(async ({ data }) => {
    if (!data.token) return { ok: true };
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const sessoes: any[] = await sql`select user_id from sessoes where token = ${data.token} limit 1`;
      const sessao = sessoes[0];
      if (sessao) {
        // O cascade apaga perfil, sessões, fazendas e tudo que é da fazenda.
        await sql`delete from usuarios where id = ${sessao["user_id"]}`;
      }
      return { ok: true };
    } catch (erro) {
      return { ok: false, message: erro instanceof Error ? erro.message : "Erro ao excluir" };
    }
  });
