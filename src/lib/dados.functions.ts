/**
 * Server functions que executam as consultas no PostgreSQL.
 *
 * Nada é configurado à mão: quando a variável DATABASE_URL existe, a primeira
 * chamada já cria todas as tabelas/colunas (ver src/lib/pg.server.ts). Sem
 * DATABASE_URL, as chamadas retornam erro — não há mais fallback local.
 */
import { createServerFn } from "@tanstack/react-start";
import type { Sql } from "./pg.server";

// ---------------------------------------------------------------------------
// Tipos trocados com o navegador
// ---------------------------------------------------------------------------

export interface FiltroRemoto {
  coluna: string;
  operador: "eq" | "neq" | "gte" | "lte" | "in" | "notIn";
  valor: unknown;
}

export interface PedidoConsulta {
  token: string | null;
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

async function usuarioIdDaSessao(
  sql: Sql,
  token: string | null | undefined,
): Promise<string | null> {
  if (!token) return null;
  const sessoes: { user_id: string }[] =
    await sql`select user_id from sessoes where token = ${token} limit 1`;
  return sessoes[0]?.user_id ?? null;
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
  "precos_produto",
  "destinacoes_leite",
  "vendas",
]);

// destinacoes_leite e vendas têm regras de negócio (destinação não pode
// passar da produção do dia; venda precisa criar o lançamento financeiro
// junto) que o consultar genérico não sabe aplicar — por isso só leitura
// aqui; escrita é só via registrarDestinacaoLeite/registrarVenda abaixo.
const TABELAS_SOMENTE_LEITURA = new Set(["destinacoes_leite", "vendas"]);

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
      if (pedido.modo !== "select" && TABELAS_SOMENTE_LEITURA.has(pedido.tabela)) {
        return { data: [], error: { message: "Use a função específica para alterar esta tabela." }, count: 0 };
      }
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const tabela = pedido.tabela;

      const userId = await usuarioIdDaSessao(sql, pedido.token);
      if (!userId) {
        return { data: [], error: { message: "Não autenticado." }, count: 0 };
      }

      let fazendasDoUsuarioCache: string[] | null = null;
      async function fazendasDoUsuario(): Promise<string[]> {
        if (!fazendasDoUsuarioCache) {
          const linhas: { id: string }[] =
            await sql`select id from fazendas where dono_id = ${userId}`;
          fazendasDoUsuarioCache = linhas.map((l) => l.id);
        }
        return fazendasDoUsuarioCache;
      }

      // Fragmento de posse: toda consulta é restrita ao que pertence ao
      // usuário autenticado, mesmo que o navegador não mande esse filtro.
      const fragmentoPosse = (prefixo = ""): any => {
        if (tabela === "perfis") return sql`${sql(`${prefixo}id`)} = ${userId}`;
        if (tabela === "fazendas") return sql`${sql(`${prefixo}dono_id`)} = ${userId}`;
        return sql`${sql(`${prefixo}fazenda_id`)} in (select id from fazendas where dono_id = ${userId})`;
      };

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
      const montarOnde = (filtros: FiltroRemoto[], prefixo = ""): any =>
        filtros.reduce((acc: any, f) => sql`${acc} and ${frag(f)}`, fragmentoPosse(prefixo));

      const onde = montarOnde(pedido.filtros ?? []);

      // ----- INSERT -----
      if (pedido.modo === "insert") {
        const entrada = Array.isArray(pedido.valores) ? pedido.valores : [pedido.valores ?? {}];
        if (entrada.length === 0) return { data: [], error: null, count: 0 };

        let entradaSegura: Record<string, unknown>[];
        if (tabela === "perfis") {
          entradaSegura = entrada.map((v) => ({ ...v, id: userId }));
        } else if (tabela === "fazendas") {
          entradaSegura = entrada.map((v) => ({ ...v, dono_id: userId }));
        } else {
          const idsPermitidos = await fazendasDoUsuario();
          const invalida = entrada.some(
            (v) => !idsPermitidos.includes(String((v as Record<string, unknown>)["fazenda_id"])),
          );
          if (invalida) return { data: [], error: { message: "Fazenda inválida." }, count: 0 };
          entradaSegura = entrada as Record<string, unknown>[];
        }

        const criadas: any[] =
          await sql`insert into ${sql(tabela)} ${sql(entradaSegura as any)} returning *`;
        return { data: normalizarLinhas(criadas), error: null, count: criadas.length };
      }

      // ----- UPDATE -----
      if (pedido.modo === "update") {
        const valoresAtualizacao: Record<string, unknown> = { ...(pedido.valores as any) };
        if (tabela === "perfis") delete valoresAtualizacao["id"];
        if (tabela === "fazendas") delete valoresAtualizacao["dono_id"];
        if (tabela !== "perfis" && tabela !== "fazendas" && "fazenda_id" in valoresAtualizacao) {
          const idsPermitidos = await fazendasDoUsuario();
          if (!idsPermitidos.includes(String(valoresAtualizacao["fazenda_id"]))) {
            return { data: [], error: { message: "Fazenda inválida." }, count: 0 };
          }
        }
        const atualizadas: any[] = await sql`
          update ${sql(tabela)} set ${sql(valoresAtualizacao as any)}, updated_at = now()
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
          "t.",
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

async function hashComPepper(prefixo: string, texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${prefixo}${texto}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashSenha(senha: string): Promise<string> {
  return hashComPepper("mcd:", senha);
}

async function hashCodigo(codigo: string): Promise<string> {
  return hashComPepper("mcd:verificacao:", codigo);
}

function paraSessao(u: any) {
  return {
    id: u["id"] as string,
    email: u["email"] as string,
    user_metadata: { nome: u["nome"] ?? null, objetivo: u["objetivo"] ?? null },
  };
}

// ---------------------------------------------------------------------------
// Verificação de e-mail por código de 6 dígitos
// ---------------------------------------------------------------------------

const DURACAO_CODIGO_MS = 10 * 60 * 1000;
const COOLDOWN_REENVIO_MS = 60 * 1000;
const MAX_TENTATIVAS_CODIGO = 5;

function gerarCodigo(): string {
  // CSPRNG dígito a dígito. O leve viés de módulo (256 não é múltiplo de 10)
  // não importa aqui: o que protege o código é o limite de tentativas e a
  // expiração, não a uniformidade estatística dos dígitos.
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b % 10).join("");
}

/**
 * Cadastro só vira usuário de verdade (linha em `usuarios`) depois que o
 * código é confirmado. Até lá, tudo fica em `cadastros_pendentes` — assim
 * quem nunca confirma o e-mail não "reserva" o endereço para sempre nem
 * aparece como usuário real no banco.
 */
async function statusCodigoPendente(
  sql: Sql,
  email: string,
): Promise<{ nome: string | null; expira_em: Date; enviado_em: Date } | null> {
  const linhas: { nome: string | null; expira_em: Date; enviado_em: Date }[] = await sql`
    select nome, expira_em, enviado_em from cadastros_pendentes where email = ${email}`;
  return linhas[0] ?? null;
}

/** Gera um código novo para um cadastro pendente já existente e reenvia por e-mail. */
async function enviarNovoCodigoPendente(
  sql: Sql,
  pendente: { email: string; nome: string | null },
): Promise<string> {
  const codigo = gerarCodigo();
  const codigoHash = await hashCodigo(codigo);
  const expiraEm = new Date(Date.now() + DURACAO_CODIGO_MS);
  await sql`
    update cadastros_pendentes set
      codigo_hash = ${codigoHash}, tentativas = 0, expira_em = ${expiraEm}, enviado_em = now()
    where email = ${pendente.email}`;
  const { enviarCodigoPorEmail } = await import("./email.server");
  await enviarCodigoPorEmail({ to: pendente.email, nome: pendente.nome, codigo });
  return expiraEm.toISOString();
}

export const cadastrar = createServerFn({ method: "POST" })
  .inputValidator(
    (dados: {
      email: string;
      senha: string;
      nome?: string | null;
      objetivo?: string | null;
      nomeFazenda: string;
      cidade?: string | null;
      estado?: string | null;
    }) => dados,
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

      const existentes: { id: string; email_verificado: boolean }[] = await sql`
        select id, email_verificado from usuarios where email = ${email} limit 1`;
      const existente = existentes[0];
      if (existente) {
        if (existente.email_verificado) {
          return {
            data: { user: null, session: null },
            error: { message: "User already registered" },
          };
        }
        // Conta de um cadastro antigo que nunca confirmou o e-mail: libera o
        // endereço para recomeçar em vez de deixar essa conta "fantasma"
        // travando o cadastro para sempre.
        await sql`delete from usuarios where id = ${existente.id}`;
      }

      const senhaHash = await hashSenha(data.senha);
      const nome = data.nome ?? null;
      const objetivo = data.objetivo ?? null;
      const codigo = gerarCodigo();
      const codigoHash = await hashCodigo(codigo);
      const expiraEmData = new Date(Date.now() + DURACAO_CODIGO_MS);

      await sql`
        insert into cadastros_pendentes (
          email, senha_hash, nome, objetivo, nome_fazenda, cidade, estado,
          codigo_hash, tentativas, expira_em, enviado_em
        )
        values (
          ${email}, ${senhaHash}, ${nome}, ${objetivo}, ${data.nomeFazenda},
          ${data.cidade ?? null}, ${data.estado ?? null},
          ${codigoHash}, 0, ${expiraEmData}, now()
        )
        on conflict (email) do update set
          senha_hash = excluded.senha_hash,
          nome = excluded.nome,
          objetivo = excluded.objetivo,
          nome_fazenda = excluded.nome_fazenda,
          cidade = excluded.cidade,
          estado = excluded.estado,
          codigo_hash = excluded.codigo_hash,
          tentativas = 0,
          expira_em = excluded.expira_em,
          enviado_em = now()`;

      let avisoEmail = false;
      try {
        const { enviarCodigoPorEmail } = await import("./email.server");
        await enviarCodigoPorEmail({ to: email, nome, codigo });
      } catch (erroEnvio) {
        console.error(erroEnvio);
        avisoEmail = true;
      }

      return {
        data: {
          user: null,
          session: null,
          precisaVerificar: true,
          email,
          expiraEm: expiraEmData.toISOString(),
          avisoEmail,
        },
        error: null,
      };
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
        select id, email, nome, objetivo, email_verificado from usuarios
        where email = ${email} and senha_hash = ${senhaHash} limit 1`;
      const usuario = usuarios[0];

      if (!usuario) {
        // Sem conta confirmada com essa senha — mas pode existir um
        // cadastro pendente (ainda não virou usuário de verdade).
        const pendentes: { email: string; nome: string | null; expira_em: Date; enviado_em: Date }[] =
          await sql`
            select email, nome, expira_em, enviado_em from cadastros_pendentes
            where email = ${email} and senha_hash = ${senhaHash} limit 1`;
        const pendente = pendentes[0];
        if (!pendente) {
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials" },
          };
        }
        let expiraEm: string | null = null;
        let avisoEnvio = false;
        try {
          const dentroCooldown =
            Date.now() - new Date(pendente.enviado_em).getTime() < COOLDOWN_REENVIO_MS;
          expiraEm = dentroCooldown
            ? new Date(pendente.expira_em).toISOString()
            : await enviarNovoCodigoPendente(sql, { email: pendente.email, nome: pendente.nome });
        } catch (erroEnvio) {
          console.error(erroEnvio);
          avisoEnvio = true;
        }
        return {
          data: { user: null, session: null },
          error: {
            message: "Confirme seu e-mail para entrar.",
            code: "email_nao_verificado",
            email: pendente.email,
            expiraEm,
            avisoEnvio,
          },
        };
      }

      if (!usuario["email_verificado"]) {
        // Sobra de um cadastro antigo (de antes desta correção) que ficou
        // como usuário real sem confirmar o e-mail. Libera o endereço para
        // um cadastro novo em vez de deixar essa conta travada.
        await sql`delete from usuarios where id = ${usuario["id"]}`;
        return {
          data: { user: null, session: null },
          error: {
            message: "Esse cadastro não foi concluído. Cadastre-se novamente para receber um novo código.",
            code: "cadastro_incompleto",
          },
        };
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

export const enviarCodigoVerificacao = createServerFn({ method: "POST" })
  .inputValidator((dados: { email: string }) => dados)
  .handler(async ({ data }) => {
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const email = data.email.trim().toLowerCase();

      // Resposta neutra quando a conta já está verificada — não confirma
      // nem nega a existência da conta pro navegador.
      const verificados: any[] =
        await sql`select id from usuarios where email = ${email} and email_verificado limit 1`;
      if (verificados.length > 0) {
        return { data: { enviado: true, expiraEm: null }, error: null };
      }

      const pendente = await statusCodigoPendente(sql, email);
      // Resposta neutra também quando não existe cadastro pendente algum.
      if (!pendente) {
        return { data: { enviado: true, expiraEm: null }, error: null };
      }

      const passados = Date.now() - new Date(pendente.enviado_em).getTime();
      if (passados < COOLDOWN_REENVIO_MS) {
        return {
          data: null,
          error: {
            message: "Aguarde um pouco para pedir outro código.",
            code: "aguardar",
            aguardarSegundos: Math.ceil((COOLDOWN_REENVIO_MS - passados) / 1000),
          },
        };
      }

      const expiraEm = await enviarNovoCodigoPendente(sql, { email, nome: pendente.nome });
      return { data: { enviado: true, expiraEm }, error: null };
    } catch (erro) {
      return {
        data: null,
        error: {
          message: erro instanceof Error ? erro.message : "Não conseguimos reenviar agora.",
        },
      };
    }
  });

