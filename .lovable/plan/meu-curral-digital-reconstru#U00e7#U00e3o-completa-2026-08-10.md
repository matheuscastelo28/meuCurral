# Meu Curral Digital — reconstrução completa

Reconstrução do SaaS de gestão de rebanho com todos os módulos do vídeo (Início, Rebanho, Leite, Reprodução, Financeiro, Calendário, Config), visual claro como nas imagens enviadas, cadastro guiado e calendário alimentado pelo que o produtor registra.

## Identidade visual

- Tema **claro em todo o app** (landing e sistema): fundo `#FCFBF8` / branco, cards brancos com borda suave, texto verde-escuro quase preto.
- Verde de ação `#186B3A` (contraste AA), verde-petróleo escuro só na faixa hero da landing (gradiente sutil, sem xadrez).
- Alerta `#B42318`, sucesso `#0F7B4F`, aviso âmbar para pendências.
- Tipografia: títulos peso 700–800; corpo neutro legível. Cantos 8–12px, sombras leves.
- Ícones: Lucide, estilo único (outline) em 100% da interface. Sem ilustrações de IA, sem mascotes.
- Mobile-first: botões grandes, formulários verticais, navegação inferior no celular e barra de abas no desktop.

## Backend e segurança

Ativar Lovable Cloud (banco, auth, storage).

- Auth por e-mail/senha + Google, confirmação de e-mail, recuperação de senha.
- Senha mínima 8 caracteres com indicador de força; proteção contra senhas vazadas.
- Multi-tenant: tabela `fazendas`, `fazenda_membros` (papéis dono/gerente/peão) e `fazenda_id` em todos os registros; RLS em todas as tabelas via função `security definer` (sem recursão).
- Termos de uso e política de privacidade acessíveis no cadastro (LGPD), páginas próprias.
- Exportar dados e excluir conta em Configurações.

Tabelas: `fazendas`, `fazenda_membros`, `perfis`, `animais`, `manejos` (vacina, pesagem, tratamento), `producao_leite`, `reproducao` (cobertura, prenhez, parto), `financeiro_lancamentos`, `eventos_agenda`, `assinaturas`.

## Telas

1. **Landing (/)** — fundo claro, hero com título forte, dois CTAs, grade de 4 diferenciais, tabela de planos, rodapé com termos/privacidade. (A landing pode mostrar preços; as telas de entrada do app, não.)
2. **Cadastro guiado (4 passos, com barra de progresso)** — objetivo (rebanho próprio / consultor) → nome e local da fazenda → e-mail e senha forte → resumo com plano Grátis pré-selecionado. Botão sempre com estado real: spinner, timeout e mensagem clara de erro. Ao concluir, entra autenticado direto no Dashboard, sem login manual.
3. **Login** — e-mail/senha, "esqueci minha senha", Google. Erros humanos e sem vazar existência de conta.
4. **Início (Dashboard)** — total de cabeças, distribuição por categoria com ícones, alertas pendentes, produção do dia, barra "8 de 10 cabeças usadas — Grátis". Sem preços aqui.
5. **Rebanho** — busca, filtros (categoria, status sanitário, lote), cadastro individual e importação por planilha, ficha do animal com peso, histórico de manejo e vacinas.
6. **Leite** — lançamento diário por animal/lote, média e histórico.
7. **Reprodução** — cobertura, diagnóstico de prenhez, previsão de parto; empty state desenhado.
8. **Financeiro** — receitas, despesas, lucro do mês, últimos lançamentos, relatório simples.
9. **Calendário** — visão mensal com marcações geradas automaticamente pelo que o produtor registra (vacina agendada, pesagem, previsão de parto, secagem, lançamento financeiro), cores por tipo, clique no dia abre a lista de eventos e permite criar evento manual.
10. **Configurações** — dados da fazenda e do usuário, colaboradores (conforme plano), preferências, "Meu Plano" com preços, exportar dados, apagar tudo, sair.
11. **Planos** — comparativo em tabela, cancelamento sem multa.

## Freemium

- Limites por plano aplicados no banco e na interface: Grátis 10 cabeças / 1 usuário; Essencial 100; Profissional 500; Fazenda Grande ilimitado.
- Cada módulo respeita o plano: relatórios e exportação a partir do Essencial, múltiplos usuários a partir do Profissional, API/onboarding no Fazenda Grande — sempre com bloqueio suave explicando o motivo.
- Ao tentar cadastrar o 11º animal: modal de bloqueio suave mostrando os planos e preços só nesse momento.
- **Sem checkout real nesta entrega** — o botão de upgrade registra a intenção e mostra "em breve"; a integração de pagamento fica para depois.

## Qualidade percebida

Transições de 200–300ms, empty states com ícone e ação, mensagens de erro humanas, labels em todos os campos, navegação por teclado e contraste AA.

## Detalhes técnicos

- TanStack Start + Tailwind v4; tokens de cor em `src/styles.css` (oklch), nada de cor fixa em componente.
- Rotas do app sob `_authenticated/`; landing, login, cadastro, termos e privacidade públicas.
- Leituras e escritas por `createServerFn` com `requireSupabaseAuth`; RLS por `fazenda_id`.
- Eventos do calendário derivados por triggers/inserções nos módulos, materializados em `eventos_agenda`.
- Ordem de execução: Cloud + schema/RLS → auth e onboarding → shell do app e Dashboard → Rebanho → Calendário → Leite/Reprodução/Financeiro → Configurações e planos.
