import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, dataISO, hojeISO } from "@/lib/formato";
import { especieDoAnimal, especiesDasAtividades, type Especie } from "@/lib/especies";

const ORIGEM = "Calendário sanitário";

type ModeloId = "brucelose" | "raiva" | "clostridioses" | "aftosa" | "vermifugacao";

interface Modelo {
  id: ModeloId;
  titulo: string;
  resumo: string;
  especies: Especie[];
  padrao: boolean;
  aviso?: string;
}

// Referência: PNCEBT (brucelose), recomendações do MAPA/Embrapa. Exigência
// varia por estado — a tela pede pra confirmar com o veterinário.
const MODELOS: Modelo[] = [
  {
    id: "brucelose",
    titulo: "Brucelose (B19 ou RB51)",
    resumo:
      "Obrigatória para fêmeas bovinas de 3 a 8 meses, dose única. Cria um lembrete por bezerra, na data em que ela completa 3 meses.",
    especies: ["bovino"],
    padrao: true,
  },
  {
    id: "raiva",
    titulo: "Raiva",
    resumo:
      "Obrigatória em áreas de risco (morcego hematófago). Reforço anual do rebanho a partir de 3 meses de idade.",
    especies: ["bovino", "ovino"],
    padrao: true,
  },
  {
    id: "clostridioses",
    titulo: "Clostridioses (carbúnculo, botulismo...)",
    resumo: "Recomendada. Reforço anual do rebanho.",
    especies: ["bovino", "ovino"],
    padrao: true,
  },
  {
    id: "aftosa",
    titulo: "Febre aftosa",
    resumo: "Campanhas em maio e novembro.",
    especies: ["bovino"],
    padrao: false,
    aviso:
      "O Brasil suspendeu a vacinação contra aftosa na maioria dos estados. Marque só se o seu estado ainda exigir.",
  },
  {
    id: "vermifugacao",
    titulo: "Vermifugação estratégica (5-7-9)",
    resumo: "Maio, julho e setembro, no período seco — esquema recomendado pela Embrapa.",
    especies: ["bovino", "ovino"],
    padrao: false,
  },
];

function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/** Próximas ocorrências (nos próximos 12 meses) do dia 10 dos meses dados. */
function proximosMeses(meses: number[], hoje: string): string[] {
  const ano = Number(hoje.slice(0, 4));
  const datas: string[] = [];
  for (const a of [ano, ano + 1]) {
    for (const m of meses) {
      const d = `${a}-${String(m).padStart(2, "0")}-10`;
      if (d >= hoje && d < somarMeses(hoje, 12)) datas.push(d);
    }
  }
  return datas.sort();
}

interface Compromisso {
  modelo: ModeloId;
  titulo: string;
  data: string;
  animalId: string | null;
  tipo: string;
}

