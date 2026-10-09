# Easy Agro

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

## Aplicativo Android (APK)

O projeto já vem configurado com [Capacitor](https://capacitorjs.com/), que empacota
o site de produção (`curralonline.com`, ver `capacitor.config.ts`) dentro de uma
WebView nativa — o app abre em tela cheia, com ícone e splash screen próprios,
sem precisar reescrever nada em React Native.

Pré-requisitos na sua máquina (não dá pra gerar o APK num ambiente sem
Android SDK, como um container remoto):

- [Android Studio](https://developer.android.com/studio) instalado (ele baixa o
  Android SDK sozinho no primeiro uso).

Passos:

```sh
npm run cap:android   # builda o site, sincroniza e abre o projeto no Android Studio
```

Dentro do Android Studio: `Build → Build Bundle(s) / APK(s) → Build APK(s)` gera um
APK de teste (não assinado). Para publicar na Play Store, é preciso gerar um AAB
assinado com uma keystore própria (`Build → Generate Signed Bundle / APK`).

Sempre que o site em produção mudar, não é necessário gerar um APK novo — o app
carrega a versão mais recente do site automaticamente (é uma WebView apontando
para `www.curralonline.com`).

## Aplicativo iOS (IPA)

Mesma ideia do Android: o app abre `www.curralonline.com` dentro de uma WebView
nativa. Diferente do Android, a Apple só permite compilar apps iOS num **Mac com
Xcode** — não tem como gerar o IPA em Windows/Linux nem em um ambiente sem Mac
por trás.

Pré-requisitos:

- Um Mac com [Xcode](https://apps.apple.com/br/app/xcode/id497799835) instalado.
- Uma conta Apple (grátis) para testar no seu próprio iPhone via Xcode — expira
  a cada 7 dias e precisa reinstalar. Para distribuir de verdade (TestFlight ou
  App Store), é necessário o [Apple Developer Program](https://developer.apple.com/programs/)
  (US$ 99/ano).

Passos:

```sh
npm run cap:ios   # builda o site, sincroniza e abre o projeto no Xcode
```

Na primeira vez, dentro da pasta `ios/App`, pode ser necessário instalar as
dependências do CocoaPods:

```sh
cd ios/App && pod install && cd ../..
```

Dentro do Xcode: selecione um simulador ou o seu iPhone conectado no topo da
janela e clique no botão de **▶ (Run)** para instalar e abrir o app. Para gerar
um build para TestFlight/App Store, use `Product → Archive`.
