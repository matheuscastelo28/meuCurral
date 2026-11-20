/**
 * Registros de acesso (Marco Civil da Internet, art. 15): data e hora, IP e
 * evento de cada acesso, guardados em sigilo por 6 meses e eliminados depois.
 * Ficam mesmo após a exclusão da conta (por isso não há chave estrangeira),
 * porque a guarda é obrigação legal; só são fornecidos por ordem judicial.
 */
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import type { Sql } from "./pg.server";

export type EventoAcesso =
  | "cadastro"
  | "login"
  | "uso"
  | "logout"
  | "logout_todos"
  | "troca_senha"
  | "troca_email"
  | "exclusao_conta";

function origem(): { ip: string | null; navegador: string | null } {
  try {
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const navegador = getRequestHeader("user-agent")?.slice(0, 300) ?? null;
    return { ip, navegador };
  } catch {
    return { ip: null, navegador: null };
  }
}

/** Grava um acesso. Nunca derruba a ação do usuário se falhar. */
export async function registrarAcesso(
  sql: Sql,
  dados: { userId: string; email?: string | null; evento: EventoAcesso },
): Promise<void> {
  const { ip, navegador } = origem();
  try {
    if (dados.evento === "uso") {
      // Uso contínuo com a mesma sessão: no máximo um registro por hora e por IP.
      await sql`
        insert into registros_acesso (user_id, email, evento, ip, navegador)
        select ${dados.userId}, ${dados.email ?? null}, 'uso', ${ip}, ${navegador}
        where not exists (
          select 1 from registros_acesso
          where user_id = ${dados.userId} and coalesce(ip, '') = ${ip ?? ""}
            and created_at > now() - interval '1 hour')`;
      return;
    }
    await sql`
      insert into registros_acesso (user_id, email, evento, ip, navegador)
      values (${dados.userId}, ${dados.email ?? null}, ${dados.evento}, ${ip}, ${navegador})`;
  } catch (erro) {
    console.error("Falha ao gravar registro de acesso", erro);
  }
}

/** Elimina o que passou dos 6 meses (rodado pela tarefa diária). */
export async function eliminarRegistrosVencidos(sql: Sql): Promise<number> {
  const linhas = await sql`
    delete from registros_acesso where created_at < now() - interval '6 months' returning id`;
  return linhas.length;
}
