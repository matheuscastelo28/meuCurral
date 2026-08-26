export type PlanoId = "gratis" | "essencial" | "profissional" | "fazenda_grande";

export interface Plano {
  id: PlanoId;
  nome: string;
  preco: string;
  periodo: string;
  resumo: string;
  limiteAnimais: number;
  limiteUsuarios: number;
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
    preco: "R$ 29,90",
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
    periodo: "por mês",
    resumo: "Para quem divide o manejo com a equipe.",
    limiteAnimais: 500,
    limiteUsuarios: 10,
    relatorios: true,
    exportacao: true,
    multiUsuario: true,
    api: false,
    beneficios: [
      "Até 500 cabeças",
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
    beneficios: ["Cabeças ilimitadas", "Suporte prioritário", "Acesso via API", "Onboarding assistido"],
  },
];

export function getPlano(id: PlanoId | string | null | undefined): Plano {
  return PLANOS.find((p) => p.id === id) ?? PLANOS[0]!;
}

export function limiteTexto(valor: number) {
  return Number.isFinite(valor) ? String(valor) : "ilimitado";
}
