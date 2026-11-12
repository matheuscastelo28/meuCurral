import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
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
import { dataCurta, hojeISO } from "@/lib/formato";
import { especieDoAnimal, especiesDasAtividades } from "@/lib/especies";
import { textoLote } from "@/lib/rotulos";
import { PlanejamentoSanitario } from "@/components/PlanejamentoSanitario";
import { RegrasSanitarias } from "@/components/RegrasSanitarias";
import { useRegrasSanitarias } from "@/hooks/use-regras-sanitarias";
import { acharRegra, somarDias, textoIntervalo } from "@/lib/sanidade";

const TIPOS = [
  { valor: "vacina", rotulo: "Vacina", exemplo: "Ex: Aftosa, Brucelose, Clostridiose" },
  { valor: "vermifugo", rotulo: "Vermífugo", exemplo: "Ex: Ivermectina 1%" },
  {
    valor: "tratamento",
    rotulo: "Medicamento / tratamento",
    exemplo: "Ex: Antibiótico para mastite",
  },
  { valor: "outro", rotulo: "Outro manejo", exemplo: "Ex: Casqueamento, castração" },
] as const;

type Escopo = "animal" | "lote" | "rebanho";
type Modo = "registrar" | "planejar" | "intervalos";

/** Lembrete da Agenda que está sendo cumprido (vacina/tratamento). */
export type EventoSanitario = {
  id: string;
  titulo: string | null;
  tipo: string | null;
  animal_id?: string | null;
};

/**
 * Os lembretes sanitários são gravados como "Vacina: Raiva — rebanho"
 * (tanto pelo planejamento quanto pela "próxima dose"), então dá pra
 * desmontar o título e preencher o registro sem o produtor redigitar.
 */
function lerTitulo(titulo: string) {
  const [esquerda = "", ...resto] = titulo.split(" — ");
  const alvo = resto.join(" — ").trim();
  const doisPontos = esquerda.indexOf(":");
  const rotulo = doisPontos >= 0 ? esquerda.slice(0, doisPontos).trim() : "";
  const produto = (doisPontos >= 0 ? esquerda.slice(doisPontos + 1) : esquerda).trim();
  const tipo = TIPOS.find((t) => t.rotulo.toLowerCase() === rotulo.toLowerCase())?.valor;
  return { tipo, produto, alvo };
}

/**
 * Vacinas e manejo num lugar só:
 * - "Registrar aplicação": vacina, vermífugo e tratamento aplicados num
 *   animal, num lote ou no rebanho todo — grava um manejo por animal
 *   (aparece na ficha de cada um), o custo como despesa de sanidade e a
 *   próxima dose como evento na Agenda.
 * - "Planejar calendário": cria os lembretes do calendário sanitário.
 * Quando aberto a partir de um lembrete (`evento`), já vem preenchido e,
 * ao registrar, o lembrete é marcado como feito.
 */
