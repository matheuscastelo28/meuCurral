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
-- (default true acima). Uma linha em usuarios só é criada depois que o
-- código de verificação é confirmado (ver cadastros_pendentes abaixo),
-- então toda conta nova nessa tabela já nasce com email_verificado = true.
alter table usuarios add column if not exists email_verificado boolean not null default true;

create table if not exists sessoes (
  token text primary key,
  user_id uuid not null references usuarios(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Cadastro em andamento: só vira usuário de verdade (tabela usuarios)
-- depois que o código de 6 dígitos é confirmado. Assim quem nunca confirma
-- o e-mail não fica ocupando o endereço nem aparece como usuário real.
create table if not exists cadastros_pendentes (
  email text primary key,
  senha_hash text not null,
  nome text,
  objetivo text,
  nome_fazenda text not null,
  cidade text,
  estado text,
  codigo_hash text not null,
  tentativas integer not null default 0,
  expira_em timestamptz not null,
  enviado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

drop table if exists verificacoes_email;

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
  -- Nome do lote (mesmo texto livre de animais.lote — não existe uma
  -- tabela de lotes própria). Um registro é por vaca (animal_id) OU por
  -- lote (lote), nunca os dois.
  lote text,
  data date default current_date,
  litros numeric,
  turno text default 'manha',
  produto text default 'leite',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table producao_leite add column if not exists lote text;

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
  -- Lançamentos vindos de uma venda nascem "a_receber" e viram "recebido"
  -- quando o produtor confirma o pagamento. Lançamentos manuais (o fluxo
  -- que já existia) continuam "confirmado", sem esse controle.
  status text not null default 'confirmado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table financeiro_lancamentos add column if not exists status text not null default 'confirmado';

-- Preço vigente de um produto (leite, queijo etc.) num período. O preço
-- válido pra uma data é o registro com data_inicio <= data e (data_fim is
-- null ou data_fim >= data) — nunca o preço "atual", pra não bagunçar o
-- histórico quando o preço muda.
create table if not exists precos_produto (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  produto text not null default 'leite',
  valor numeric not null,
  unidade text not null default 'litro',
  comprador text,
  forma_pagamento text,
  data_inicio date not null default current_date,
  data_fim date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- O que foi feito com a produção de um dia (venda, bezerros, queijo,
-- consumo, descarte...). Fica separado da produção em si porque nem tudo
-- que é produzido é vendido — o financeiro só pode nascer da parte que
-- efetivamente virou "venda".
create table if not exists destinacoes_leite (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  data date not null default current_date,
  destino text not null,
  quantidade numeric not null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma venda gera no máximo um lançamento financeiro (financeiro_id), que
-- começa "a_receber" e vira "recebido" quando o produtor confirma.
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  produto text not null default 'leite',
  quantidade numeric not null,
  unidade text not null default 'litro',
  preco_unitario numeric not null,
  valor_total numeric not null,
  comprador text,
  data date not null default current_date,
  financeiro_id uuid references financeiro_lancamentos(id) on delete set null,
  -- Preenchido quando a venda é de um animal específico (Engorda avulsa) —
  -- permite mostrar a venda na ficha daquele animal.
  animal_id uuid references animais(id) on delete set null,
  -- Preenchido quando a venda é de um lote inteiro (Engorda por lote) —
  -- nesse caso animal_id fica nulo, pois a venda cobre vários animais.
  lote text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vendas add column if not exists animal_id uuid references animais(id) on delete set null;
alter table vendas add column if not exists lote text;

-- Despesas de um lote em engorda (ração, sanidade etc.) usam o mesmo texto
-- livre de animais.lote, igual à produção de leite por lote — não existe
-- uma tabela de lotes própria.
alter table financeiro_lancamentos add column if not exists lote text;

create index if not exists idx_precos_produto_fazenda on precos_produto(fazenda_id, produto, data_inicio);
create index if not exists idx_destinacoes_leite_fazenda on destinacoes_leite(fazenda_id, data);
create index if not exists idx_vendas_fazenda on vendas(fazenda_id, data);
create index if not exists idx_vendas_animal on vendas(animal_id);
create index if not exists idx_financeiro_lote on financeiro_lancamentos(fazenda_id, lote);

create table if not exists eventos_agenda (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  animal_id uuid references animais(id) on delete set null,
  tipo text default 'outro',
  titulo text,
  descricao text,
  data date default current_date,
  concluido boolean default false,
  -- Cancelado é um status à parte de concluído: um evento cancelado não
  -- aconteceu nem precisa mais acontecer, diferente de um feito (aconteceu)
  -- ou pendente (ainda vai acontecer). "Atrasado" não tem coluna própria —
  -- é calculado (data no passado e nem concluído nem cancelado).
  cancelado boolean not null default false,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table eventos_agenda add column if not exists cancelado boolean not null default false;

-- Registro diário de alimentação de um lote em engorda (kg de forragem,
-- silagem e ração concentrada), igual ao texto livre de animais.lote usado
-- em produção/despesas por lote. custo_dia é opcional: quando preenchido,
-- a tela de Engorda também lança uma despesa (categoria 'racao') pra esse
-- valor entrar no custo acumulado do lote — igual ao fluxo manual que já
-- existia em "Registrar custo do lote".
create table if not exists alimentacao_lote (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  lote text not null,
  data date not null default current_date,
  forragem_kg numeric,
  silagem_kg numeric,
  racao_kg numeric,
  custo_dia numeric,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alimentacao_lote_fazenda on alimentacao_lote(fazenda_id, lote, data);

-- Rotina de alimentação: lote vira opcional (nulo = aplicado ao rebanho
-- todo, não a um lote específico), e "Outro" passa a ser um tipo de
-- alimento livre além de forragem/silagem/ração.
alter table alimentacao_lote alter column lote drop not null;
alter table alimentacao_lote add column if not exists outro_kg numeric;
alter table alimentacao_lote add column if not exists outro_descricao text;

-- Liga o registro de alimentação à despesa que ele gerou (quando tinha
-- custo do dia), pra editar/excluir a rotina já arrastar a despesa junto
-- em vez de deixar um lançamento órfão no financeiro.
alter table alimentacao_lote add column if not exists despesa_id uuid
  references financeiro_lancamentos(id) on delete set null;

create index if not exists idx_animais_fazenda on animais(fazenda_id);
create index if not exists idx_manejos_fazenda on manejos(fazenda_id);
create index if not exists idx_leite_fazenda on producao_leite(fazenda_id);
create index if not exists idx_reproducao_fazenda on reproducao(fazenda_id);
create index if not exists idx_financeiro_fazenda on financeiro_lancamentos(fazenda_id);
create index if not exists idx_eventos_fazenda on eventos_agenda(fazenda_id);

-- Uma conta é a obrigação (o que a fazenda tem a receber ou a pagar);
-- parcelas são os vencimentos dela. valor_restante some ao longo dos
-- pagamentos; status 'atrasado' NÃO existe aqui — é sempre calculado a
-- partir de vencimento x data de hoje, igual ao padrão já usado em
-- eventos_agenda (ver statusDoEvento em calendario.tsx).
create table if not exists contas (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references fazendas(id) on delete cascade,
  tipo text not null, -- 'a_receber' | 'a_pagar'
  descricao text not null,
  valor_total numeric not null,
  valor_restante numeric not null,
  categoria text,
  pessoa text,
  animal_id uuid references animais(id) on delete set null,
  forma_pagamento text,
  data_emissao date not null default current_date,
  observacoes text,
  status text not null default 'pendente', -- 'pendente' | 'parcial' | 'pago' | 'cancelado'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists parcelas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid references contas(id) on delete cascade,
  -- Duplicado de contas.fazenda_id (mesmo padrão de financeiro_lancamentos.lote)
  -- só para o "consultar" genérico conseguir isolar por fazenda sem join.
  fazenda_id uuid references fazendas(id) on delete cascade,
  numero integer not null,
  total_parcelas integer not null,
  valor numeric not null,
  vencimento date not null,
  status text not null default 'pendente', -- 'pendente' | 'pago' | 'cancelado'
  pago_em date,
  forma_pagamento text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contas_fazenda on contas(fazenda_id, status);
create index if not exists idx_contas_animal on contas(animal_id);
create index if not exists idx_parcelas_conta on parcelas(conta_id, numero);
create index if not exists idx_parcelas_vencimento on parcelas(vencimento, status);
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
