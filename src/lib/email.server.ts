/**
 * Envio de e-mails transacionais via Resend (https://resend.com).
 *
 * Configure no ambiente:
 *   RESEND_API_KEY — chave da API do Resend
 *   EMAIL_FROM     — remetente, ex: "Curral Online <nao-responda@seudominio.com.br>"
 *
 * Sem RESEND_API_KEY configurada em desenvolvimento, o código de verificação
 * é apenas escrito no log do servidor (nunca enviado ao navegador), para dar
 * pra testar o fluxo sem depender de um provedor de e-mail. Em produção, a
 * ausência da chave é um erro — nada de deixar contas travadas sem e-mail.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function chaveEmail(): string | null {
  return process.env["RESEND_API_KEY"] ?? null;
}

function remetenteEmail(): string {
  return process.env["EMAIL_FROM"] ?? "Curral Online <onboarding@resend.dev>";
}

async function enviarEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const chave = chaveEmail();
  if (!chave) {
    throw new Error("E-mail não configurado. Defina RESEND_API_KEY e EMAIL_FROM no ambiente.");
  }
  const resposta = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({ from: remetenteEmail(), to: [to], subject, html }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail (status ${resposta.status}): ${corpo.slice(0, 300)}`);
  }
}

function primeiroNome(nome: string | null): string {
  if (!nome) return "";
  return nome.trim().split(/\s+/)[0] ?? "";
}

function emailVerificacaoHtml({ nome, codigo }: { nome: string | null; codigo: string }): string {
  const saudacao = primeiroNome(nome) ? `Oi, ${primeiroNome(nome)}!` : "Oi!";
  const digitos = codigo.split("").join(" ");
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Confirme seu e-mail</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f3ec;padding:32px 16px;">
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="max-width:480px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e6e4da;"
          >
            <tr>
              <td style="background-color:#1f6b45;padding:26px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td
                      style="width:32px;height:32px;background-color:rgba(255,255,255,0.18);border-radius:9px;text-align:center;vertical-align:middle;font-size:16px;line-height:32px;"
                    >
                      🌱
                    </td>
                    <td style="padding-left:10px;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:-0.01em;">
                      Curral Online
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#16241b;">${saudacao}</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#57635b;">
                  Use o código abaixo para confirmar seu e-mail e liberar o acesso à sua fazenda. Ele
                  vale por <strong>10 minutos</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <table
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  style="background-color:#eef4ef;border:1px solid #cfe3d6;border-radius:14px;"
                >
                  <tr>
                    <td style="padding:22px 12px;text-align:center;">
                      <span
                        style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#16241b;"
                        >${digitos}</span
                      >
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 4px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#7c887f;">
                  Não foi você quem pediu esse código? Pode ignorar este e-mail — sua conta continua
                  segura e ninguém entra sem confirmar o e-mail primeiro.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <hr style="border:none;border-top:1px solid #ece9df;margin:0 0 20px;" />
                <p style="margin:0;font-size:12px;color:#a3ac9f;">
                  Curral Online — gestão de rebanho, manejo e produção da sua fazenda.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;font-size:11px;color:#a3ac9f;">
            Este é um e-mail automático, não é possível responder.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Manda o código de verificação por e-mail. Sem RESEND_API_KEY em
 * desenvolvimento, apenas registra no log do servidor (nunca no navegador) —
 * dá pra testar o fluxo inteiro sem provedor de e-mail configurado.
 */
export async function enviarCodigoPorEmail({
  to,
  nome,
  codigo,
}: {
  to: string;
  nome: string | null;
  codigo: string;
}): Promise<void> {
  if (!chaveEmail()) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("E-mail não configurado. Defina RESEND_API_KEY e EMAIL_FROM no ambiente.");
    }
    console.warn(`[dev] RESEND_API_KEY não configurada. Código para ${to}: ${codigo}`);
    return;
  }
  await enviarEmail({
    to,
    subject: `${codigo} é o seu código de confirmação`,
    html: emailVerificacaoHtml({ nome, codigo }),
  });
}

function escapar(t: string) {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Convite para acessar a fazenda de outra pessoa (veterinário ou
 * colaborador). Sem RESEND_API_KEY em desenvolvimento, só registra no log.
 * Devolve se o e-mail saiu — o link também aparece na tela pra quem convidou.
 */
export async function enviarConviteEmail({
  to,
  fazenda,
  papel,
  quem,
  link,
}: {
  to: string;
  fazenda: string;
  papel: string;
  quem: string | null;
  link: string;
}): Promise<boolean> {
  if (!chaveEmail()) {
    console.warn(`[dev] RESEND_API_KEY não configurada. Convite para ${to}: ${link}`);
    return false;
  }
  const rotulo = papel === "veterinario" ? "veterinário(a)" : "colaborador(a)";
  const autor = quem ? `${escapar(quem)} convidou você` : "Você foi convidado(a)";
  try {
    await enviarEmail({
      to,
      subject: `Convite para acessar a fazenda ${fazenda} no Curral Online`,
      html: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;border:1px solid #e6e4da;">
<tr><td style="background:#1f6b45;padding:20px 28px;color:#fff;font-weight:800;border-radius:16px 16px 0 0;">Curral Online</td></tr>
<tr><td style="padding:28px;color:#16241b;font-size:14px;line-height:1.6;">
<p style="margin:0 0 12px;font-size:18px;font-weight:800;">${autor} para a fazenda ${escapar(fazenda)}</p>
<p style="margin:0 0 20px;color:#57635b;">Você vai acessar como <strong>${rotulo}</strong>, com o rebanho, o manejo e a reprodução dessa fazenda no seu login. Se ainda não tem conta, crie uma com este mesmo e-mail.</p>
<p style="margin:0 0 20px;"><a href="${escapar(link)}" style="display:inline-block;background:#1f6b45;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;">Aceitar convite</a></p>
<p style="margin:0;color:#8a948d;font-size:12px;">Se não esperava este convite, ignore este e-mail.</p>
</td></tr></table></td></tr></table></body></html>`,
    });
    return true;
  } catch (e) {
    console.error("Falha ao enviar convite", e);
    return false;
  }
}
