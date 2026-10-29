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
    // Fase de testes: sem limite de cabeças no grátis. Pra voltar ao
    // limite, troque por 10 (e o texto do primeiro benefício abaixo).
    limiteAnimais: Number.POSITIVE_INFINITY,
    limiteUsuarios: 1,
    relatorios: false,
    exportacao: false,
    multiUsuario: false,
    api: false,
    beneficios: [
      "Cabeças ilimitadas na fase de testes",
      "1 usuário",
      "Cadastro e ficha do animal",
      "Calendário e manejo básico",
    ],
  },
  {
    id: "essencial",
    nome: "Essencial",
    preco: "R$ 109,90",
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
    preco: "R$ 210,90",
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
