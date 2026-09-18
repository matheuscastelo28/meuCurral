import type { CapacitorConfig } from "@capacitor/cli";

/**
 * O app roda como um "shell" nativo que abre o site de produção
 * (curralonline.com) dentro de uma WebView — o Curral Online é um app
 * TanStack Start com backend próprio (Postgres, sessões, envio de e-mail),
 * não dá pra rodar como um bundle 100% estático dentro do app.
 */
const config: CapacitorConfig = {
  appId: "com.curralonline.app",
  appName: "Curral Online",
  webDir: ".output/public",
  server: {
    url: "https://curralonline.com",
    cleartext: false,
  },
  android: {
    // O WebView do Android manda "; wv" no User-Agent, o que identifica o
    // tráfego como vindo de dentro de um app (não um navegador comum).
    // Alguns sistemas de proteção contra bots tratam isso com mais
    // suspeita e podem servir uma página em branco silenciosamente. Removendo
    // o marcador "wv", o app fica indistinguível de um navegador Chrome comum.
    overrideUserAgent:
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  },
};

export default config;
