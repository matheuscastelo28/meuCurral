/**
 * Conexão com o PostgreSQL e criação automática do esquema.
 *
 * Basta definir a variável de ambiente DATABASE_URL (a "chave" de conexão do
 * pgAdmin). Na primeira consulta o sistema cria sozinho todas as tabelas e
 * colunas, sem precisar rodar nada à mão.
 *
 * Exemplo de DATABASE_URL:
 *   postgresql://postgres:SENHA@localhost:5432/meucurral
 */
import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

let clienteCache: Sql | null = null;
let esquemaPronto: Promise<void> | null = null;

export function urlBanco(): string | null {
  return process.env["DATABASE_URL"] ?? process.env["POSTGRES_URL"] ?? null;
}

function criarCliente(): Sql {
  const url = urlBanco();
  if (!url) {
    throw new Error(
      "Banco não configurado. Defina DATABASE_URL com a chave de conexão do PostgreSQL.",
    );
  }
  const precisaSsl = /sslmode=require|neon\.tech|supabase\.co|render\.com/.test(url);
  return postgres(url, {
    max: 3,
    idle_timeout: 20,
    prepare: false,
    ...(precisaSsl ? { ssl: "require" as const } : {}),
  });
}

export function sqlCliente(): Sql {
  clienteCache ??= criarCliente();
  return clienteCache;
}

const ESQUEMA = `
create extension if not exists "pgcrypto";

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  senha_hash text not null,
  nome text,
  objetivo text,
  email_verificado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contas criadas antes deste recurso existir já contam como verificadas
-- (default true acima). O cadastro passa email_verificado = false na hora
-- de criar a conta, então só quem se cadastra a partir de agora precisa
-- confirmar o e-mail.
alter table usuarios add column if not exists email_verificado boolean not null default true;

create table if not exists sessoes (
  token text primary key,
  user_id uuid not null references usuarios(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Um código pendente por usuário: pedir um novo substitui o anterior.
create table if not exists verificacoes_email (
  user_id uuid primary key references usuarios(id) on delete cascade,
  codigo_hash text not null,
  tentativas integer not null default 0,
  expira_em timestamptz not null,
  enviado_em timestamptz not null default now()
);

create table if not exists perfis (
  id uuid primary key references usuarios(id) on delete cascade,
  nome text,
  email text,
  objetivo text,
  unidade_peso text default 'kg',
  moeda text default 'BRL',
  inicio_semana integer default 0,
  alerta_vacina boolean default true,
  alerta_pesagem boolean default true,
  alerta_parto boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fazendas (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid references usuarios(id) on delete cascade,
  nome text not null,
  cidade text,
  estado text,
  plano text default 'gratis',
  produtos_leite jsonb default '["leite"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fazenda_membros (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  user_id uuid references usuarios(id) on delete cascade,
  papel text default 'membro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists animais (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  nome text,
  brinco text,
  especie text default 'bovino',
  raca text,
  sexo text default 'femea',
  categoria text default 'vaca',
  status text default 'ativo',
  nascimento date,
  peso_kg numeric,
  lote text,
  mae text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manejos (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  animal_id uuid references animais(id) on delete cascade,
  tipo text,
  data date default current_date,
  proxima_data date,
  descricao text,
  valor numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists producao_leite (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  animal_id uuid references animais(id) on delete set null,
  data date default current_date,
  litros numeric,
  turno text default 'manha',
  produto text default 'leite',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reproducao (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  animal_id uuid references animais(id) on delete set null,
  tipo text,
  data date default current_date,
  previsao_parto date,
  touro text,
  resultado text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  tipo text,
  descricao text,
  valor numeric,
  data date default current_date,
  categoria text,
  forma_pagamento text default 'dinheiro',
  parcelas integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists eventos_agenda (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  animal_id uuid references animais(id) on delete set null,
  tipo text default 'outro',
  titulo text,
  descricao text,
  data date default current_date,
  concluido boolean default false,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_animais_fazenda on animais(fazenda_id);
create index if not exists idx_manejos_fazenda on manejos(fazenda_id);
create index if not exists idx_leite_fazenda on producao_leite(fazenda_id);
create index if not exists idx_reproducao_fazenda on reproducao(fazenda_id);
create index if not exists idx_financeiro_fazenda on financeiro_lancamentos(fazenda_id);
create index if not exists idx_eventos_fazenda on eventos_agenda(fazenda_id);
`;

/** Cria as tabelas na primeira vez que o banco é usado. */
export function garantirEsquema(): Promise<void> {
  esquemaPronto ??= (async () => {
    const sql = sqlCliente();
    await sql.unsafe(ESQUEMA);
  })().catch((erro) => {
    esquemaPronto = null;
    throw erro;
  });
  return esquemaPronto;
}

export async function conexao(): Promise<Sql> {
  await garantirEsquema();
  return sqlCliente();
}
