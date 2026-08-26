# Tirar a marca Lovable do site

Sim, dá para tirar tudo o que é visível para o cliente. Algumas peças internas de infraestrutura (as que fazem login Google, banco e build funcionarem) continuam existindo por baixo, mas nada disso aparece para quem usa o site.

## O que sai da parte visível

- **Selo "Edit with Lovable"** no canto do site publicado: desligado nas configurações de publicação.
- **Favicon padrão**: substituído por um ícone próprio do Meu Curral Digital (marca verde com cabeça de boi), usado também como ícone de aba e atalho no celular.
- **README** reescrito para falar do Meu Curral Digital, sem menções nem links da Lovable.
- **Nome do projeto no package.json** ajustado para `meu-curral-digital`.
- **Botão de login com Google**: continua igual para o usuário, mas o texto/alt e qualquer rótulo interno deixam de citar a marca.

## O que fica (e por quê)

Estes arquivos são gerados e mantidos pela plataforma; renomeá-los quebra login, banco de dados e build:

- `src/integrations/lovable/index.ts` (login social)
- `src/integrations/supabase/*` (banco e autenticação)
- `@lovable.dev/vite-tanstack-config` em `vite.config.ts` e as dependências no `package.json`
- Relato de erros: `src/lib/lovable-error-reporting.ts` — este pode ser renomeado para `src/lib/relato-erros.ts` com a função `reportarErro`, já que é código do projeto e não gerado.

Nada disso é acessível ou visível para o cliente final: são nomes de pacote e de arquivo no código-fonte privado.

## Detalhes técnicos

1. `publish_settings--set_badge_visibility` = oculto.
2. Gerar `public/favicon.ico`/PNG novo e atualizar o `link rel="icon"` em `src/routes/__root.tsx` (adicionar apple-touch-icon).
3. Renomear `src/lib/lovable-error-reporting.ts` → `src/lib/relato-erros.ts`, exportar `reportarErro`, atualizar import em `src/routes/__root.tsx` (mantendo as chamadas aos hooks globais de telemetria, que são do runtime).
4. Reescrever `README.md`, ajustar `name` em `package.json`.
5. Revisar `src/routes/auth.tsx` e `src/routes/cadastro.tsx` para nenhum texto de marca aparecer na tela.
