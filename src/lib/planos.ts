export type PlanoId = "gratis" | "caderno" | "profissional" | "fazenda_grande" | "acesso_total";

/**
 * O que cada plano libera. A matriz de planos está aqui e só aqui: telas,
 * servidor e cobrança leem destas flags, para nunca discordarem.
 */
export interface Recursos {
  /** Histórico de partos por animal, aba de Nascimentos e registro de vários partos. */
  reproducaoCompleta: boolean;
  /** GMD, conversão, custo/kg e arroba no Confinamento. */
  confinamentoCompleto: boolean;
  /** GMD, DEL e taxa de prenhez. */
  indicadores: boolean;
  /** Fêmeas improdutivas e intervalo entre partos. */
  indicesAvancados: boolean;
  /** Contas a pagar/receber, parcelas e cartão, fluxo, custo por lote/animal e resultado por atividade. */
  financeiroCompleto: boolean;
  /** Relatório em PDF e Excel com cabeçalho da fazenda (o básico em tela é de todos). */
  relatoriosCompletos: boolean;
  /** Alertas também por e-mail (todos têm os alertas dentro do app). */
  alertasEmail: boolean;
  /** Exportar os próprios dados: direito do titular (LGPD), vale para todos. */
  exportarDados: boolean;
  geolocalizacao: boolean;
}

export type RecursoId = keyof Recursos;

export interface Plano {
  id: PlanoId;
  nome: string;
  preco: string;
  periodo: string;
  resumo: string;
  limiteAnimais: number;
  limiteUsuarios: number;
  /** Valor cobrado por mês na assinatura (Mercado Pago). Sem ele, não há checkout. */
  valorMensal?: number;
  /** Valor da assinatura anual (cobrado uma vez por ano). */
  valorAnual?: number;
  recursos: Recursos;
  beneficios: string[];
}

const TUDO: Recursos = {
  reproducaoCompleta: true,
  confinamentoCompleto: true,
  indicadores: true,
  indicesAvancados: true,
  financeiroCompleto: true,
  relatoriosCompletos: true,
  alertasEmail: true,
  exportarDados: true,
  geolocalizacao: false,
};

export const PLANOS: Plano[] = [
  {
    id: "gratis",
    nome: "Grátis",
    preco: "R$ 0",
    periodo: "para sempre",
    resumo: "Para começar a sair da planilha hoje.",
    limiteAnimais: 10,
    limiteUsuarios: 1,
    recursos: {
      reproducaoCompleta: false,
      confinamentoCompleto: false,
      indicadores: false,
      indicesAvancados: false,
      financeiroCompleto: false,
      relatoriosCompletos: false,
      alertasEmail: false,
      exportarDados: true,
      geolocalizacao: false,
    },
    beneficios: [
      "Até 10 cabeças cadastradas",
      "1 usuário",
      "Rebanho, manejo, agenda e leite",
      "Reprodução básica: cobertura, parto e diagnóstico",
      "Confinamento básico: entrada, peso e saída",
      "Financeiro simples: entradas e saídas",
      "Relatório básico em tela",
      "Alertas dentro do app",
    ],
  },
  {
    id: "caderno",
    nome: "Caderno",
    preco: "R$ 59,90",
    valorMensal: 59.9,
    valorAnual: 599,
    periodo: "por mês",
    resumo: "Para o produtor que já tem rebanho formado.",
    limiteAnimais: 100,
    limiteUsuarios: 1,
    recursos: { ...TUDO },
    beneficios: [
      "Até 100 cabeças",
      "Reprodução completa, com histórico de partos por animal",
      "Confinamento completo: GMD, conversão, custo/kg e arroba",
      "Indicadores (GMD, DEL, taxa de prenhez) e índices avançados",
      "Financeiro completo: contas, parcelas e custo por lote e animal",
      "Relatórios em PDF e Excel com cabeçalho da fazenda",
      "Alertas dentro do app e por e-mail",
    ],
  },
  {
    id: "profissional",
    nome: "Profissional",
    preco: "R$ 79,90",
    valorMensal: 79.9,
    // Mesma lógica do Caderno (10 mensalidades no ano). Confirmar o valor.
    valorAnual: 799,
    periodo: "por mês",
    resumo: "Para quem divide o manejo com a equipe.",
    limiteAnimais: 250,
    limiteUsuarios: 3,
    recursos: { ...TUDO },
    beneficios: ["Até 250 cabeças", "Tudo do Caderno", "2 a 3 usuários na mesma fazenda"],
  },
  {
    id: "fazenda_grande",
    nome: "Fazenda Grande",
    preco: "Sob consulta",
    periodo: "anual",
    resumo: "Para operações com vários retiros e integrações.",
    limiteAnimais: Number.POSITIVE_INFINITY,
    limiteUsuarios: Number.POSITIVE_INFINITY,
    recursos: { ...TUDO },
    beneficios: ["Cabeças ilimitadas", "Suporte prioritário", "Onboarding assistido"],
  },
];

/**
 * Plano das fazendas que já existiam quando os planos foram ligados
 * (fazendas.acesso_total = true): sem limite de cabeças e com tudo liberado.
 * Não aparece na página de preços — só quem já tinha conta chega nele.
 */
export const PLANO_ACESSO_TOTAL: Plano = {
  id: "acesso_total",
  nome: "Acesso total",
  preco: "—",
  periodo: "",
  resumo: "Cadastro anterior aos planos: tudo liberado, sem limite de cabeças.",
  limiteAnimais: Number.POSITIVE_INFINITY,
  limiteUsuarios: Number.POSITIVE_INFINITY,
  recursos: { ...TUDO },
  beneficios: [],
};

/** Plano que vale de fato pra uma fazenda (acesso total tem prioridade). */
export function planoDaFazenda(
  fazenda: { plano?: string | null; acesso_total?: boolean | null } | null | undefined,
): Plano {
  if (fazenda?.acesso_total) return PLANO_ACESSO_TOTAL;
  return getPlano(fazenda?.plano);
}

export function getPlano(id: PlanoId | string | null | undefined): Plano {
  // "essencial" é o antigo nome do Caderno (contas e cobranças antigas).
  const alvo = id === "essencial" ? "caderno" : id;
  return PLANOS.find((p) => p.id === alvo) ?? PLANOS[0]!;
}

/** Plano mínimo que libera o recurso (para dizer "faz parte do plano X"). */
export function planoMinimoDo(recurso: RecursoId): Plano {
  return PLANOS.find((p) => p.recursos[recurso]) ?? PLANOS[0]!;
}

export function planoTemRecurso(plano: Plano, recurso: RecursoId): boolean {
  return plano.recursos[recurso];
}

export function limiteTexto(valor: number) {
  return Number.isFinite(valor) ? String(valor) : "ilimitado";
}

/** "3 de 10 cabeças" com limite; só "3 cabeças" quando é ilimitado. */
export function usoCabecasTexto(usados: number, limite: number) {
  const cabecas = usados === 1 ? "cabeça" : "cabeças";
  return Number.isFinite(limite) ? `${usados} de ${limite} ${cabecas}` : `${usados} ${cabecas}`;
}
