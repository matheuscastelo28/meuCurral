# Meu Curral Digital — versão sem banco de dados

Trazer o app enviado no ZIP para este projeto, removendo toda a dependência de backend/banco. Tudo funciona localmente no navegador, e o banco pode ser ligado depois sem refazer as telas.

## O que será feito

1. **Importar o app** (todas as telas e componentes): Início, Rebanho, Leite, Engorda, Reprodução, Financeiro, Calendário, Configurações, Planos, Auth/Cadastro, Termos e Privacidade, além do AppShell e da identidade visual.
2. **Remover o banco**: apagar a pasta de migrações e a integração de backend, junto com o cliente administrativo, middleware de autenticação e as funções de servidor.
3. **Camada de dados local**: criar um armazenamento no navegador (localStorage) com a mesma "forma" das tabelas atuais (fazenda, animais, produção de leite, pesagens, reprodução, lançamentos financeiros, eventos do calendário, preferências, perfil). Cadastrar, editar e excluir continuam funcionando e os dados sobrevivem ao recarregar a página.
4. **Login simulado**: telas de login e cadastro mantidas, validando e guardando um usuário fictício no navegador. Sair (logout) limpa a sessão. As áreas internas continuam protegidas por essa sessão local.
5. **Ajustes de fluxo**: exportação de dados e a seção "Dados" das configurações passam a ler do armazenamento local; recursos de plano/upgrade seguem funcionando como hoje (sem cobrança real).
6. **Preparado para o banco**: todo o acesso a dados fica concentrado em um único módulo, para que ao ligar o banco depois seja só trocar essa camada.

## Detalhes técnicos

- Rotas: as telas internas ficam sob `src/routes/_authenticated/`, com o gate lendo a sessão local em vez de Supabase (`ssr: false`).
- Remover: `src/integrations/supabase/*`, `src/integrations/lovable`, `src/lib/conta.functions.ts`, `supabase/`, referências em `src/start.ts` e `src/routes/__root.tsx`.
- Novo `src/lib/local-db.ts` (repositório tipado + seed vazio) e `src/lib/local-auth.ts` (sessão fake). Hooks (`use-fazenda`, `use-preferencias`, `use-indices-*`) e telas passam a usar esses módulos via React Query, mantendo o padrão atual de queries/mutations.
- Sem variáveis de ambiente de backend; nenhum `createServerFn`.
- `head()` por rota com títulos e descrições próprios em português.

## Fora do escopo

- Nenhuma criação de banco, autenticação real ou pagamento nesta etapa.