export const verificarCodigoEmail = createServerFn({ method: "POST" })
  .inputValidator((dados: { email: string; codigo: string }) => dados)
  .handler(async ({ data }) => {
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const email = data.email.trim().toLowerCase();
      const codigo = data.codigo.trim();

      const verificados: any[] =
        await sql`select id from usuarios where email = ${email} and email_verificado limit 1`;
      if (verificados.length > 0) {
        return {
          data: { user: null, session: null },
          error: {
            message: "Este e-mail já foi confirmado. Faça login normalmente.",
            code: "ja_verificado",
          },
        };
      }

      type Resultado =
        | { tipo: "sem_codigo" }
        | { tipo: "expirado" }
        | { tipo: "muitas_tentativas" }
        | { tipo: "codigo_errado"; restantes: number }
        | { tipo: "ok"; usuario: { id: string; email: string; nome: string | null; objetivo: string | null } };

      const resultado: Resultado = await sql.begin(async (tx) => {
        const linhas: {
          senha_hash: string;
          nome: string | null;
          objetivo: string | null;
          nome_fazenda: string;
          cidade: string | null;
          estado: string | null;
          codigo_hash: string;
          tentativas: number;
          expira_em: Date;
        }[] = await tx`
          select senha_hash, nome, objetivo, nome_fazenda, cidade, estado, codigo_hash, tentativas, expira_em
          from cadastros_pendentes where email = ${email} for update`;
        const pendente = linhas[0];
        if (!pendente) return { tipo: "sem_codigo" };
        if (new Date(pendente.expira_em).getTime() < Date.now()) return { tipo: "expirado" };
        if (pendente.tentativas >= MAX_TENTATIVAS_CODIGO) return { tipo: "muitas_tentativas" };

        const hashRecebido = await hashCodigo(codigo);
        if (hashRecebido !== pendente.codigo_hash) {
          const novasTentativas = pendente.tentativas + 1;
          await tx`update cadastros_pendentes set tentativas = ${novasTentativas} where email = ${email}`;
          if (novasTentativas >= MAX_TENTATIVAS_CODIGO) return { tipo: "muitas_tentativas" };
          return { tipo: "codigo_errado", restantes: MAX_TENTATIVAS_CODIGO - novasTentativas };
        }

        const usuarios: { id: string; email: string; nome: string | null; objetivo: string | null }[] = await tx`
          insert into usuarios (email, senha_hash, nome, objetivo, email_verificado)
          values (${email}, ${pendente.senha_hash}, ${pendente.nome}, ${pendente.objetivo}, true)
          returning id, email, nome, objetivo`;
        const usuario = usuarios[0]!;
        await tx`
          insert into perfis (id, nome, email, objetivo)
          values (${usuario.id}, ${pendente.nome}, ${email}, ${pendente.objetivo})
          on conflict (id) do nothing`;
        await tx`
          insert into fazendas (nome, cidade, estado, dono_id)
          values (${pendente.nome_fazenda}, ${pendente.cidade}, ${pendente.estado}, ${usuario.id})`;
        await tx`delete from cadastros_pendentes where email = ${email}`;
        return { tipo: "ok", usuario };
      });

      if (resultado.tipo === "sem_codigo") {
        return {
          data: { user: null, session: null },
          error: { message: "Código inválido ou expirado.", code: "codigo_invalido" },
        };
      }
      if (resultado.tipo === "expirado") {
        return {
          data: { user: null, session: null },
          error: { message: "Esse código expirou. Peça um novo.", code: "codigo_expirado" },
        };
      }
      if (resultado.tipo === "muitas_tentativas") {
        return {
          data: { user: null, session: null },
          error: {
            message: "Muitas tentativas erradas. Peça um novo código.",
            code: "muitas_tentativas",
          },
        };
      }
      if (resultado.tipo === "codigo_errado") {
        return {
          data: { user: null, session: null },
          error: {
            message: "Código incorreto.",
            code: "codigo_incorreto",
            tentativasRestantes: resultado.restantes,
          },
        };
      }

      const token = crypto.randomUUID();
      await sql`insert into sessoes (token, user_id) values (${token}, ${resultado.usuario.id})`;
      const user = paraSessao(resultado.usuario);
      return { data: { user, session: { user, access_token: token } }, error: null };
    } catch (erro) {
      return {
        data: { user: null, session: null },
        error: { message: erro instanceof Error ? erro.message : "Erro ao verificar o código." },
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
      return {
        data: { user: null },
        error: { message: erro instanceof Error ? erro.message : "Erro de sessão" },
      };
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
      const sessoes: any[] =
        await sql`select user_id from sessoes where token = ${data.token} limit 1`;
      const sessao = sessoes[0];
      if (!sessao) return { data: { user: null }, error: { message: "Sem sessão ativa." } };
      if (data.password) {
        const senhaHash = await hashSenha(data.password);
        await sql`update usuarios set senha_hash = ${senhaHash}, updated_at = now() where id = ${sessao["user_id"]}`;
      }
      if (data.email) {
        await sql`update usuarios set email = ${data.email.trim().toLowerCase()}, updated_at = now() where id = ${sessao["user_id"]}`;
      }
      const usuarios: any[] =
        await sql`select id, email, nome, objetivo from usuarios where id = ${sessao["user_id"]}`;
      const usuario = usuarios[0];
      return { data: { user: usuario ? paraSessao(usuario) : null }, error: null };
    } catch (erro) {
      return {
        data: { user: null },
        error: { message: erro instanceof Error ? erro.message : "Erro ao atualizar" },
      };
    }
  });

