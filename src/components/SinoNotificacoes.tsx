import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useNotificacoes } from "@/hooks/use-notificacoes";
import { cn } from "@/lib/utils";

/**
 * Sino que leva à página de notificações, com a contagem de não lidas.
 * Só um ícone (com selo), então cabe no topo do celular e na barra lateral.
 */
export function SinoNotificacoes({ className }: { className?: string }) {
  const { naoLidas } = useNotificacoes();
  return (
    <Link
      to={"/notificacoes" as never}
      aria-label={
        naoLidas > 0
          ? `Notificações: ${naoLidas} não ${naoLidas === 1 ? "lida" : "lidas"}`
          : "Notificações"
      }
      title="Notificações"
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transicao-suave hover:bg-accent hover:text-foreground",
        className,
      )}
      activeProps={{ className: "bg-accent text-primary" }}
    >
      <Bell className="size-4" aria-hidden="true" />
      {naoLidas > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-white"
        >
          {naoLidas > 9 ? "9+" : naoLidas}
        </span>
      ) : null}
    </Link>
  );
}
