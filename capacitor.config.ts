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
    // O domínio sem "www" redireciona para "www.curralonline.com" (Vercel).
    // O Capacitor só mantém a navegação dentro do WebView quando a página
    // carregada é exatamente o host configurado aqui — se apontar para o
    // domínio que redireciona, o primeiro carregamento já cai fora do host
    // esperado e o Capacitor abre no navegador externo em vez de manter no
    // app. Por isso aponta direto para o host final, sem passar pelo redirect.
    url: "https://www.curralonline.com",
    cleartext: false,
    allowNavigation: ["curralonline.com", "www.curralonline.com"],
  },
};

export default config;
