import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { usePerfil } from "@/hooks/use-preferencias";
import { rotuloCategoria } from "@/lib/rotulos";

/**
 * Uma vez por sessão (por fazenda), avança a categoria dos animais pela
 * idade — bezerro → novilha → vaca, cordeiro → borrega → ovelha etc. (ver
 * lib/estagios). Desligável em Config → Preferências.
 */
export function useEstagiosAutomaticos(fazendaId: string | undefined) {
  const { data: perfil } = usePerfil();
  const queryClient = useQueryClient();
  const ligado = perfil ? (perfil.estagio_automatico ?? true) : null;

  useEffect(() => {
    if (!fazendaId || !ligado) return;
    const chave = `mcd:estagios:${fazendaId}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    } catch {
      // Sem sessionStorage: roda mesmo assim (a função é idempotente).
    }
    void db.rebanho.atualizarEstagios({ fazendaId }).then(({ data }) => {
      const alterados = data?.alterados ?? [];
      if (alterados.length === 0) return;
      for (const k of ["animais", "animais-simples", "animais-contagem", "animal-ficha"]) {
        queryClient.invalidateQueries({ queryKey: [k] });
      }
      const ex = alterados[0]!;
      toast.message(
        alterados.length === 1
          ? `${ex.nome ?? "Um animal"} passou de ${rotuloCategoria(ex.de)} para ${rotuloCategoria(ex.para)} pela idade.`
          : `${alterados.length} animais mudaram de categoria pela idade (ex.: ${ex.nome ?? "animal"}, ${rotuloCategoria(ex.de)} → ${rotuloCategoria(ex.para)}).`,
      );
    });
  }, [fazendaId, ligado, queryClient]);
}