export const excluirConta = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null }) => dados)
  .handler(async ({ data }) => {
    if (!data.token) return { ok: true };
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const sessoes: any[] =
        await sql`select user_id from sessoes where token = ${data.token} limit 1`;
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

// ---------------------------------------------------------------------------
// Leite: preço vigente, destinação da produção e vendas
// ---------------------------------------------------------------------------

async function fazendaDoUsuario(
  sql: Sql,
  token: string | null | undefined,
  fazendaId: string,
): Promise<string | null> {
  const userId = await usuarioIdDaSessao(sql, token);
  if (!userId) return null;
  const fazendas: { id: string }[] =
    await sql`select id from fazendas where id = ${fazendaId} and dono_id = ${userId} limit 1`;
  return fazendas[0] ? userId : null;
}

/**
 * Registra (substituindo o que já existia) a destinação da produção de leite
 * de um dia. Bloqueia se a soma dos destinos passar do total produzido —
 * essa é a trava que evita contar como receita leite que nunca foi vendido.
 */
export const registrarDestinacaoLeite = createServerFn({ method: "POST" })
  .inputValidator(
    (dados: {
      token: string | null;
      fazendaId: string;
      data: string;
      destinos: { destino: string; quantidade: number; observacoes?: string | null }[];
    }) => dados,
  )
  .handler(async ({ data }) => {
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const userId = await fazendaDoUsuario(sql, data.token, data.fazendaId);
      if (!userId) {
        return { data: null, error: { message: "Não autenticado ou fazenda inválida." } };
      }

      const destinosValidos = data.destinos.filter((d) => d.quantidade > 0);
      const totalDestinado = destinosValidos.reduce((soma, d) => soma + d.quantidade, 0);

      const producao: { total: string | null }[] = await sql`
        select sum(litros) as total from producao_leite
        where fazenda_id = ${data.fazendaId} and data = ${data.data}`;
      const totalProduzido = Number(producao[0]?.total ?? 0);

      if (totalDestinado > totalProduzido + 0.001) {
        return {
          data: null,
          error: {
            message: `A soma dos destinos (${totalDestinado}L) não pode passar da produção do dia (${totalProduzido}L).`,
            code: "destinacao_excede_producao",
          },
        };
      }

      const linhas = await sql.begin(async (tx) => {
        await tx`delete from destinacoes_leite where fazenda_id = ${data.fazendaId} and data = ${data.data}`;
        if (destinosValidos.length === 0) return [];
        const entradas = destinosValidos.map((d) => ({
          fazenda_id: data.fazendaId,
          data: data.data,
          destino: d.destino,
          quantidade: d.quantidade,
          observacoes: d.observacoes ?? null,
        }));
        return await tx`insert into destinacoes_leite ${tx(entradas as any)} returning *`;
      });

      return { data: normalizarLinhas(linhas) as any, error: null };
    } catch (erro) {
      return {
        data: null,
        error: { message: erro instanceof Error ? erro.message : "Erro ao registrar destinação." },
      };
    }
  });

/**
 * Registra uma venda e já cria o lançamento financeiro correspondente
 * (status "a_receber"), num só passo — é assim que a receita do leite
 * "conversa" com o financeiro.
 */
export const registrarVenda = createServerFn({ method: "POST" })
  .inputValidator(
    (dados: {
      token: string | null;
      fazendaId: string;
      produto?: string;
      quantidade: number;
      unidade?: string;
      precoUnitario: number;
      comprador?: string | null;
      data: string;
      // Sem informar, mantém o comportamento de sempre: nasce "a receber".
      pago?: boolean;
      formaPagamento?: string;
    }) => dados,
  )
  .handler(async ({ data }) => {
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const userId = await fazendaDoUsuario(sql, data.token, data.fazendaId);
      if (!userId) {
        return { data: null, error: { message: "Não autenticado ou fazenda inválida." } };
      }
      if (data.quantidade <= 0 || data.precoUnitario <= 0) {
        return { data: null, error: { message: "Quantidade e preço precisam ser maiores que zero." } };
      }

      const produto = data.produto ?? "leite";
      // Comprador é obrigatório só pra leite — a venda de gado (Engorda) continua opcional.
      if (produto === "leite" && !data.comprador?.trim()) {
        return {
          data: null,
          error: { message: "Informe o comprador para registrar esta venda." },
        };
      }
      const unidade = data.unidade ?? "litro";
      const valorTotal = Math.round(data.quantidade * data.precoUnitario * 100) / 100;
      const descricao = `Venda de ${produto}${data.comprador ? ` — ${data.comprador}` : ""}`;
      const status = data.pago ? "recebido" : "a_receber";
      const formaPagamento = data.pago ? (data.formaPagamento ?? "dinheiro") : "dinheiro";

      const venda = await sql.begin(async (tx) => {
        const financeiros: { id: string }[] = await tx`
          insert into financeiro_lancamentos (fazenda_id, tipo, descricao, valor, data, categoria, status, forma_pagamento)
          values (${data.fazendaId}, 'receita', ${descricao}, ${valorTotal}, ${data.data}, ${`venda_${produto}`}, ${status}, ${formaPagamento})
          returning id`;
        const financeiroId = financeiros[0]!.id;

        const vendas: any[] = await tx`
          insert into vendas (
            fazenda_id, produto, quantidade, unidade, preco_unitario, valor_total, comprador, data, financeiro_id
          )
          values (
            ${data.fazendaId}, ${produto}, ${data.quantidade}, ${unidade}, ${data.precoUnitario},
            ${valorTotal}, ${data.comprador ?? null}, ${data.data}, ${financeiroId}
          )
          returning *`;
        return vendas[0];
      });

      return { data: normalizarLinha(venda) as any, error: null };
    } catch (erro) {
      return {
        data: null,
        error: { message: erro instanceof Error ? erro.message : "Erro ao registrar venda." },
      };
    }
  });

/**
 * Marca um ou mais lançamentos "a_receber" como "recebido" de uma vez —
 * cobre o caso comum de o comprador pagar várias vendas juntas (semanal,
 * quinzenal, mensal) em vez de uma confirmação por venda.
 */
export const marcarLancamentosRecebidos = createServerFn({ method: "POST" })
  .inputValidator((dados: { token: string | null; ids: string[] }) => dados)
  .handler(async ({ data }) => {
    try {
      const { conexao } = await import("./pg.server");
      const sql = await conexao();
      const userId = await usuarioIdDaSessao(sql, data.token);
      if (!userId) return { data: null, error: { message: "Não autenticado." } };
      if (data.ids.length === 0) return { data: [], error: null };

      const atualizados: any[] = await sql`
        update financeiro_lancamentos set status = 'recebido', updated_at = now()
        where id = any(${data.ids}) and status = 'a_receber'
          and fazenda_id in (select id from fazendas where dono_id = ${userId})
        returning *`;
      return { data: normalizarLinhas(atualizados) as any, error: null };
    } catch (erro) {
      return {
        data: null,
        error: { message: erro instanceof Error ? erro.message : "Erro ao marcar como recebido." },
      };
    }
  });
