import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { useFazenda, useLimitePlano } from "@/hooks/use-fazenda";
import { usePreferencias } from "@/hooks/use-preferencias";
import { diasAtrasISO, hojeISO } from "@/lib/formato";
import {
  DIAS_ANTECEDENCIA,
  montarNotificacoes,
  type DadosNotificacoes,
  type Notificacao,
} from "@/lib/notificacoes";
import type { RegistroRepro } from "@/lib/reproducao";

const EVENTO_LIDAS = "mcd:notif-lidas-mudou";

function chaveLidas(fazendaId: string) {
  return `mcd:notif-lidas:${fazendaId}`;
}

function lerLidas(fazendaId: string | undefined): Set<string> {
  if (!fazendaId) return new Set();
  try {
    const bruto = localStorage.getItem(chaveLidas(fazendaId));
    return new Set(bruto ? (JSON.parse(bruto) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Notificações da fazenda atual: calculadas das mesmas tabelas das telas
 * (uma consulta só, em cache), e o "lida" guardado neste aparelho.
 */
export function useNotificacoes() {
  const { data: fazenda } = useFazenda();
  const fazendaId = fazenda?.id;
  const prefs = usePreferencias();
  const { usados, limite, plano } = useLimitePlano();
  const [lidas, setLidas] = useState<Set<string>>(() => new Set());

  // O sino e a página de notificações são instâncias separadas deste hook:
  // um aviso ao marcar "lida" mantém os dois em dia.
  useEffect(() => {
    const ler = () => setLidas(lerLidas(fazendaId));
    ler();
    window.addEventListener(EVENTO_LIDAS, ler);
    return () => window.removeEventListener(EVENTO_LIDAS, ler);
  }, [fazendaId]);

  const brutos = useQuery({
    queryKey: ["notificacoes", fazendaId],
    enabled: !!fazendaId,
    staleTime: 60_000,
    queryFn: async () => {
      const id = fazendaId!;
      const hoje = hojeISO();
      const ate = new Date(`${hoje}T00:00:00Z`);
      ate.setUTCDate(ate.getUTCDate() + DIAS_ANTECEDENCIA);
      const limiteData = ate.toISOString().slice(0, 10);
      const [eventos, contas, parcelas, aReceber, animais, reproducao] = await Promise.all([
        db
          .from("eventos_agenda")
          .select("id, titulo, data, tipo")
          .eq("fazenda_id", id)
          .eq("concluido", false)
          .eq("cancelado", false)
          .lte("data", limiteData)
          .order("data")
          .limit(100),
        db.from("contas").select("id, tipo, descricao, status").eq("fazenda_id", id),
        db
          .from("parcelas")
          .select("id, conta_id, numero, total_parcelas, valor, vencimento, status")
          .eq("fazenda_id", id)
          .eq("status", "pendente")
          .lte("vencimento", limiteData)
          .limit(200),
        db
          .from("financeiro_lancamentos")
          .select("id, descricao, valor, data")
          .eq("fazenda_id", id)
          .eq("status", "a_receber")
          .limit(100),
        db
          .from("animais")
          .select("id, nome, brinco, categoria, especie, sexo, status, lote, created_at")
          .eq("fazenda_id", id),
        db
          .from("reproducao")
          .select("id, animal_id, tipo, data, resultado, previsao_parto, touro, created_at")
          .eq("fazenda_id", id)
          .gte("data", diasAtrasISO(900)),
      ]);
      const emEngorda = (animais.data ?? [])
        .filter((a) => a.status === "engorda")
        .map((a) => String(a.id));
      const ultimaPesagem: Record<string, string> = {};
      if (emEngorda.length > 0) {
        const pesagens = await db
          .from("manejos")
          .select("animal_id, data")
          .eq("fazenda_id", id)
          .eq("tipo", "pesagem")
          .in("animal_id", emEngorda);
        for (const p of pesagens.data ?? []) {
          const a = String(p.animal_id);
          const d = new Date(p.data as string).toISOString().slice(0, 10);
          if (!ultimaPesagem[a] || ultimaPesagem[a] < d) ultimaPesagem[a] = d;
        }
      }
      return {
        eventos: eventos.data ?? [],
        contas: contas.data ?? [],
        parcelas: parcelas.data ?? [],
        aReceber: aReceber.data ?? [],
        animais: animais.data ?? [],
        reproducao: (reproducao.data ?? []) as unknown as RegistroRepro[],
        ultimaPesagem,
      };
    },
  });

  const todas: Notificacao[] = useMemo(() => {
    if (!brutos.data) return [];
    return montarNotificacoes({
      hoje: hojeISO(),
      ...brutos.data,
      uso: { usados, limite, planoNome: plano.nome },
      prefs: {
        vacina: prefs.alerta_vacina,
        pesagem: prefs.alerta_pesagem,
        parto: prefs.alerta_parto,
      },
    } as unknown as DadosNotificacoes);
  }, [
    brutos.data,
    usados,
    limite,
    plano.nome,
    prefs.alerta_vacina,
    prefs.alerta_pesagem,
    prefs.alerta_parto,
  ]);

  const guardar = useCallback(
    (novas: Set<string>) => {
      setLidas(novas);
      if (!fazendaId) return;
      try {
        // Só guarda o que ainda existe, para a lista não crescer pra sempre.
        const vivas = [...novas].filter((i) => todas.some((n) => n.id === i));
        localStorage.setItem(chaveLidas(fazendaId), JSON.stringify(vivas));
        window.dispatchEvent(new Event(EVENTO_LIDAS));
      } catch {
        // sem armazenamento: vale só nesta visita
      }
    },
    [fazendaId, todas],
  );

  const marcarLida = useCallback((id: string) => guardar(new Set(lidas).add(id)), [guardar, lidas]);
  const marcarTodas = useCallback(
    (ids: string[]) => guardar(new Set([...lidas, ...ids])),
    [guardar, lidas],
  );

  const naoLidas = todas.filter((n) => !lidas.has(n.id)).length;
  return {
    notificacoes: todas,
    lidas,
    naoLidas,
    carregando: brutos.isLoading,
    marcarLida,
    marcarTodas,
    recarregar: brutos.refetch,
  };
}
