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
};

export default config;
