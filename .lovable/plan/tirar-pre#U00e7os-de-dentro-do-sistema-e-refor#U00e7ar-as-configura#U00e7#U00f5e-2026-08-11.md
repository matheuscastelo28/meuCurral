# Tirar preços de dentro do sistema e reforçar as Configurações

Os valores em reais saem de todas as telas internas do app. A página inicial pública continua com a tabela de planos. O limite de 10 cabeças do plano Grátis continua valendo, só que a mensagem passa a falar de espaço, não de preço.

## Preços fora do sistema

- Remover a aba **Planos** de dentro do app (rota e link no menu). Quem entrar pela URL antiga é levado para Configurações.
- O modal que aparece ao tentar cadastrar o 11º animal deixa de listar valores: passa a explicar que o espaço do plano acabou, mostra quantas cabeças estão em uso e oferece "Falar com a gente" (abre e-mail) e "Continuar assim".
- A barra "8 de 10 cabeças usadas" continua, sem o link "Ver planos".
- O bloco de recurso bloqueado e o cartão de plano em Configurações passam a mostrar só nome do plano, limite de cabeças e recursos liberados — nunca R$.
- A tabela de preços da página inicial e do cadastro fica como está.

## Configurações reconstruída

A tela vira uma página com seções claras, cada uma com seus campos e botão de salvar:

1. **Fazenda** — nome, cidade, estado; editável por quem é dono ou gerente.
2. **Meu perfil** — nome de exibição, objetivo (produtor / consultor) e e-mail de acesso (só leitura).
3. **Segurança** — trocar senha (nova senha com indicador de força e confirmação) e "Sair de todos os aparelhos".
4. **Preferências** — unidade de peso (kg / arroba), moeda, primeiro dia da semana no calendário e quais alertas quer ver (vacina, pesagem, previsão de parto). Aplicadas de verdade nas telas de Rebanho, Financeiro, Calendário e Início.
5. **Plano e uso** — plano atual, cabeças usadas, barra de uso e recursos incluídos, sem preços.
6. **Dados da conta** — exportar tudo em planilha (CSV por módulo, num .zip), apagar todos os registros da fazenda e excluir a conta; as duas últimas com confirmação digitando o nome da fazenda.
7. **Sobre e privacidade** — links para termos e política, versão do app e botão sair.

No celular as seções viram uma lista com âncoras no topo para navegar rápido.

## Outras melhorias que valem a pena

- Feedback real em cada ação: botão com spinner, mensagem de sucesso e erro em linguagem simples.
- Estados vazios e de carregamento consistentes (esqueleto em vez de tela em branco) nas listas.
- Confirmação antes de qualquer ação destrutiva.

## Detalhes técnicos

- Novas colunas em `perfis` para preferências (unidade de peso, moeda, início da semana, alertas ligados) com valores padrão; nada de preferência só no navegador.
- Update de fazenda e perfil pelo cliente Supabase, respeitando as políticas já existentes (`e_gestor` para fazenda, `id = auth.uid()` para perfil).
- Troca de senha via `supabase.auth.updateUser`; sair de todos os aparelhos via `signOut({ scope: 'global' })`.
- Exportar dados e excluir conta por `createServerFn` com `requireSupabaseAuth`; a exclusão usa o cliente administrativo dentro do handler, depois de conferir que o usuário é dono da fazenda.
- Remover `src/routes/_authenticated/planos.tsx`, tirar `preco`/`periodo` do uso interno em `src/lib/planos.ts` (a landing continua lendo esses campos) e simplificar `UpgradeDialog` e `RecursoBloqueado`.
- Configurações quebrada em componentes por seção, em vez de um arquivo único.