export function DialogManejoSanitario({
  aberto,
  onFechar,
  animalIdInicial,
  modoInicial = "registrar",
  evento,
}: {
  aberto: boolean;
  onFechar: () => void;
  animalIdInicial?: string | null;
  modoInicial?: Modo;
  evento?: EventoSanitario | null;
}) {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const ambasAtividades =
    !!fazenda?.atividades?.includes("bovino") && !!fazenda.atividades.includes("ovino");

  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["valor"]>("vacina");
  const [produto, setProduto] = useState("");
  const [data, setData] = useState(hojeISO());
  const [escopo, setEscopo] = useState<Escopo>("animal");
  const [animalId, setAnimalId] = useState("");
  const [lote, setLote] = useState("");
  const [especie, setEspecie] = useState<"todas" | "bovino" | "ovino">("todas");
  const [custo, setCusto] = useState("");
  const [proxima, setProxima] = useState("");
  const [proximaTocada, setProximaTocada] = useState(false);
  const regras = useRegrasSanitarias();
  const [modo, setModo] = useState<Modo>(modoInicial);

  useEffect(() => {
    if (!aberto) return;
    setModo(evento ? "registrar" : modoInicial);
    setTipo("vacina");
    setProduto("");
    setData(hojeISO());
    setEscopo(animalIdInicial ? "animal" : "rebanho");
    setAnimalId(animalIdInicial ?? "");
    setLote("");
    setEspecie("todas");
    setCusto("");
    setProxima("");
    setProximaTocada(false);
  }, [aberto, animalIdInicial, modoInicial, evento]);

  // A próxima dose sai sugerida pelo intervalo do produto (ver lib/sanidade),
  // até o produtor mexer na data.
  const regraAtual = acharRegra(produto, tipo, regras.data ?? []);
  useEffect(() => {
    if (proximaTocada) return;
    setProxima(regraAtual ? somarDias(data, regraAtual.intervalo_dias) : "");
  }, [proximaTocada, regraAtual, data]);

  const animais = useQuery({
    queryKey: ["animais-sanidade", fazenda?.id, fazenda?.atividades?.join(",")],
    enabled: !!fazenda?.id && aberto,
    queryFn: async () => {
      const { data: linhas, error } = await db
        .from("animais")
        .select("id, nome, brinco, lote, categoria, especie, status")
        .eq("fazenda_id", fazenda!.id)
        .order("nome");
      if (error) throw error;
      const permitidas = especiesDasAtividades(fazenda?.atividades);
      return (linhas ?? []).filter(
        (a) =>
          a.status !== "vendido" && a.status !== "morto" && permitidas.includes(especieDoAnimal(a)),
      );
    },
  });

  // Preenche a partir do lembrete assim que a lista de animais chega
  // (precisa dela pra reconhecer o lote citado no título).
  const [preenchidoDe, setPreenchidoDe] = useState<string | null>(null);
  useEffect(() => {
    if (!aberto) setPreenchidoDe(null);
  }, [aberto]);
  useEffect(() => {
    if (!aberto || !evento || !animais.data || preenchidoDe === evento.id) return;
    setPreenchidoDe(evento.id);
    const lido = lerTitulo(evento.titulo ?? "");
    setTipo(lido.tipo ?? (evento.tipo === "vacina" ? "vacina" : "tratamento"));
    setProduto(lido.produto);
    const alvo = lido.alvo.toLowerCase();
    const loteCitado = (animais.data ?? [])
      .map((a) => String(a.lote ?? "").trim())
      .find((l) => l && textoLote(l).toLowerCase() === alvo);
    if (evento.animal_id) {
      setEscopo("animal");
      setAnimalId(evento.animal_id);
    } else if (loteCitado) {
      setEscopo("lote");
      setLote(loteCitado);
    } else {
      setEscopo("rebanho");
      setEspecie(alvo === "bovinos" ? "bovino" : alvo === "ovinos" ? "ovino" : "todas");
    }
  }, [aberto, evento, animais.data, preenchidoDe]);

  const lotes = useMemo(() => {
    const nomes = new Set<string>();
    for (const a of animais.data ?? []) {
      const nome = String(a.lote ?? "").trim();
      if (nome) nomes.add(nome);
    }
    return Array.from(nomes).sort((x, y) => x.localeCompare(y, "pt-BR"));
  }, [animais.data]);

  const alvos = useMemo(() => {
    const todos = animais.data ?? [];
    if (escopo === "animal") return todos.filter((a) => a.id === animalId);
    if (escopo === "lote") return todos.filter((a) => String(a.lote ?? "").trim() === lote);
    if (especie === "todas") return todos;
    return todos.filter((a) => especieDoAnimal(a) === especie);
  }, [animais.data, escopo, animalId, lote, especie]);

  const tipoInfo = TIPOS.find((t) => t.valor === tipo)!;

  const salvar = useMutation({
    mutationFn: async () => {
      if (!fazenda) return;
      if (!produto.trim()) throw new Error("Informe o produto ou o que foi feito.");
      if (alvos.length === 0) throw new Error("Nenhum animal selecionado para este manejo.");
      const custoTotal = Number(custo) || 0;
      const custoPorAnimal = custoTotal > 0 ? custoTotal / alvos.length : null;
      const descricao = `${tipoInfo.rotulo}: ${produto.trim()}`;

      const { error: erroManejos } = await db.from("manejos").insert(
        alvos.map((a) => ({
          fazenda_id: fazenda.id,
          animal_id: a.id,
          tipo,
          data,
          descricao: produto.trim(),
          valor: custoPorAnimal,
          proxima_data: proxima || null,
        })) as never,
      );
      if (erroManejos) throw new Error(erroManejos.message);

      const alvoTexto =
        escopo === "animal"
          ? (alvos[0]?.nome ?? "animal")
          : escopo === "lote"
            ? textoLote(lote)
            : especie === "todas"
              ? "rebanho"
              : especie === "bovino"
                ? "bovinos"
                : "ovinos";

      if (custoTotal > 0) {
        // O custo vai pro lote de cada animal (pra contar na margem do lote
        // no Confinamento): aplicação num animal usa o lote dele; no rebanho
        // todo, o custo é rateado entre os lotes pelo número de animais.
        const grupos = new Map<string, number>();
        for (const a of alvos) {
          const chave = escopo === "lote" ? lote : String(a.lote ?? "").trim();
          grupos.set(chave, (grupos.get(chave) ?? 0) + 1);
        }
        const entradas = Array.from(grupos.entries());
        const totalCentavos = Math.round(custoTotal * 100);
        let restante = totalCentavos;
        const lancamentos = entradas
          .map(([loteDoGrupo, qtd], i) => {
            const centavos =
              i === entradas.length - 1
                ? restante
                : Math.round((totalCentavos * qtd) / alvos.length);
            restante -= centavos;
            const rotuloGrupo = loteDoGrupo ? textoLote(loteDoGrupo) : "sem lote";
            return {
              fazenda_id: fazenda.id,
              tipo: "despesa",
              descricao:
                entradas.length > 1
                  ? `${descricao} — ${rotuloGrupo} (${qtd} de ${alvos.length} animais)`
                  : `${descricao} — ${alvoTexto}`,
              valor: centavos / 100,
              data,
              categoria: "sanidade",
              lote: loteDoGrupo || null,
              animal_id: escopo === "animal" ? (alvos[0]?.id ?? null) : null,
            };
          })
          .filter((l) => l.valor > 0);
        const { error } = await db.from("financeiro_lancamentos").insert(lancamentos as never);
        if (error) throw new Error(error.message);
      }

      if (proxima) {
        const { error } = await db.from("eventos_agenda").insert({
          fazenda_id: fazenda.id,
          animal_id: escopo === "animal" ? (alvos[0]?.id ?? null) : null,
          tipo: tipo === "vacina" ? "vacina" : "tratamento",
          titulo: `${descricao} — ${alvoTexto}`,
          descricao: `Dose anterior em ${dataCurta(data)} (${alvos.length} ${alvos.length === 1 ? "animal" : "animais"}).`,
          data: proxima,
          concluido: false,
          cancelado: false,
        } as never);
        if (error) throw new Error(error.message);
      }

      if (evento) {
        const { error } = await db
          .from("eventos_agenda")
          .update({ concluido: true })
          .eq("id", evento.id);
        if (error) throw new Error(error.message);
      }
      return alvos.length;
    },
    onSuccess: (qtd) => {
      toast.success(
        `Manejo registrado em ${qtd} ${qtd === 1 ? "animal" : "animais"}${proxima ? " e próxima dose agendada" : ""}.`,
      );
      for (const chave of [
        "ficha-manejos",
        "eventos",
        "inicio-resumo",
        "financeiro",
        "despesas-lote",
        "ficha-custos",
      ]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
      onFechar();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não conseguimos salvar agora."),
  });

  // Pra quando o lembrete foi cumprido mas o produtor não quer (ou não
  // precisa) registrar a aplicação animal por animal.
  const soConcluir = useMutation({
    mutationFn: async () => {
      if (!evento) return null;
      const { error } = await db
        .from("eventos_agenda")
        .update({ concluido: true })
        .eq("id", evento.id);
      if (error) throw new Error(error.message);
      // Cumprir o lembrete sem registrar a aplicação também gera o próximo,
      // se o produto tem intervalo (ex.: vermífugo a cada 2 meses).
      const lido = lerTitulo(evento.titulo ?? "");
      const regra = acharRegra(lido.produto, lido.tipo ?? null, regras.data ?? []);
      if (!regra || !fazenda) return null;
      const proximaData = somarDias(hojeISO(), regra.intervalo_dias);
      const { data: existentes } = await db
        .from("eventos_agenda")
        .select("id")
        .eq("fazenda_id", fazenda.id)
        .eq("titulo", evento.titulo ?? "")
        .eq("data", proximaData);
      if ((existentes ?? []).length > 0) return proximaData;
      const { error: erroNovo } = await db.from("eventos_agenda").insert({
        fazenda_id: fazenda.id,
        animal_id: evento.animal_id ?? null,
        tipo: evento.tipo ?? "tratamento",
        titulo: evento.titulo,
        descricao: `Repetição automática (a cada ${textoIntervalo(regra.intervalo_dias)}).`,
        data: proximaData,
        concluido: false,
        cancelado: false,
      } as never);
      if (erroNovo) throw new Error(erroNovo.message);
      return proximaData;
    },
    onSuccess: (proximaData) => {
      toast.success(
        proximaData
          ? `Marcado como feito. Próximo lembrete em ${dataCurta(proximaData)}.`
          : "Marcado como feito.",
      );
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
      onFechar();
    },
    onError: () => toast.error("Não conseguimos atualizar agora."),
  });

  const campoSelect = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{evento ? "Registrar o que foi feito" : "Vacinas e manejo"}</DialogTitle>
          <DialogDescription>
            {evento
              ? `Lembrete: ${evento.titulo ?? ""}. Confira os dados e registre — o lembrete sai da Agenda como feito.`
              : modo === "registrar"
                ? "Vacina, vermífugo ou tratamento aplicado. Fica no histórico de cada animal; o custo vai pro Financeiro e a próxima dose pra Agenda."
                : modo === "intervalos"
                  ? "De quanto em quanto tempo cada vacina ou manejo se repete."
                  : "Crie os lembretes das vacinas obrigatórias e da vermifugação. Quando chegar a data, conclua o lembrete e a aplicação já vem preenchida."}
          </DialogDescription>
        </DialogHeader>
        {evento ? null : (
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="tablist">
            {(
              [
                ["registrar", "Registrar aplicação"],
                ["planejar", "Planejar calendário"],
                ["intervalos", "Intervalos"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={modo === valor}
                onClick={() => setModo(valor)}
                className={
                  modo === valor
                    ? "rounded-md bg-background px-3 py-1.5 text-sm font-semibold shadow-sm"
                    : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}
        {modo === "intervalos" ? (
          <RegrasSanitarias />
        ) : modo === "planejar" ? (
          <PlanejamentoSanitario aberto={aberto && modo === "planejar"} onFechar={onFechar} />
        ) : (
          <>
            <form
              id="form-manejo-sanitario"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                salvar.mutate();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="san-tipo">Tipo</Label>
                  <select
                    id="san-tipo"
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as typeof tipo)}
                    className={campoSelect}
                  >
                    {TIPOS.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="san-data">Data da aplicação</Label>
                  <Input
                    id="san-data"
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="san-produto">Produto / o que foi feito</Label>
                <Input
                  id="san-produto"
                  value={produto}
                  onChange={(e) => setProduto(e.target.value)}
                  placeholder={tipoInfo.exemplo}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Aplicado em</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["animal", "Um animal"],
                      ["lote", "Um lote"],
                      ["rebanho", "Rebanho todo"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <Button
                      key={valor}
                      type="button"
                      size="sm"
                      variant={escopo === valor ? "default" : "outline"}
                      onClick={() => setEscopo(valor)}
                    >
                      {rotulo}
                    </Button>
                  ))}
                </div>
              </div>

              {escopo === "animal" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="san-animal">Animal</Label>
                  <select
                    id="san-animal"
                    value={animalId}
                    onChange={(e) => setAnimalId(e.target.value)}
                    className={campoSelect}
                    required
                  >
                    <option value="">Selecione</option>
                    {(animais.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                        {a.brinco ? ` (${a.brinco})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {escopo === "lote" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="san-lote">Lote</Label>
                  <select
                    id="san-lote"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    className={campoSelect}
                    required
                  >
                    <option value="">Selecione</option>
                    {lotes.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  {lotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum lote cadastrado — defina o lote dos animais no Rebanho.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {escopo === "rebanho" && ambasAtividades ? (
                <div className="space-y-1.5">
                  <Label htmlFor="san-especie">Espécie</Label>
                  <select
                    id="san-especie"
                    value={especie}
                    onChange={(e) => setEspecie(e.target.value as typeof especie)}
                    className={campoSelect}
                  >
                    <option value="todas">Bovinos e ovinos</option>
                    <option value="bovino">Só bovinos</option>
                    <option value="ovino">Só ovinos</option>
                  </select>
                </div>
              ) : null}

              {escopo !== "animal" ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {alvos.length} {alvos.length === 1 ? "animal recebe" : "animais recebem"} este
                  registro.
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="san-custo">Custo total (R$, opcional)</Label>
                  <Input
                    id="san-custo"
                    type="number"
                    step="0.01"
                    min="0"
                    value={custo}
                    onChange={(e) => setCusto(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="san-proxima">Próxima dose (opcional)</Label>
                  <Input
                    id="san-proxima"
                    type="date"
                    value={proxima}
                    min={data}
                    onChange={(e) => {
                      setProximaTocada(true);
                      setProxima(e.target.value);
                    }}
                  />
                  {regraAtual && !proximaTocada ? (
                    <p className="text-xs text-muted-foreground">
                      Sugerida: repetir a cada {textoIntervalo(regraAtual.intervalo_dias)}.
                    </p>
                  ) : null}
                </div>
              </div>
            </form>
            <DialogFooter className="gap-2">
              <Button variant="outline" type="button" onClick={onFechar}>
                Cancelar
              </Button>
              {evento ? (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => soConcluir.mutate()}
                  disabled={soConcluir.isPending || salvar.isPending}
                >
                  Só marcar como feito
                </Button>
              ) : null}
              <Button type="submit" form="form-manejo-sanitario" disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando..." : "Registrar manejo"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
