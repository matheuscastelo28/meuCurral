/**
 * Camada de dados do app.
 *
 * Funciona de dois jeitos, sem nenhuma tela precisar mudar:
 *
 * 1. COM BANCO (Postgres): quando a variável DATABASE_URL está definida no
 *    servidor, tudo é gravado no banco. As tabelas/colunas são criadas sozinhas
 *    na primeira consulta — basta colar a chave de conexão (ver src/lib/pg.server.ts).
 *
 * 2. SEM BANCO (local): sem DATABASE_URL, tudo fica no navegador (localStorage),
 *    com a mesma API. Assim o app nunca quebra enquanto a chave não é colocada.
 *
 * API exposta: `db.from("tabela").select(...)`, `.insert(...)`, `.update(...)`,
 * `.delete()` e `db.auth.*`.
 */

import {
  bancoPronto,
  consultar,
  cadastrar,
  entrar,
  usuarioAtual,
  sair,
  atualizarUsuario,
  excluirConta,
  type FiltroRemoto,
} from "@/lib/dados.functions";

const CHAVE = "mcd:local-db:v1";
const CHAVE_TOKEN = "mcd:pg-token";

export type Registro = Record<string, any>;

export interface UsuarioLocal {
  id: string;
  email: string;
  senha: string;
  nome: string | null;
  objetivo: string | null;
  created_at: string;
}

interface Banco {
  usuarios: UsuarioLocal[];
  sessaoUserId: string | null;
  tabelas: Record<string, Registro[]>;
}

const TABELAS = [
  "perfis",
  "fazendas",
  "fazenda_membros",
  "animais",
  "manejos",
  "producao_leite",
  "reproducao",
  "financeiro_lancamentos",
  "eventos_agenda",
] as const;

function bancoVazio(): Banco {
  const tabelas: Record<string, Registro[]> = {};
  for (const t of TABELAS) tabelas[t] = [];
  return { usuarios: [], sessaoUserId: null, tabelas };
}

let memoria: Banco | null = null;

function temNavegador() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function ler(): Banco {
  if (!temNavegador()) {
    memoria ??= bancoVazio();
    return memoria;
  }
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return bancoVazio();
    const dados = JSON.parse(bruto) as Banco;
    const base = bancoVazio();
    return {
      usuarios: dados.usuarios ?? [],
      sessaoUserId: dados.sessaoUserId ?? null,
      tabelas: { ...base.tabelas, ...(dados.tabelas ?? {}) },
    };
  } catch {
    return bancoVazio();
  }
}

function gravar(banco: Banco) {
  if (!temNavegador()) {
    memoria = banco;
    return;
  }
  window.localStorage.setItem(CHAVE, JSON.stringify(banco));
}

export function novoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

const PADROES: Record<string, () => Registro> = {
  perfis: () => ({
    nome: null,
    email: null,
    objetivo: null,
    unidade_peso: "kg",
    moeda: "BRL",
    inicio_semana: 0,
    alerta_vacina: true,
    alerta_pesagem: true,
    alerta_parto: true,
  }),
  fazendas: () => ({
    cidade: null,
    estado: null,
    plano: "gratis",
    produtos_leite: ["leite"],
  }),
  animais: () => ({
    brinco: null,
    especie: "bovino",
    raca: null,
    sexo: "femea",
    categoria: "vaca",
    status: "ativo",
    nascimento: null,
    peso_kg: null,
    lote: null,
    mae: null,
    observacoes: null,
  }),
  manejos: () => ({ data: hoje(), proxima_data: null, descricao: null, valor: null, animal_id: null }),
  producao_leite: () => ({
    data: hoje(),
    turno: "manha",
    produto: "leite",
    observacoes: null,
    animal_id: null,
  }),
  reproducao: () => ({
    data: hoje(),
    previsao_parto: null,
    touro: null,
    resultado: null,
    observacoes: null,
  }),
  financeiro_lancamentos: () => ({
    data: hoje(),
    categoria: null,
    forma_pagamento: "dinheiro",
    parcelas: null,
  }),
  eventos_agenda: () => ({
    concluido: false,
    observacoes: null,
    animal_id: null,
    tipo: "outro",
  }),
};

