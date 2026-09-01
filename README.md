# Meu Curral Digital

SaaS de gestão rural: controle de rebanho, manejo, produção de leite, reprodução, financeiro e calendário da fazenda.

**App online**: https://agro-simplifica.lovable.app

## Módulos

- Início: visão geral do rebanho, alertas e produção do dia
- Rebanho: cadastro, busca, filtros e ficha do animal
- Leite: lançamento diário por turno e histórico
- Reprodução: cobertura, prenhez e previsão de parto
- Financeiro: receitas, despesas e lucro do mês
- Calendário: marcações geradas automaticamente pelos registros
- Configurações e Planos

## Tecnologia

TanStack Start (React 19 + Vite), Tailwind CSS v4, banco de dados PostgreSQL com RLS por fazenda e autenticação por e-mail/senha e Google.

Cadastro exige confirmação de e-mail por código de 6 dígitos (expira em 10 min,
máximo 5 tentativas, reenvio com cooldown de 60s). O envio é feito via Resend —
veja `.env.example` para as variáveis necessárias. Sem `RESEND_API_KEY`
configurada, o código aparece apenas no log do servidor em desenvolvimento.

## Desenvolvimento local

```sh
cp .env.example .env   # preencha DATABASE_URL (e RESEND_API_KEY se for testar e-mail de verdade)
npm i
npm run dev
```