export function DialogCalendarioSanitario({
  aberto,
  onFechar,
}: {
  aberto: boolean;
  onFechar: () => void;
}) {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const hoje = hojeISO();
  const especies = especiesDasAtividades(fazenda?.atividades);
  const modelosDaFazenda = MODELOS.filter((m) => m.especies.some((e) => especies.includes(e)));

  const [marcados, setMarcados] = useState<Record<ModeloId, boolean>>(
    () => Object.fromEntries(MODELOS.map((m) => [m.id, m.padrao])) as Record<ModeloId, boolean>,
  );
  const [dataRaiva, setDataRaiva] = useState(() => somarMeses(hoje, 1));
  const [dataClostridioses, setDataClostridioses] = useState(() => somarMeses(hoje, 1));

  useEffect(() => {
    if (!aberto) return;
    setMarcados(
      Object.fromEntries(MODELOS.map((m) => [m.id, m.padrao])) as Record<ModeloId, boolean>,
    );
    setDataRaiva(somarMeses(hoje, 1));
    setDataClostridioses(somarMeses(hoje, 1));
  }, [aberto, hoje]);

  const dados = useQuery({
    queryKey: ["calendario-sanitario", fazenda?.id],
    enabled: !!fazenda?.id && aberto,
    queryFn: async () => {
      const [animais, vacinas, eventos] = await Promise.all([
        db
          .from("animais")
          .select("id, nome, brinco, sexo, nascimento, categoria, especie, status")
          .eq("fazenda_id", fazenda!.id),
        db
          .from("manejos")
          .select("animal_id, descricao")
          .eq("fazenda_id", fazenda!.id)
          .eq("tipo", "vacina"),
        db.from("eventos_agenda").select("titulo, data, cancelado").eq("fazenda_id", fazenda!.id),
      ]);
      return {
        animais: (animais.data ?? []).filter((a) => a.status !== "vendido" && a.status !== "morto"),
        vacinas: vacinas.data ?? [],
        eventos: (eventos.data ?? []).filter((e) => !e.cancelado),
      };
    },
  });

  const { compromissos, semNascimento } = useMemo(() => {
    const lista: Compromisso[] = [];
    let semNasc = 0;
    if (!dados.data) return { compromissos: lista, semNascimento: 0 };
    const doRebanho = dados.data.animais.filter((a) => especies.includes(especieDoAnimal(a)));
    const alvoRebanho = (m: Modelo) => {
      const esp = m.especies.filter((e) => especies.includes(e));
      if (esp.length === 2 || especies.length === 1) return "rebanho";
      return esp[0] === "ovino" ? "ovinos" : "bovinos";
    };

    if (marcados.brucelose && especies.includes("bovino")) {
      const jaVacinadas = new Set(
        dados.data.vacinas
          .filter((v) => (v.descricao ?? "").toLowerCase().includes("brucel"))
          .map((v) => v.animal_id),
      );
      for (const a of doRebanho) {
        if (especieDoAnimal(a) !== "bovino" || a.sexo !== "femea" || jaVacinadas.has(a.id)) {
          continue;
        }
        if (!a.nascimento) {
          if (a.categoria === "bezerro" || a.categoria === "novilha") semNasc++;
          continue;
        }
        const nasc = dataISO(a.nascimento);
        const inicio = somarMeses(nasc, 3);
        const fim = somarMeses(nasc, 8);
        if (fim < hoje) continue;
        lista.push({
          modelo: "brucelose",
          titulo: `Vacina: Brucelose — ${a.nome}${a.brinco ? ` (${a.brinco})` : ""}`,
          data: inicio > hoje ? inicio : hoje,
          animalId: a.id,
          tipo: "vacina",
        });
      }
    }
    if (marcados.raiva) {
      lista.push({
        modelo: "raiva",
        titulo: `Vacina: Raiva — ${alvoRebanho(MODELOS[1]!)}`,
        data: dataRaiva,
        animalId: null,
        tipo: "vacina",
      });
    }
    if (marcados.clostridioses) {
      lista.push({
        modelo: "clostridioses",
        titulo: `Vacina: Clostridioses — ${alvoRebanho(MODELOS[2]!)}`,
        data: dataClostridioses,
        animalId: null,
        tipo: "vacina",
      });
    }
    if (marcados.aftosa && especies.includes("bovino")) {
      for (const d of proximosMeses([5, 11], hoje)) {
        lista.push({
          modelo: "aftosa",
          titulo: "Vacina: Febre aftosa — bovinos",
          data: d,
          animalId: null,
          tipo: "vacina",
        });
      }
    }
    if (marcados.vermifugacao) {
      for (const d of proximosMeses([5, 7, 9], hoje)) {
        lista.push({
          modelo: "vermifugacao",
          titulo: `Vermífugo: estratégico 5-7-9 — ${alvoRebanho(MODELOS[4]!)}`,
          data: d,
          animalId: null,
          tipo: "tratamento",
        });
      }
    }

    // Não duplica o que já está na Agenda (mesmo título no mesmo dia).
    // A brucelose é dose única por bezerra: basta já existir o lembrete
    // dela (em qualquer data) pra não criar outro.
    const existentes = new Set(dados.data.eventos.map((e) => `${e.titulo}|${dataISO(e.data)}`));
    const titulos = new Set(dados.data.eventos.map((e) => e.titulo));
    const novos = lista
      .filter((c) =>
        c.modelo === "brucelose"
          ? !titulos.has(c.titulo)
          : !existentes.has(`${c.titulo}|${c.data}`),
      )
      .sort((x, y) => x.data.localeCompare(y.data));
    return { compromissos: novos, semNascimento: semNasc };
  }, [dados.data, marcados, dataRaiva, dataClostridioses, especies, hoje]);

  const criar = useMutation({
    mutationFn: async () => {
      if (!fazenda || compromissos.length === 0) return 0;
      const { error } = await db.from("eventos_agenda").insert(
        compromissos.map((c) => ({
          fazenda_id: fazenda.id,
          animal_id: c.animalId,
          tipo: c.tipo,
          titulo: c.titulo,
          descricao: `${ORIGEM}. Confirme a exigência do seu estado com o veterinário.`,
          data: c.data,
          concluido: false,
          cancelado: false,
        })) as never,
      );
      if (error) throw new Error(error.message);
      return compromissos.length;
    },
    onSuccess: (qtd) => {
      toast.success(
        `${qtd} ${qtd === 1 ? "compromisso criado" : "compromissos criados"} na Agenda.`,
      );
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["calendario-sanitario"] });
      onFechar();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não conseguimos criar agora."),
  });

  const porModelo = (id: ModeloId) => compromissos.filter((c) => c.modelo === id);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Calendário sanitário</DialogTitle>
          <DialogDescription>
            Marque as vacinas da sua fazenda e o sistema coloca as datas na Agenda. Exigências mudam
            de estado para estado — confirme com seu veterinário.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {modelosDaFazenda.map((m) => {
            const itens = porModelo(m.id);
            return (
              <li key={m.id} className="rounded-lg border border-border p-3">
                <label className="flex items-start gap-3">
                  <Checkbox
                    className="mt-0.5"
                    checked={marcados[m.id]}
                    onCheckedChange={(v) => setMarcados((s) => ({ ...s, [m.id]: v === true }))}
                    aria-label={m.titulo}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{m.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{m.resumo}</span>
                  </span>
                </label>
                {m.aviso ? (
                  <p className="mt-2 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">
                    {m.aviso}
                  </p>
                ) : null}
                {marcados[m.id] && (m.id === "raiva" || m.id === "clostridioses") ? (
                  <div className="mt-2 flex items-center gap-2 pl-7">
                    <Label htmlFor={`cs-${m.id}`} className="text-xs">
                      Próxima aplicação
                    </Label>
                    <Input
                      id={`cs-${m.id}`}
                      type="date"
                      min={hoje}
                      className="h-8 w-auto text-xs"
                      value={m.id === "raiva" ? dataRaiva : dataClostridioses}
                      onChange={(e) =>
                        m.id === "raiva"
                          ? setDataRaiva(e.target.value)
                          : setDataClostridioses(e.target.value)
                      }
                    />
                  </div>
                ) : null}
                {marcados[m.id] ? (
                  <p className="mt-2 pl-7 text-xs text-muted-foreground">
                    {itens.length === 0
                      ? m.id === "brucelose"
                        ? "Nenhuma bezerra para vacinar agora."
                        : "Já está na Agenda."
                      : m.id === "brucelose"
                        ? `${itens.length} ${itens.length === 1 ? "bezerra" : "bezerras"}: ${itens
                            .slice(0, 3)
                            .map((c) => `${c.titulo.split("— ")[1]} em ${dataCurta(c.data)}`)
                            .join("; ")}${itens.length > 3 ? "…" : ""}`
                        : `Em ${itens.map((c) => dataCurta(c.data)).join(", ")}`}
                    {m.id === "brucelose" && semNascimento > 0
                      ? ` · ${semNascimento} ${semNascimento === 1 ? "fêmea jovem sem data de nascimento ficou" : "fêmeas jovens sem data de nascimento ficaram"} de fora.`
                      : ""}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {compromissos.length}{" "}
            {compromissos.length === 1 ? "compromisso novo" : "compromissos novos"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => criar.mutate()}
              disabled={criar.isPending || compromissos.length === 0 || dados.isLoading}
            >
              {criar.isPending ? "Criando..." : "Criar na Agenda"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