type Filtro = (linha: Registro) => boolean;

interface Resposta {
  data: any[];
  error: { message: string } | null;
  count: number;
}

interface RespostaUnica {
  data: any;
  error: { message: string } | null;
}

// ---------------------------------------------------------------------------
// Modo remoto x local
// ---------------------------------------------------------------------------

let remotoCache: Promise<boolean> | null = null;

/** Descobre uma única vez se o servidor tem DATABASE_URL configurada. */
function usarRemoto(): Promise<boolean> {
  remotoCache ??= bancoPronto()
    .then((r) => !!r?.configurado)
    .catch(() => false);
  return remotoCache;
}

function tokenSessao(): string | null {
  if (!temNavegador()) return null;
  return window.localStorage.getItem(CHAVE_TOKEN);
}

function guardarToken(token: string | null) {
  if (!temNavegador()) return;
  if (token) window.localStorage.setItem(CHAVE_TOKEN, token);
  else window.localStorage.removeItem(CHAVE_TOKEN);
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

class Consulta implements PromiseLike<Resposta> {
  private filtros: Filtro[] = [];
  private filtrosRemotos: FiltroRemoto[] = [];
  private ordenacao: { coluna: string; asc: boolean } | null = null;
  private limiteLinhas: number | null = null;
  private modo: "select" | "insert" | "update" | "delete" = "select";
  private valores: Registro | Registro[] | null = null;
  private contagem = false;
  private apenasContagem = false;
  private colunas = "*";
  private umUnico: "single" | "maybe" | null = null;

  constructor(private tabela: string) {}

  select(colunas = "*", opcoes?: { count?: "exact"; head?: boolean }) {
    if (this.modo === "select") {
      this.colunas = colunas;
      this.contagem = !!opcoes?.count;
      this.apenasContagem = !!opcoes?.head;
    }
    return this;
  }

  insert(valores: Registro | Registro[]) {
    this.modo = "insert";
    this.valores = valores;
    return this;
  }

  update(valores: Registro) {
    this.modo = "update";
    this.valores = valores;
    return this;
  }

  delete() {
    this.modo = "delete";
    return this;
  }

  eq(coluna: string, valor: unknown) {
    this.filtros.push((l) => String(l[coluna] ?? "") === String(valor ?? ""));
    this.filtrosRemotos.push({ coluna, operador: "eq", valor });
    return this;
  }

  neq(coluna: string, valor: unknown) {
    this.filtros.push((l) => String(l[coluna] ?? "") !== String(valor ?? ""));
    this.filtrosRemotos.push({ coluna, operador: "neq", valor });
    return this;
  }

  gte(coluna: string, valor: string | number) {
    this.filtros.push((l) => l[coluna] != null && String(l[coluna]) >= String(valor));
    this.filtrosRemotos.push({ coluna, operador: "gte", valor });
    return this;
  }

  lte(coluna: string, valor: string | number) {
    this.filtros.push((l) => l[coluna] != null && String(l[coluna]) <= String(valor));
    this.filtrosRemotos.push({ coluna, operador: "lte", valor });
    return this;
  }

  in(coluna: string, valores: unknown[]) {
    const lista = valores.map((v) => String(v));
    this.filtros.push((l) => lista.includes(String(l[coluna])));
    this.filtrosRemotos.push({ coluna, operador: "in", valor: valores });
    return this;
  }

  /** Suporta apenas o formato `not(coluna, "in", "(a,b)")`, usado no app. */
  not(coluna: string, operador: string, valor: string) {
    if (operador === "in") {
      const lista = valor
        .replace(/^\(/, "")
        .replace(/\)$/, "")
        .split(",")
        .map((v) => v.trim());
      this.filtros.push((l) => !lista.includes(String(l[coluna])));
      this.filtrosRemotos.push({ coluna, operador: "notIn", valor: lista });
    } else {
      this.filtros.push((l) => String(l[coluna] ?? "") !== String(valor));
      this.filtrosRemotos.push({ coluna, operador: "neq", valor });
    }
    return this;
  }

  order(coluna: string, opcoes?: { ascending?: boolean }) {
    this.ordenacao = { coluna, asc: opcoes?.ascending !== false };
    return this;
  }

  limit(quantidade: number) {
    this.limiteLinhas = quantidade;
    return this;
  }

  single(): PromiseLike<RespostaUnica> {
    this.umUnico = "single";
    return this as unknown as PromiseLike<RespostaUnica>;
  }

  maybeSingle(): PromiseLike<RespostaUnica> {
    this.umUnico = "maybe";
    return this as unknown as PromiseLike<RespostaUnica>;
  }

  private async executar(): Promise<any> {
    if (await usarRemoto()) return this.executarRemoto();
    return this.executarLocal();
  }

  private async executarRemoto(): Promise<any> {
    let valores = this.valores;
    if (this.modo === "insert" && valores) {
      const padroes = PADROES[this.tabela]?.() ?? {};
      const aplicar = (v: Registro) => ({ ...padroes, ...v });
      valores = Array.isArray(valores) ? valores.map(aplicar) : aplicar(valores);
    }
    const resposta = await consultar({
      data: {
        tabela: this.tabela,
        modo: this.modo,
        colunas: this.colunas,
        filtros: this.filtrosRemotos,
        ordenacao: this.ordenacao,
        limite: this.limiteLinhas,
        valores,
        apenasContagem: this.apenasContagem,
        umUnico: this.umUnico,
      },
    });
    if (this.umUnico) return { data: resposta.data ?? null, error: resposta.error };
    return resposta;
  }

  private executarLocal(): any {
    const banco = ler();
    const linhas = banco.tabelas[this.tabela] ?? (banco.tabelas[this.tabela] = []);
    const agora = new Date().toISOString();

    if (this.modo === "insert") {
      const entrada = Array.isArray(this.valores) ? this.valores : [this.valores ?? {}];
      const criadas = entrada.map((v) => ({
        ...(PADROES[this.tabela]?.() ?? {}),
        id: novoId(),
        created_at: agora,
        updated_at: agora,
        ...v,
      }));
      linhas.push(...criadas);
      gravar(banco);
      return { data: criadas, error: null };
    }

    if (this.modo === "update") {
      const alvo = linhas.filter((l) => this.filtros.every((f) => f(l)));
      for (const linha of alvo) Object.assign(linha, this.valores, { updated_at: agora });
      gravar(banco);
      return { data: alvo, error: null };
    }

    if (this.modo === "delete") {
      const restantes = linhas.filter((l) => !this.filtros.every((f) => f(l)));
      banco.tabelas[this.tabela] = restantes;
      gravar(banco);
      return { data: [], error: null };
    }

    let resultado = linhas.filter((l) => this.filtros.every((f) => f(l)));

    if (this.ordenacao) {
      const { coluna, asc } = this.ordenacao;
      resultado = [...resultado].sort((a, b) => {
        const va = a[coluna] ?? "";
        const vb = b[coluna] ?? "";
        if (va === vb) return 0;
        return (va > vb ? 1 : -1) * (asc ? 1 : -1);
      });
    }

    const total = resultado.length;
    if (this.limiteLinhas != null) resultado = resultado.slice(0, this.limiteLinhas);

    // Relação simples: `select("*, animais(nome)")`
    if (this.colunas.includes("animais(")) {
      const animais = banco.tabelas["animais"] ?? [];
      resultado = resultado.map((l) => {
        const animal = animais.find((a) => a["id"] === l["animal_id"]);
        return { ...l, animais: animal ? { nome: animal["nome"] } : null };
      });
    }

    if (this.apenasContagem) return { data: null, error: null, count: total };

    if (this.umUnico) {
      const primeiro = resultado[0] ?? null;
      if (!primeiro && this.umUnico === "single") {
        return { data: null, error: { message: "Nenhum registro encontrado." }, count: 0 };
      }
      return { data: primeiro, error: null, count: total };
    }

    return { data: resultado, error: null, count: total };
  }

  then<TResult1 = Resposta, TResult2 = never>(
    resolve?: ((valor: Resposta) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((motivo: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.executar()
      .then((r) => r as Resposta)
      .then(resolve, reject)
      .catch((erro: unknown) => {
        const resposta: Resposta = {
          data: [],
          count: 0,
          error: { message: erro instanceof Error ? erro.message : "Erro de dados" },
        };
        return Promise.resolve(resposta).then(resolve, reject);
      });
  }
}

// ---------------------------------------------------------------------------
// Autenticação (remota quando há banco; local como fallback)
// ---------------------------------------------------------------------------

export interface UsuarioSessao {
  id: string;
  email: string;
  user_metadata: { nome: string | null; objetivo: string | null };
}

type EventoAuth = "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED" | "INITIAL_SESSION";

const ouvintes = new Set<(evento: EventoAuth) => void>();

function avisar(evento: EventoAuth) {
  for (const ouvinte of ouvintes) ouvinte(evento);
}

function paraSessao(usuario: UsuarioLocal): UsuarioSessao {
  return {
    id: usuario.id,
    email: usuario.email,
    user_metadata: { nome: usuario.nome, objetivo: usuario.objetivo },
  };
}

const auth = {
  async getUser() {
    if (await usarRemoto()) {
      const r = await usuarioAtual({ data: { token: tokenSessao() } });
      return { data: { user: r.data.user ?? null }, error: r.error };
    }
    const banco = ler();
    const usuario = banco.usuarios.find((u) => u.id === banco.sessaoUserId);
    if (!usuario) return { data: { user: null }, error: null };
    return { data: { user: paraSessao(usuario) }, error: null };
  },

  async getSession() {
    const { data } = await auth.getUser();
    return {
      data: { session: data.user ? { user: data.user, access_token: tokenSessao() ?? "local" } : null },
      error: null,
    };
  },

  async signUp(params: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: { nome?: string | null; objetivo?: string | null } };
  }) {
    if (await usarRemoto()) {
      const r = await cadastrar({
        data: {
          email: params.email,
          senha: params.password,
          nome: params.options?.data?.nome ?? null,
          objetivo: params.options?.data?.objetivo ?? null,
        },
      });
      if (!r.error && r.data.session) {
        guardarToken(r.data.session.access_token);
        avisar("SIGNED_IN");
      }
      return r;
    }
    const banco = ler();
    const email = params.email.trim().toLowerCase();
    if (banco.usuarios.some((u) => u.email === email)) {
      return {
        data: { user: null, session: null },
        error: { message: "User already registered" },
      };
    }
    if (params.password.length < 8) {
      return {
        data: { user: null, session: null },
        error: { message: "Password should be at least 8 characters" },
      };
    }
    const usuario: UsuarioLocal = {
      id: novoId(),
      email,
      senha: params.password,
      nome: params.options?.data?.nome ?? null,
      objetivo: params.options?.data?.objetivo ?? null,
      created_at: new Date().toISOString(),
    };
    banco.usuarios.push(usuario);
    banco.sessaoUserId = usuario.id;
    banco.tabelas["perfis"] = [
      ...(banco.tabelas["perfis"] ?? []),
      {
        ...PADROES["perfis"]!(),
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        objetivo: usuario.objetivo,
        created_at: usuario.created_at,
        updated_at: usuario.created_at,
      },
    ];
    gravar(banco);
    avisar("SIGNED_IN");
    const sessao = paraSessao(usuario);
    return { data: { user: sessao, session: { user: sessao } }, error: null };
  },

  async signInWithPassword(params: { email: string; password: string }) {
    if (await usarRemoto()) {
      const r = await entrar({ data: { email: params.email, senha: params.password } });
      if (!r.error && r.data.session) {
        guardarToken(r.data.session.access_token);
        avisar("SIGNED_IN");
      }
      return r;
    }
    const banco = ler();
    const email = params.email.trim().toLowerCase();
    const usuario = banco.usuarios.find((u) => u.email === email);
    if (!usuario || usuario.senha !== params.password) {
      return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
    }
    banco.sessaoUserId = usuario.id;
    gravar(banco);
    avisar("SIGNED_IN");
    const sessao = paraSessao(usuario);
    return { data: { user: sessao, session: { user: sessao } }, error: null };
  },

  async signOut(_opcoes?: { scope?: string }) {
    if (await usarRemoto()) {
      await sair({ data: { token: tokenSessao() } });
      guardarToken(null);
      avisar("SIGNED_OUT");
      return { error: null };
    }
    const banco = ler();
    banco.sessaoUserId = null;
    gravar(banco);
    avisar("SIGNED_OUT");
    return { error: null };
  },

  async updateUser(valores: { password?: string; email?: string; data?: Registro }) {
    if (await usarRemoto()) {
      const r = await atualizarUsuario({
        data: {
          token: tokenSessao(),
          ...(valores.password ? { password: valores.password } : {}),
          ...(valores.email ? { email: valores.email } : {}),
        },
      });
      if (!r.error) avisar("USER_UPDATED");
      return r;
    }
    const banco = ler();
    const usuario = banco.usuarios.find((u) => u.id === banco.sessaoUserId);
    if (!usuario) return { data: { user: null }, error: { message: "Sem sessão ativa." } };
    if (valores.password) usuario.senha = valores.password;
    if (valores.email) usuario.email = valores.email.trim().toLowerCase();
    gravar(banco);
    avisar("USER_UPDATED");
    return { data: { user: paraSessao(usuario) }, error: null };
  },

  async resetPasswordForEmail(_email: string, _opcoes?: { redirectTo?: string }) {
    // Sem envio de e-mail; a tela mostra a mensagem neutra de sempre.
    return { data: {}, error: null };
  },

  onAuthStateChange(callback: (evento: EventoAuth) => void) {
    ouvintes.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe() {
            ouvintes.delete(callback);
          },
        },
      },
    };
  },
};

