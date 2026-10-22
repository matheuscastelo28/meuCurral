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
import { especieDaCategoria } from "@/lib/especies";
import { textoLote } from "@/lib/rotulos";

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

/**
 * Vacina, vermífugo e tratamento aplicados num animal, num lote ou no
 * rebanho todo: grava um manejo por animal (aparece na ficha de cada um),
 * o custo como despesa de sanidade e a próxima dose como evento na Agenda.
 */
export function DialogManejoSanitario({
  aberto,
  onFechar,
  animalIdInicial,
}: {
  aberto: boolean;
  onFechar: () => void;
  animalIdInicial?: string | null;
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

  useEffect(() => {
    if (!aberto) return;
    setTipo("vacina");
    setProduto("");
    setData(hojeISO());
    setEscopo(animalIdInicial ? "animal" : "rebanho");
    setAnimalId(animalIdInicial ?? "");
    setLote("");
    setEspecie("todas");
    setCusto("");
    setProxima("");
  }, [aberto, animalIdInicial]);

  const animais = useQuery({
    queryKey: ["animais-sanidade", fazenda?.id],
    enabled: !!fazenda?.id && aberto,
    queryFn: async () => {
      const { data: linhas, error } = await db
        .from("animais")
        .select("id, nome, brinco, lote, categoria, status")
        .eq("fazenda_id", fazenda!.id)
        .order("nome");
      if (error) throw error;
      return (linhas ?? []).filter((a) => a.status !== "vendido" && a.status !== "morto");
    },
  });

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
    return todos.filter((a) => especieDaCategoria(a.categoria) === especie);
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
        const { error } = await db.from("financeiro_lancamentos").insert({
          fazenda_id: fazenda.id,
          tipo: "despesa",
          descricao: `${descricao} — ${alvoTexto}`,
          valor: custoTotal,
          data,
          categoria: "sanidade",
          lote: escopo === "lote" ? lote : null,
        } as never);
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
      ]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
      onFechar();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não conseguimos salvar agora."),
  });

  const campoSelect = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manejo sanitário</DialogTitle>
          <DialogDescription>
            Vacina, vermífugo ou tratamento. Fica no histórico de cada animal; o custo vai pro
            Financeiro e a próxima dose pra Agenda.
          </DialogDescription>
        </DialogHeader>
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
                onChange={(e) => setProxima(e.target.value)}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-manejo-sanitario" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando..." : "Registrar manejo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
