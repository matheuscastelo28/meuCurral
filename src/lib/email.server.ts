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
 * Devolve se o e-mail saiu e, se não, o motivo em português — o link também
 * aparece na tela pra quem convidou, então a falha nunca trava o convite.
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
}): Promise<{ enviado: boolean; erro: string | null }> {
  if (!chaveEmail()) {
    console.warn(`[dev] RESEND_API_KEY não configurada. Convite para ${to}: ${link}`);
    return { enviado: false, erro: "O envio de e-mail não está configurado neste ambiente." };
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
<p style="margin:0 0 8px;color:#8a948d;font-size:12px;">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;">${escapar(link)}</span></p>
<p style="margin:0;color:#8a948d;font-size:12px;">Se não esperava este convite, ignore este e-mail.</p>
</td></tr></table></td></tr></table></body></html>`,
    });
    return { enviado: true, erro: null };
  } catch (e) {
    console.error("Falha ao enviar convite", e);
    const msg = e instanceof Error ? e.message : "";
    // Resend sem domínio verificado só entrega para o dono da conta de e-mail.
    const semDominio =
      /only send testing emails to your own|verify a domain|domain is not verified/i.test(msg);
    return {
      enviado: false,
      erro: semDominio
        ? "O serviço de e-mail ainda não está liberado para enviar a outras pessoas (falta verificar o domínio de envio)."
        : "O e-mail não saiu agora.",
    };
  }
}

export interface ItemAviso {
  titulo: string;
  detalhe: string;
  tipo: string;
}

/**
 * E-mail diário com o que vence amanhã. Sem RESEND_API_KEY em desenvolvimento
 * só registra no log. Devolve se saiu.
 */
export async function enviarAvisoDiarioEmail({
  to,
  nome,
  dataAmanha,
  fazendas,
  link,
}: {
  to: string;
  nome: string | null;
  dataAmanha: string;
  fazendas: { nome: string; itens: ItemAviso[] }[];
  link: string;
}): Promise<{ enviado: boolean; erro: string | null; assunto: string }> {
  const total = fazendas.reduce((s, f) => s + f.itens.length, 0);
  const assunto = `Amanhã: ${total} ${total === 1 ? "compromisso" : "compromissos"} no Curral Online`;
  if (!chaveEmail()) {
    console.warn(`[dev] RESEND_API_KEY não configurada. Aviso diário para ${to}: ${assunto}`);
    return { enviado: false, erro: "e-mail não configurado", assunto };
  }
  const [a, m, d] = dataAmanha.split("-");
  const saudacao = primeiroNome(nome) ? `Bom dia, ${escapar(primeiroNome(nome))}!` : "Bom dia!";
  const blocos = fazendas
    .map(
      (
        f,
      ) => `<p style="margin:18px 0 6px;font-size:13px;font-weight:800;color:#1f6b45;">${escapar(f.nome)}</p>
<ul style="margin:0;padding:0 0 0 18px;color:#16241b;font-size:14px;line-height:1.55;">${f.itens
        .map(
          (i) =>
            `<li style="margin:0 0 6px;"><strong>${escapar(i.titulo)}</strong><br><span style="color:#57635b;font-size:13px;">${escapar(i.detalhe)}</span></li>`,
        )
        .join("")}</ul>`,
    )
    .join("");
  try {
    await enviarEmail({
      to,
      subject: assunto,
      html: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;border:1px solid #e6e4da;">
<tr><td style="background:#1f6b45;padding:20px 28px;color:#fff;font-weight:800;border-radius:16px 16px 0 0;">Curral Online</td></tr>
<tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#16241b;">
<p style="margin:0 0 4px;font-size:18px;font-weight:800;">${saudacao}</p>
<p style="margin:0;color:#57635b;">O que vence amanhã, ${d}/${m}/${a}:</p>
${blocos}
<p style="margin:24px 0 0;"><a href="${escapar(link)}" style="display:inline-block;background:#1f6b45;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;">Abrir o Curral Online</a></p>
<p style="margin:20px 0 0;color:#8a948d;font-size:12px;">Você recebe este aviso todo dia às 6h quando há algo para o dia seguinte. Para parar, desligue em Configurações → Preferências.</p>
</td></tr></table></td></tr></table></body></html>`,
    });
    return { enviado: true, erro: null, assunto };
  } catch (e) {
    console.error("Falha ao enviar aviso diário", e);
    return { enviado: false, erro: "e-mail não saiu", assunto };
  }
}

export interface AvisoOficialEmail {
  titulo: string;
  texto: string;
  link: string | null;
  estados: string[];
}

/**
 * Manda um aviso oficial para várias pessoas de uma vez (envio em lote do
 * Resend, até 100 por chamada). Devolve os endereços que o Resend aceitou.
 */
export async function enviarAvisoOficialEmLote(
  aviso: AvisoOficialEmail,
  destinos: { email: string; nome: string | null }[],
  linkSistema: string,
): Promise<string[]> {
  if (destinos.length === 0) return [];
  const chave = chaveEmail();
  if (!chave) {
    console.warn(
      `[dev] RESEND_API_KEY não configurada. Aviso oficial "${aviso.titulo}" para ${destinos.length} pessoa(s)`,
    );
    return [];
  }
  const para = aviso.estados.length > 0 ? aviso.estados.join(", ") : "todos os estados";
  const html = (
    nome: string | null,
  ) => `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;border:1px solid #e6e4da;">
<tr><td style="background:#1f6b45;padding:20px 28px;color:#fff;font-weight:800;border-radius:16px 16px 0 0;">Curral Online</td></tr>
<tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#16241b;">
<p style="margin:0 0 4px;color:#8a948d;font-size:12px;">Aviso para produtores de: ${escapar(para)}</p>
<p style="margin:0 0 10px;font-size:18px;font-weight:800;">${escapar(aviso.titulo)}</p>
<p style="margin:0;white-space:pre-line;">${escapar(aviso.texto)}</p>
${aviso.link ? `<p style="margin:20px 0 0;"><a href="${escapar(aviso.link)}" style="display:inline-block;background:#1f6b45;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;">Saiba mais</a></p>` : ""}
<p style="margin:24px 0 0;color:#8a948d;font-size:12px;">${primeiroNome(nome) ? `${escapar(primeiroNome(nome))}, ` : ""}este aviso também aparece no início do <a href="${escapar(linkSistema)}" style="color:#1f6b45;">Curral Online</a>. É informativo; confirme sempre com o órgão responsável. Para não receber avisos por e-mail, desligue em Configurações → Preferências.</p>
</td></tr></table></td></tr></table></body></html>`;
  const aceitos: string[] = [];
  for (let i = 0; i < destinos.length; i += 100) {
    const parte = destinos.slice(i, i + 100);
    const resposta = await fetch(`${RESEND_ENDPOINT}/batch`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
      body: JSON.stringify(
        parte.map((d) => ({
          from: remetenteEmail(),
          to: [d.email],
          subject: `Aviso: ${aviso.titulo}`,
          html: html(d.nome),
        })),
      ),
    });
    if (resposta.ok) aceitos.push(...parte.map((d) => d.email));
    else console.error("Falha no lote de avisos", resposta.status);
  }
  return aceitos;
}
