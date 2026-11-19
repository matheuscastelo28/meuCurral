/**
 * Notificações push (Web Push) para o celular/navegador. O par de chaves VAPID
 * nasce na primeira vez que é preciso e fica na tabela config_servidor, então
 * não depende de variável de ambiente.
 */
import * as webpushNs from "web-push";
import type { Sql } from "./pg.server";

// CommonJS: conforme o empacotador, as funções vêm em `default` ou no próprio módulo.
const webpush: typeof webpushNs =
  (webpushNs as unknown as { default?: typeof webpushNs }).default ?? webpushNs;

const ASSUNTO = "mailto:contato@curralonline.com";

export async function chavesVapid(sql: Sql): Promise<{ publica: string; privada: string }> {
  const ler = async () => {
    const linhas: { chave: string; valor: string }[] = await sql`
      select chave, valor from config_servidor where chave in ('vapid_publica', 'vapid_privada')`;
    const publica = linhas.find((l) => l.chave === "vapid_publica")?.valor;
    const privada = linhas.find((l) => l.chave === "vapid_privada")?.valor;
    return publica && privada ? { publica, privada } : null;
  };
  const existentes = await ler();
  if (existentes) return existentes;
  const novas = webpush.generateVAPIDKeys();
  // Duas requisições juntas: a primeira a gravar vence, a outra lê a mesma.
  await sql`
    insert into config_servidor (chave, valor) values
      ('vapid_publica', ${novas.publicKey}), ('vapid_privada', ${novas.privateKey})
    on conflict (chave) do nothing`;
  return (await ler())!;
}

export type PayloadPush = { titulo: string; corpo: string; url: string };

/** Manda a notificação para todos os aparelhos da pessoa. Devolve quantos receberam. */
export async function enviarPush(sql: Sql, userId: string, payload: PayloadPush): Promise<number> {
  const aparelhos: { id: string; endpoint: string; p256dh: string; auth: string }[] = await sql`
    select id, endpoint, p256dh, auth from push_assinaturas where user_id = ${userId}`;
  if (aparelhos.length === 0) return 0;
  const { publica, privada } = await chavesVapid(sql);
  let entregues = 0;
  for (const a of aparelhos) {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: { subject: ASSUNTO, publicKey: publica, privateKey: privada },
          TTL: 60 * 60 * 12,
        },
      );
      entregues++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // Aparelho que desinstalou ou revogou a permissão: tira da lista.
      if (status === 404 || status === 410) {
        await sql`delete from push_assinaturas where id = ${a.id}`;
      } else {
        console.error("Falha no push", status ?? "", e instanceof Error ? e.message : e);
      }
    }
  }
  return entregues;
}

export { webpush };
