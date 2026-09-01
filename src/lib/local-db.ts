/**
 * Camada de dados do app — fala sempre com o Postgres (ver src/lib/pg.server.ts
 * e src/lib/dados.functions.ts). Sem fallback em localStorage: se DATABASE_URL
 * não estiver configurada, as chamadas retornam erro em vez de gravar no
 * navegador.
 *
 * API exposta: `db.from("tabela").select(...)`, `.insert(...)`, `.update(...)`,
 * `.delete()` e `db.auth.*`.
 */

import {
  consultar,
  cadastrar,
  entrar,
  usuarioAtual,
  sair,
  atualizarUsuario,
  excluirConta,
  enviarCodigoVerificacao,
  verificarCodigoEmail,
  type FiltroRemoto,
} from "@/lib/dados.functions";

const CHAVE_TOKEN = "mcd:pg-token";

export type Registro = Record<string, any>;

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
  manejos: () => ({
    proxima_data: null,
    descricao: null,
    valor: null,
    animal_id: null,
  }),
  producao_leite: () => ({
    turno: "manha",
    produto: "leite",
    observacoes: null,
    animal_id: null,
  }),
  reproducao: () => ({
    previsao_parto: null,
    touro: null,
    resultado: null,
    observacoes: null,
  }),
  financeiro_lancamentos: () => ({
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

interface Resposta {
  data: any[];
  error: { message: string } | null;
  count: number;
}

interface RespostaUnica {
  data: any;
  error: { message: string } | null;
}

function temNavegador() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
    this.filtrosRemotos.push({ coluna, operador: "eq", valor });
    return this;
  }

  neq(coluna: string, valor: unknown) {
    this.filtrosRemotos.push({ coluna, operador: "neq", valor });
    return this;
  }

  gte(coluna: string, valor: string | number) {
    this.filtrosRemotos.push({ coluna, operador: "gte", valor });
    return this;
  }

  lte(coluna: string, valor: string | number) {
    this.filtrosRemotos.push({ coluna, operador: "lte", valor });
    return this;
  }

  in(coluna: string, valores: unknown[]) {
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
      this.filtrosRemotos.push({ coluna, operador: "notIn", valor: lista });
    } else {
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
    let valores = this.valores;
    if (this.modo === "insert" && valores) {
      const padroes = PADROES[this.tabela]?.() ?? {};
      const aplicar = (v: Registro) => ({ ...padroes, ...v });
      valores = Array.isArray(valores) ? valores.map(aplicar) : aplicar(valores);
    }
    const resposta = await consultar({
      data: {
        token: tokenSessao(),
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
// Autenticação (sempre via Postgres, sessão guardada por token)
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

const auth = {
  async getUser() {
    const r = await usuarioAtual({ data: { token: tokenSessao() } });
    return { data: { user: r.data.user ?? null }, error: r.error };
  },

  async getSession() {
    const { data } = await auth.getUser();
    return {
      data: { session: data.user ? { user: data.user, access_token: tokenSessao() ?? "" } : null },
      error: null,
    };
  },

  async signUp(params: {
    email: string;
    password: string;
    nomeFazenda: string;
    cidade?: string | null;
    estado?: string | null;
    options?: {
      emailRedirectTo?: string;
      data?: { nome?: string | null; objetivo?: string | null };
    };
  }) {
    // Não loga automaticamente: a conta só ganha sessão depois que o e-mail
    // é confirmado com o código de 6 dígitos (ver auth.verificarCodigo).
    return cadastrar({
      data: {
        email: params.email,
        senha: params.password,
        nome: params.options?.data?.nome ?? null,
        objetivo: params.options?.data?.objetivo ?? null,
        nomeFazenda: params.nomeFazenda,
        cidade: params.cidade ?? null,
        estado: params.estado ?? null,
      },
    });
  },

  async signInWithPassword(params: { email: string; password: string }) {
    const r = await entrar({ data: { email: params.email, senha: params.password } });
    if (!r.error && r.data.session) {
      guardarToken(r.data.session.access_token);
      avisar("SIGNED_IN");
    }
    return r;
  },

  /** Confirma o código de 6 dígitos e, se estiver certo, já cria a sessão. */
  async verificarCodigo(params: { email: string; codigo: string }) {
    const r = await verificarCodigoEmail({ data: { email: params.email, codigo: params.codigo } });
    if (!r.error && r.data.session) {
      guardarToken(r.data.session.access_token);
      avisar("SIGNED_IN");
    }
    return r;
  },

  /** Pede um novo código de verificação (sujeito a cooldown de 60s no servidor). */
  async reenviarCodigo(params: { email: string }) {
    return enviarCodigoVerificacao({ data: { email: params.email } });
  },

  async signOut(_opcoes?: { scope?: string }) {
    await sair({ data: { token: tokenSessao() } });
    guardarToken(null);
    avisar("SIGNED_OUT");
    return { error: null };
  },

  async updateUser(valores: { password?: string; email?: string; data?: Registro }) {
    const r = await atualizarUsuario({
      data: {
        token: tokenSessao(),
        ...(valores.password ? { password: valores.password } : {}),
        ...(valores.email ? { email: valores.email } : {}),
      },
    });
    if (!r.error) avisar("USER_UPDATED");
    return r;
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
export async function excluirContaAtual() {
  const r = await excluirConta({ data: { token: tokenSessao() } });
  guardarToken(null);
  avisar("SIGNED_OUT");
  return r;
}