export const db = {
  from(tabela: string) {
    return new Consulta(tabela);
  },
  auth,
};

/** Apaga a conta atual e todos os dados das fazendas em que ela é dona. */
export async function excluirContaLocal() {
  if (await usarRemoto()) {
    const r = await excluirConta({ data: { token: tokenSessao() } });
    guardarToken(null);
    avisar("SIGNED_OUT");
    return r;
  }
  const banco = ler();
  const userId = banco.sessaoUserId;
  if (!userId) return { ok: true };
  const fazendas = (banco.tabelas["fazendas"] ?? []).filter((f) => f["dono_id"] === userId);
  const ids = new Set(fazendas.map((f) => f["id"]));
  for (const tabela of TABELAS) {
    if (tabela === "perfis") continue;
    banco.tabelas[tabela] = (banco.tabelas[tabela] ?? []).filter((l) =>
      tabela === "fazendas" ? !ids.has(l["id"]) : !ids.has(l["fazenda_id"]),
    );
  }
  banco.tabelas["perfis"] = (banco.tabelas["perfis"] ?? []).filter((p) => p["id"] !== userId);
  banco.usuarios = banco.usuarios.filter((u) => u.id !== userId);
  banco.sessaoUserId = null;
  gravar(banco);
  avisar("SIGNED_OUT");
  return { ok: true };
}