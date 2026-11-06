export type PlanoId = "gratis" | "essencial" | "profissional" | "fazenda_grande" | "acesso_total";

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
  relatorios: boolean;
  exportacao: boolean;
  multiUsuario: boolean;
  api: boolean;
  beneficios: string[];
}

export const PLANOS: Plano[] = [
  {
    id: "gratis",
    nome: "Grátis",
    preco: "R$ 0",
    periodo: "para sempre",
    resumo: "Para começar a sair da planilha hoje.",
    limiteAnimais: 10,
    limiteUsuarios: 1,
    relatorios: false,
    exportacao: false,
    multiUsuario: false,
    api: false,
    beneficios: [
      "Até 10 cabeças cadastradas",
      "1 usuário",
      "Cadastro e ficha do animal",
      "Calendário e manejo básico",
    ],
  },
  {
    id: "essencial",
    nome: "Essencial",
    preco: "R$ 49,90",
    valorMensal: 49.9,
    periodo: "por mês",
    resumo: "Para o produtor que já tem rebanho formado.",
    limiteAnimais: 100,
    limiteUsuarios: 1,
    relatorios: true,
    exportacao: false,
    multiUsuario: false,
    api: false,
    beneficios: [
      "Até 100 cabeças",
      "Relatórios simples",
      "Alertas de vacinação e pesagem",
      "Suporte por e-mail",
    ],
  },
  {
    id: "profissional",
    nome: "Profissional",
    preco: "R$ 79,90",
    valorMensal: 79.9,
    periodo: "por mês",
    resumo: "Para quem divide o manejo com a equipe.",
    limiteAnimais: 250,
    limiteUsuarios: 10,
    relatorios: true,
    exportacao: true,
    multiUsuario: true,
    api: false,
    beneficios: [
      "Até 250 cabeças",
      "Múltiplos usuários por fazenda",
      "Exportação de dados",
      "Histórico completo por animal",
    ],
  },
  {
    id: "fazenda_grande",
    nome: "Fazenda Grande",
    preco: "Sob consulta",
    periodo: "anual",
    resumo: "Para operações com vários retiros e integrações.",
    limiteAnimais: Number.POSITIVE_INFINITY,
    limiteUsuarios: Number.POSITIVE_INFINITY,
    relatorios: true,
    exportacao: true,
    multiUsuario: true,
    api: true,
    beneficios: [
      "Cabeças ilimitadas",
      "Suporte prioritário",
      "Acesso via API",
      "Onboarding assistido",
    ],
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
  relatorios: true,
  exportacao: true,
  multiUsuario: true,
  api: false,
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
  return PLANOS.find((p) => p.id === id) ?? PLANOS[0]!;
}

export function limiteTexto(valor: number) {
  return Number.isFinite(valor) ? String(valor) : "ilimitado";
}

/** "3 de 10 cabeças" com limite; só "3 cabeças" quando é ilimitado. */
export function usoCabecasTexto(usados: number, limite: number) {
  const cabecas = usados === 1 ? "cabeça" : "cabeças";
  return Number.isFinite(limite) ? `${usados} de ${limite} ${cabecas}` : `${usados} ${cabecas}`;
}
