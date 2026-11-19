import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Info, Syringe } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFazenda } from "@/hooks/use-fazenda";
import { especieDoAnimal } from "@/lib/especies";
import { dataCurta, hojeISO } from "@/lib/formato";
import { acharRegra, normalizar, textoIntervalo } from "@/lib/sanidade";
import { useValidacoesProtocolos } from "@/hooks/use-validacoes-protocolos";
import { useRegrasSanitarias } from "@/hooks/use-regras-sanitarias";
import {
  situacaoDaValidacao,
  textoValidacao,
  sugerirVacinas,
  tituloDaDose,
  type SugestaoVacina,
} from "@/lib/protocolos-sanitarios";

export interface AnimalSugestao {
  id: string;
  nome: string | null;
  brinco?: string | null;
  categoria: string | null;
  especie?: string | null;
  sexo: string | null;
  status: string | null;
  nascimento?: string | Date | null;
}

type Situacao = "nova" | "agendada" | "aplicada";

/**
 * Sugestão de vacinas do animal pela espécie, categoria, idade e estado
 * (tabela em lib/protocolos-sanitarios). Cada sugestão vira lembrete na
 * Agenda com um toque. É sugestão técnica, não receita: o texto avisa para
 * confirmar com o veterinário.
 */
export function SugestoesVacina({
  animal,
  aberto,
  onFechar,
}: {
  animal: AnimalSugestao | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { data: fazenda } = useFazenda();
  const regras = useRegrasSanitarias();
  const revisoes = useValidacoesProtocolos();
  const queryClient = useQueryClient();
  const hoje = hojeISO();
  const [agendadasAgora, setAgendadasAgora] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (aberto) setAgendadasAgora(new Set());
  }, [aberto, animal?.id]);

  const sugestoes: SugestaoVacina[] = animal
    ? sugerirVacinas(
        {
          especie: especieDoAnimal(animal),
          sexo: animal.sexo,
          categoria: animal.categoria,
          status: animal.status,
          nascimento: animal.nascimento ?? null,
        },
        hoje,
      )
    : [];

  // O que já existe: lembrete pendente (do animal ou do rebanho todo) ou
  // vacina já aplicada nele — para não sugerir de novo.
  const existente = useQuery({
    queryKey: ["sugestoes-vacina-existente", animal?.id, aberto],
    enabled: !!animal && !!fazenda?.id && aberto,
    queryFn: async () => {
      const [eventos, manejos] = await Promise.all([
        db
          .from("eventos_agenda")
          .select("titulo, animal_id")
          .eq("fazenda_id", fazenda!.id)
          .eq("concluido", false)
          .eq("cancelado", false),
        db.from("manejos").select("descricao").eq("animal_id", animal!.id).eq("tipo", "vacina"),
      ]);
      return {
        eventos: (eventos.data ?? []).filter(
          (e) => !e.animal_id || String(e.animal_id) === animal!.id,
        ),
        aplicadas: (manejos.data ?? []).map((m) => normalizar(String(m.descricao ?? ""))),
      };
    },
  });

  function situacaoDe(s: SugestaoVacina): Situacao {
    const chave = normalizar(s.protocolo.vacina.replace(/\s*\(.*\)\s*$/, ""));
    if (agendadasAgora.has(s.protocolo.id)) return "agendada";
    const d = existente.data;
    if (!d) return "nova";
    if (d.aplicadas.some((a) => a.includes(chave))) return "aplicada";
    if (d.eventos.some((e) => normalizar(String(e.titulo ?? "")).includes(chave))) {
      return "agendada";
    }
    return "nova";
  }

  const agendar = useMutation({
    mutationFn: async (lista: SugestaoVacina[]) => {
      if (!animal || !fazenda) return 0;
      const nome = animal.nome || animal.brinco || "animal";
      const linhas = lista.flatMap((s) =>
        s.doses.map((dose) => ({
          fazenda_id: fazenda.id,
          animal_id: animal.id,
          tipo: "vacina",
          titulo: tituloDaDose(s.protocolo.vacina, nome, dose),
          descricao: `Sugestão pelo protocolo da espécie, categoria e idade. ${s.protocolo.nota} Confirme com o veterinário.`,
          data: dose.data,
          concluido: false,
          cancelado: false,
        })),
      );
      const { error } = await db.from("eventos_agenda").insert(linhas as never);
      if (error) throw new Error(error.message);
      return lista.length;
    },
    onSuccess: (n, lista) => {
      toast.success(`${n} ${n === 1 ? "vacina agendada" : "vacinas agendadas"} na Agenda.`);
      setAgendadasAgora((atual) => new Set([...atual, ...lista.map((s) => s.protocolo.id)]));
      for (const chave of [
        "eventos",
        "inicio-resumo",
        "notificacoes",
        "sugestoes-vacina-existente",
      ]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
    },
    onError: (e: Error) => toast.error(e.message || "Não conseguimos agendar agora."),
  });

  // Depois da última dose o sistema agenda a repetição pelo intervalo da vacina
  // (Configurações → regras sanitárias); aqui só avisa que isso vai acontecer.
  function repeticao(s: SugestaoVacina) {
    const regra = acharRegra(
      s.protocolo.vacina.replace(/\s*\(.*\)\s*$/, ""),
      "vacina",
      regras.data ?? [],
    );
    return regra ? `, depois a cada ${textoIntervalo(regra.intervalo_dias)}` : "";
  }

  const novas = sugestoes.filter((s) => situacaoDe(s) === "nova");
  const nome = animal?.nome || animal?.brinco || "animal";

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vacinas sugeridas para {nome}</DialogTitle>
          <DialogDescription>
            Sugestão pela espécie, categoria, idade e estado do animal. Não é receita nem
            prescrição: confirme produtos, doses e datas com o seu veterinário e com a exigência do
            seu estado.
          </DialogDescription>
        </DialogHeader>

        {sugestoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Não há vacina sugerida para este animal agora.
          </p>
        ) : (
          <ul className="space-y-2">
            {sugestoes.map((s) => {
              const situacao = situacaoDe(s);
              const primeira = s.doses[0]!;
              return (
                <li key={s.protocolo.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {s.protocolo.vacina}
                        {s.protocolo.obrigatoria ? (
                          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                            obrigatória
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {(s.doses.length > 1
                          ? `${s.doses.length} doses: ${s.doses.map((d) => dataCurta(d.data)).join(" e ")}`
                          : `Dose em ${dataCurta(primeira.data)}`) + repeticao(s)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.protocolo.nota}</p>
                      <p
                        className={`mt-1 text-xs ${situacaoDaValidacao(s.protocolo, revisoes.data?.validacoes ?? []).tipo === "validado" ? "font-medium text-primary" : "text-muted-foreground"}`}
                      >
                        {textoValidacao(
                          situacaoDaValidacao(s.protocolo, revisoes.data?.validacoes ?? []),
                        )}
                      </p>
                      {s.idadeNaoConferida ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                          <Info className="size-3.5" aria-hidden="true" />
                          Sem data de nascimento: a idade não foi conferida.
                        </p>
                      ) : null}
                    </div>
                    {situacao === "nova" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={agendar.isPending}
                        onClick={() => agendar.mutate([s])}
                      >
                        Agendar
                      </Button>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                        <Check className="size-3.5" aria-hidden="true" />
                        {situacao === "agendada" ? "Agendada" : "Já aplicada"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Rodapé fixo: com várias vacinas, "Agendar todas" fica à vista sem rolar. */}
        <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 gap-2 border-t border-border bg-background px-6 py-3">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Agora não
          </Button>
          {novas.length > 1 ? (
            <Button
              type="button"
              disabled={agendar.isPending}
              onClick={() => agendar.mutate(novas)}
            >
              <Syringe className="size-4" aria-hidden="true" />
              Agendar todas ({novas.length})
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
