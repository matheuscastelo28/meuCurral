import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Baby,
  Beef,
  Coins,
  Layers,
  Plus,
  Scale,
  Skull,
  Tag,
  TrendingUp,
  Weight,
  Wheat,
} from "lucide-react";
import { toast } from "sonner";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { CartaoConfig } from "@/components/config/CartaoConfig";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useFazenda } from "@/hooks/use-fazenda";
import { useIndicesRebanho } from "@/hooks/use-indices-rebanho";
import { useIndicesEngorda } from "@/hooks/use-indices-engorda";
import {
  dataCurta,
  dataISO,
  diasAtrasISO,
  hojeISO,
  moeda as formatarMoeda,
  pesoTexto,
} from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";
import { encontrarPrecoVigente } from "@/lib/precos-produto";

const KG_POR_ARROBA = 15;
const SEM_LOTE = "Sem lote";

export const Route = createFileRoute("/_authenticated/engorda")({
  head: () => ({
    meta: [
      { title: "Engorda — Curral Online" },
      {
        name: "description",
        content: "Acompanhamento de peso, GMD, custo e venda do lote em engorda.",
      },
      { property: "og:title", content: "Engorda — Curral Online" },
      { property: "og:description", content: "Pesagens, GMD, custo e venda por lote em engorda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Engorda,
});

function Engorda() {
  const { data: fazenda } = useFazenda();
  const prefs = usePreferencias();
  const queryClient = useQueryClient();
  const indices = useIndicesRebanho(fazenda?.id);
  const indicesEngorda = useIndicesEngorda(fazenda?.id);
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);
  const hoje = hojeISO();

  const [modo, setModo] = useState<"lote" | "animal">("lote");

  // ---------------------------------------------------------------------
  // Dados comuns (animais em engorda + pesagens + despesas de lote)
  // ---------------------------------------------------------------------

  const animais = useQuery({
    queryKey: ["animais-engorda", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("id, nome, brinco, peso_kg, lote")
        .eq("fazenda_id", fazenda!.id)
        .eq("status", "engorda")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const pesagens = useQuery({
    queryKey: ["pesagens-engorda", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("manejos")
        .select("*, animais(nome)")
        .eq("fazenda_id", fazenda!.id)
        .eq("tipo", "pesagem")
        .order("data", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const pesagensTodas = useQuery({
    queryKey: ["pesagens-engorda-todas", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("manejos")
        .select("animal_id, data, valor")
        .eq("fazenda_id", fazenda!.id)
        .eq("tipo", "pesagem")
        .order("data", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const despesasLote = useQuery({
    queryKey: ["despesas-lote", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("financeiro_lancamentos")
        .select("id, valor, categoria, descricao, data, lote")
        .eq("fazenda_id", fazenda!.id)
        .eq("tipo", "despesa")
        .order("data", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const alimentacaoLote = useQuery({
    queryKey: ["alimentacao-lote", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("alimentacao_lote")
        .select(
          "id, lote, data, forragem_kg, silagem_kg, racao_kg, outro_kg, outro_descricao, custo_dia, observacoes",
        )
        .eq("fazenda_id", fazenda!.id)
        .order("data", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  function invalidarEngordaGeral() {
    queryClient.invalidateQueries({ queryKey: ["animais-engorda"] });
    queryClient.invalidateQueries({ queryKey: ["pesagens-engorda"] });
    queryClient.invalidateQueries({ queryKey: ["pesagens-engorda-todas"] });
    queryClient.invalidateQueries({ queryKey: ["despesas-lote"] });
    queryClient.invalidateQueries({ queryKey: ["alimentacao-lote"] });
    queryClient.invalidateQueries({ queryKey: ["indices-engorda"] });
    queryClient.invalidateQueries({ queryKey: ["animais"] });
    queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["vendas"] });
    queryClient.invalidateQueries({ queryKey: ["eventos"] });
    queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
  }

  const registrar = useMutation({
    mutationFn: async (vars: { animalId: string; peso: string; data: string }) => {
      const pesoNum = Number(vars.peso);
      const { error: erroManejo } = await db.from("manejos").insert({
        fazenda_id: fazenda!.id,
        animal_id: vars.animalId,
        tipo: "pesagem",
        data: vars.data,
        valor: pesoNum,
      } as never);
      if (erroManejo) throw erroManejo;
      const { error: erroAnimal } = await db
        .from("animais")
        .update({ peso_kg: pesoNum } as never)
        .eq("id", vars.animalId);
      if (erroAnimal) throw erroAnimal;
    },
    onSuccess: () => {
      toast.success("Pesagem registrada.");
      setPeso("");
      invalidarEngordaGeral();
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  const [animalId, setAnimalId] = useState("");
  const [peso, setPeso] = useState("");
  const [data, setData] = useState(hoje);

  // ---- Preço da arroba vigente ------------------------------------------
  const precos = useQuery({
    queryKey: ["precos-produto", fazenda?.id, "boi"],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("precos_produto")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .eq("produto", "boi")
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const precoVigente = useMemo(() => encontrarPrecoVigente(precos.data, hoje), [precos.data, hoje]);

  const [mostrarFormPreco, setMostrarFormPreco] = useState(false);
  const [precoValor, setPrecoValor] = useState("");
  const [precoComprador, setPrecoComprador] = useState("");
  const [precoDataInicio, setPrecoDataInicio] = useState(hoje);

  const salvarPreco = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("precos_produto").insert({
        fazenda_id: fazenda!.id,
        produto: "boi",
        valor: Number(precoValor),
        unidade: "arroba",
        comprador: precoComprador.trim() || null,
        data_inicio: precoDataInicio,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preço atualizado.");
      setMostrarFormPreco(false);
      setPrecoValor("");
      setPrecoComprador("");
      queryClient.invalidateQueries({ queryKey: ["precos-produto"] });
    },
    onError: () => toast.error("Não conseguimos salvar o preço agora."),
  });

  // ---- Venda avulsa (um animal, ou um peso qualquer, com preço próprio) -
  const [mostrarFormVendaAvulsa, setMostrarFormVendaAvulsa] = useState(false);
  const [vendaAnimalId, setVendaAnimalId] = useState("");
  const [vendaAvulsaPeso, setVendaAvulsaPeso] = useState("");
  const [vendaAvulsaPreco, setVendaAvulsaPreco] = useState("");
  const [vendaAvulsaComprador, setVendaAvulsaComprador] = useState("");
  const [vendaAvulsaData, setVendaAvulsaData] = useState(hoje);
  const [vendaAvulsaPago, setVendaAvulsaPago] = useState(false);
  const [vendaAvulsaFormaPagamento, setVendaAvulsaFormaPagamento] = useState("dinheiro");
  const [vendaAvulsaParcelas, setVendaAvulsaParcelas] = useState("1");

  const arrobasVendaAvulsa =
    Number(vendaAvulsaPeso) > 0 ? Number(vendaAvulsaPeso) / KG_POR_ARROBA : 0;
  const vendaAvulsaTotal = arrobasVendaAvulsa * (Number(vendaAvulsaPreco) || 0);

  function selecionarAnimalVenda(id: string) {
    setVendaAnimalId(id);
    const animal = animais.data?.find((a) => a.id === id);
    if (animal?.peso_kg) setVendaAvulsaPeso(String(animal.peso_kg));
  }

  const salvarVendaAvulsa = useMutation({
    mutationFn: async () => {
      const pesoKg = Number(vendaAvulsaPeso);
      const arrobas = pesoKg / KG_POR_ARROBA;
      const { error } = await db.leite.registrarVenda({
        fazendaId: fazenda!.id,
        produto: "boi",
        quantidade: arrobas,
        unidade: "arroba",
        precoUnitario: Number(vendaAvulsaPreco),
        comprador: vendaAvulsaComprador.trim() || null,
        data: vendaAvulsaData,
        pago: vendaAvulsaPago,
        formaPagamento: vendaAvulsaFormaPagamento,
        parcelas: vendaAvulsaFormaPagamento === "cartao" ? Number(vendaAvulsaParcelas) || 1 : null,
        animalId: vendaAnimalId || undefined,
        pesoAtualizado: pesoKg,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(
        vendaAnimalId ? "Venda registrada e animal marcado como vendido." : "Venda registrada.",
      );
      setMostrarFormVendaAvulsa(false);
      setVendaAnimalId("");
      setVendaAvulsaPeso("");
      setVendaAvulsaPreco("");
      setVendaAvulsaComprador("");
      setVendaAvulsaData(hoje);
      setVendaAvulsaPago(false);
      setVendaAvulsaFormaPagamento("dinheiro");
      setVendaAvulsaParcelas("1");
      invalidarEngordaGeral();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não conseguimos registrar a venda."),
  });

  // ---------------------------------------------------------------------
  // Agrupamento por lote
  // ---------------------------------------------------------------------

  const pesagensPorAnimal = useMemo(() => {
    const mapa = new Map<string, { data: string; valor: number }[]>();
    for (const p of pesagensTodas.data ?? []) {
      if (!p.animal_id || p.valor === null) continue;
      const lista = mapa.get(p.animal_id) ?? [];
      lista.push({ data: dataISO(p.data), valor: Number(p.valor) });
      mapa.set(p.animal_id, lista);
    }
    return mapa;
  }, [pesagensTodas.data]);

  const lotes = useMemo(() => {
    const grupos = new Map<string, { nome: string; animais: typeof animaisLista }>();
    const animaisLista = animais.data ?? [];
    for (const an of animaisLista) {
      const chave = an.lote?.trim() || SEM_LOTE;
      if (!grupos.has(chave)) grupos.set(chave, { nome: chave, animais: [] });
      grupos.get(chave)!.animais.push(an);
    }

    return Array.from(grupos.values()).map((grupo) => {
      const pesos = grupo.animais.map((a) => Number(a.peso_kg ?? 0)).filter((p) => p > 0);
      const pesoTotal = pesos.reduce((s, p) => s + p, 0);
      const pesoMedio = pesos.length > 0 ? pesoTotal / pesos.length : 0;
      const arrobasTotais = pesoTotal / KG_POR_ARROBA;

      const gmds: number[] = [];
      const porDia = new Map<string, { soma: number; qtd: number }>();
      for (const an of grupo.animais) {
        const registros = pesagensPorAnimal.get(an.id) ?? [];
        for (const r of registros) {
          const acc = porDia.get(r.data) ?? { soma: 0, qtd: 0 };
          acc.soma += r.valor;
          acc.qtd += 1;
          porDia.set(r.data, acc);
        }
        if (registros.length >= 2) {
          const primeiro = registros[0]!;
          const ultimo = registros[registros.length - 1]!;
          const dias = Math.max(
            1,
            Math.round(
              (new Date(ultimo.data).getTime() - new Date(primeiro.data).getTime()) / 86400000,
            ),
          );
          gmds.push((ultimo.valor - primeiro.valor) / dias);
        }
      }
      const gmdMedio = gmds.length > 0 ? gmds.reduce((s, g) => s + g, 0) / gmds.length : null;

      const curva = Array.from(porDia.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([dia, v]) => ({ data: dataCurta(dia), peso: Math.round((v.soma / v.qtd) * 10) / 10 }))
        .slice(-10);

      const custoAcumulado = (despesasLote.data ?? [])
        .filter((d) => (d.lote?.trim() || "") === grupo.nome)
        .reduce((s, d) => s + Number(d.valor), 0);

      const custoCompra = (despesasLote.data ?? [])
        .filter((d) => (d.lote?.trim() || "") === grupo.nome && d.categoria === "compra")
        .reduce((s, d) => s + Number(d.valor), 0);

      const margemEstimada = precoVigente
        ? arrobasTotais * Number(precoVigente.valor) - custoAcumulado
        : null;

      // Entrada do lote: usamos a primeira pesagem de cada animal como
      // proxy do peso/data de entrada — não existe um cadastro de "compra"
      // separado, é o mesmo texto livre de lote já usado em todo o resto.
      let somaPesoInicial = 0;
      let qtdComPesoInicial = 0;
      let dataEntrada: string | null = null;
      for (const an of grupo.animais) {
        const registros = pesagensPorAnimal.get(an.id) ?? [];
        if (registros.length > 0) {
          somaPesoInicial += registros[0]!.valor;
          qtdComPesoInicial++;
          if (!dataEntrada || registros[0]!.data < dataEntrada) dataEntrada = registros[0]!.data;
        }
      }
      const pesoInicialMedio = qtdComPesoInicial > 0 ? somaPesoInicial / qtdComPesoInicial : null;
      const pesoTotalEntrada =
        pesoInicialMedio !== null ? pesoInicialMedio * qtdComPesoInicial : null;
      const precoMedioPorCabeca =
        custoCompra > 0 && grupo.animais.length > 0 ? custoCompra / grupo.animais.length : null;
      const diasDesdeEntrada = dataEntrada
        ? Math.max(
            0,
            Math.round((new Date(hoje).getTime() - new Date(dataEntrada).getTime()) / 86400000),
          )
        : null;

      return {
        nome: grupo.nome,
        animais: grupo.animais,
        qtd: grupo.animais.length,
        pesoMedio,
        pesoTotal,
        arrobasTotais,
        gmdMedio,
        curva,
        custoAcumulado,
        custoCompra,
        margemEstimada,
        dataEntrada,
        pesoInicialMedio,
        pesoTotalEntrada,
        precoMedioPorCabeca,
        diasDesdeEntrada,
      };
    });
  }, [animais.data, pesagensPorAnimal, despesasLote.data, precoVigente, hoje]);

  const [loteSelecionado, setLoteSelecionado] = useState<string | null>(null);
  useEffect(() => {
    if (!loteSelecionado && lotes.length > 0) setLoteSelecionado(lotes[0]!.nome);
    if (loteSelecionado && !lotes.some((l) => l.nome === loteSelecionado)) {
      setLoteSelecionado(lotes[0]?.nome ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotes]);

  const loteAtual = lotes.find((l) => l.nome === loteSelecionado) ?? null;

  const [pesagemLoteAberto, setPesagemLoteAberto] = useState(false);
  const [custoLoteAberto, setCustoLoteAberto] = useState(false);
  const [venderLoteAberto, setVenderLoteAberto] = useState(false);
  const [alimentacaoLoteAberto, setAlimentacaoLoteAberto] = useState(false);

  // Uma rotina de alimentação pode valer pro rebanho todo (lote nulo) ou
  // só pra lotes específicos — na ficha de um lote mostramos os dois tipos
  // de registro juntos, o mais recente primeiro (já vem assim do servidor).
  const alimentacaoDoLoteAtual = useMemo(
    () =>
      (alimentacaoLote.data ?? []).filter(
        (a) => a.lote === null || (a.lote?.trim() || "") === loteSelecionado,
      ),
    [alimentacaoLote.data, loteSelecionado],
  );
  const ultimaAlimentacao = alimentacaoDoLoteAtual[0] ?? null;

  const [pesoMetaAbate, setPesoMetaAbate] = useState("");
  useEffect(() => {
    setPesoMetaAbate("");
  }, [loteSelecionado]);

  const projecao = useMemo(() => {
    if (!loteAtual || !pesoMetaAbate) return null;
    const meta = Number(pesoMetaAbate);
    if (!Number.isFinite(meta) || meta <= loteAtual.pesoMedio) return null;
    if (!loteAtual.gmdMedio || loteAtual.gmdMedio <= 0) return null;
    const diasRestantes = Math.ceil((meta - loteAtual.pesoMedio) / loteAtual.gmdMedio);
    const previsaoSaida = new Date(hoje);
    previsaoSaida.setUTCDate(previsaoSaida.getUTCDate() + diasRestantes);
    const custoDiarioMedio =
      loteAtual.diasDesdeEntrada && loteAtual.diasDesdeEntrada > 0
        ? loteAtual.custoAcumulado / loteAtual.diasDesdeEntrada
        : 0;
    const custoAlimentacaoProjetada = custoDiarioMedio * diasRestantes;
    const custoFinalProjetado = loteAtual.custoAcumulado + custoAlimentacaoProjetada;
    return {
      diasRestantes,
      previsaoSaida: previsaoSaida.toISOString().slice(0, 10),
      custoAlimentacaoProjetada,
      custoFinalProjetado,
      custoFinalPorCabeca: custoFinalProjetado / loteAtual.qtd,
    };
  }, [loteAtual, pesoMetaAbate, hoje]);

  const i = indices.data;
  const e = indicesEngorda.data;

  return (
    <AppShell
      titulo="Engorda"
      descricao="Peso, ganho médio diário, custo e venda do lote em engorda."
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi icon={Beef} rotulo="Total do rebanho" valor={i ? `${i.totalRebanho} cab` : "—"} />
        <Kpi icon={Baby} rotulo="Partos (últimos 30 dias)" valor={i ? `${i.partos30d} cab` : "—"} />
        <Kpi
          icon={Skull}
          rotulo="Mortes (últimos 30 dias)"
          valor={i ? `${i.mortes30d} cab` : "—"}
        />
        <Kpi icon={Weight} rotulo="Animais em engorda" valor={e ? `${e.totalEngorda} cab` : "—"} />
        <Kpi
          icon={Scale}
          rotulo="Peso médio"
          valor={e ? pesoTexto(e.pesoMedio, prefs.unidade_peso) : "—"}
        />
        <Kpi
          icon={Scale}
          rotulo="Arrobas totais"
          valor={
            e ? `${e.arrobasTotais.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} @` : "—"
          }
        />
        <Kpi
          icon={TrendingUp}
          rotulo="GMD médio"
          valor={
            e
              ? e.gmdMedio !== null
                ? `${e.gmdMedio.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg/dia`
                : "—"
              : "—"
          }
        />
        <Kpi
          icon={TrendingUp}
          rotulo="Ganho (últimos 30 dias)"
          valor={e ? `${e.ganho30d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : "—"}
        />
      </div>

      <div className="mb-5">
        <CartaoConfig
          id="preco-boi"
          titulo="Preço do boi"
          descricao="Vale para as arrobas vendidas a partir da data de vigência — o histórico anterior continua usando o preço antigo."
        >
          {precoVigente ? (
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                <Tag className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-xl font-extrabold">
                  {moeda(Number(precoVigente.valor))}/@
                </p>
                <p className="text-xs text-muted-foreground">
                  desde {dataCurta(precoVigente.data_inicio)}
                  {precoVigente.comprador ? ` · ${precoVigente.comprador}` : ""}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum preço cadastrado ainda.</p>
          )}

          {mostrarFormPreco ? (
            <form
              className="mt-4 grid gap-3 sm:grid-cols-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                salvarPreco.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="preco-boi-valor">Preço (R$/@)</Label>
                <Input
                  id="preco-boi-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={precoValor}
                  onChange={(ev) => setPrecoValor(ev.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preco-boi-comprador">Comprador</Label>
                <Input
                  id="preco-boi-comprador"
                  value={precoComprador}
                  onChange={(ev) => setPrecoComprador(ev.target.value)}
                  placeholder="Ex: Frigorífico Y"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preco-boi-data">Vigente a partir de</Label>
                <Input
                  id="preco-boi-data"
                  type="date"
                  value={precoDataInicio}
                  onChange={(ev) => setPrecoDataInicio(ev.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2 sm:col-span-3">
                <Button type="submit" size="sm" disabled={salvarPreco.isPending}>
                  Salvar preço
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMostrarFormPreco(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setMostrarFormPreco(true)}
            >
              Atualizar preço
            </Button>
          )}
        </CartaoConfig>
      </div>

      <div className="mb-5">
        <CartaoConfig
          id="alimentacao"
          titulo="Alimentação"
          descricao="Registre a rotina de alimentação pro rebanho todo ou só pra lotes específicos — independente de qual lote está selecionado abaixo."
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAlimentacaoLoteAberto(true)}
          >
            <Wheat className="size-4" aria-hidden="true" />
            Rotina de alimentação
          </Button>
        </CartaoConfig>
      </div>

      <DialogAlimentacaoLote
        aberto={alimentacaoLoteAberto}
        onFechar={() => setAlimentacaoLoteAberto(false)}
        loteInicial={null}
        lotesDisponiveis={lotes.map((l) => l.nome)}
        fazendaId={fazenda?.id}
        onSalvo={invalidarEngordaGeral}
      />

      {(animais.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Weight}
          titulo="Nenhum animal em engorda"
          descricao="Marque um animal com a situação 'engorda' no Rebanho para acompanhar peso e GMD aqui."
        />
      ) : (
        <Tabs value={modo} onValueChange={(v) => setModo(v as "lote" | "animal")}>
          <TabsList>
            <TabsTrigger value="lote">
              <Layers className="mr-1.5 size-3.5" aria-hidden="true" />
              Por lote
            </TabsTrigger>
            <TabsTrigger value="animal">Por animal</TabsTrigger>
          </TabsList>

          <TabsContent value="lote" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lotes.map((lote) => (
                <button
                  key={lote.nome}
                  type="button"
                  onClick={() => setLoteSelecionado(lote.nome)}
                  className={
                    lote.nome === loteSelecionado
                      ? "rounded-xl border-2 border-primary bg-card p-4 text-left transicao-suave"
                      : "rounded-xl border border-border bg-card p-4 text-left transicao-suave hover:border-primary/40"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{lote.nome}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {lote.qtd} cab
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Peso médio atual</p>
                  <p className="font-display text-xl font-extrabold">
                    {pesoTexto(lote.pesoMedio, prefs.unidade_peso)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span
                      className={
                        lote.gmdMedio !== null && lote.gmdMedio >= 0.6
                          ? "rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success"
                          : "rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground"
                      }
                    >
                      GMD{" "}
                      {lote.gmdMedio !== null
                        ? `${lote.gmdMedio.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg/dia`
                        : "—"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-muted-foreground">Custo acumulado</p>
                      <p className="font-semibold">{moeda(lote.custoAcumulado)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground">Margem estimada</p>
                      <p
                        className={
                          lote.margemEstimada !== null && lote.margemEstimada < 0
                            ? "font-semibold text-destructive"
                            : "font-semibold text-success"
                        }
                      >
                        {lote.margemEstimada !== null ? moeda(lote.margemEstimada) : "—"}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {loteAtual ? (
              <div className="rounded-xl border-2 border-primary bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold">{loteAtual.nome}</h3>
                    <p className="text-xs text-muted-foreground">
                      {loteAtual.qtd} animais em engorda
                    </p>
                  </div>
                  {loteAtual.gmdMedio !== null ? (
                    <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                      GMD {loteAtual.gmdMedio.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                      kg/dia
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm font-semibold">Curva de peso médio</p>
                    {loteAtual.curva.length >= 2 ? (
                      <ChartContainer
                        config={{ peso: { label: "Peso médio (kg)", color: "var(--primary)" } }}
                        className="mt-2 h-40 w-full"
                      >
                        <LineChart data={loteAtual.curva}>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis dataKey="data" tickLine={false} axisLine={false} fontSize={10} />
                          <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line
                            type="monotone"
                            dataKey="peso"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ChartContainer>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Registre ao menos duas pesagens do lote para ver a curva.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm font-semibold">Custo x receita projetada</p>
                    <div className="mt-2 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Custo acumulado</span>
                        <span className="font-semibold">{moeda(loteAtual.custoAcumulado)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Receita estimada na venda</span>
                        <span className="font-semibold">
                          {precoVigente
                            ? moeda(loteAtual.arrobasTotais * Number(precoVigente.valor))
                            : "cadastre o preço do boi"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 rounded-md bg-card px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Margem estimada: </span>
                      <span
                        className={
                          loteAtual.margemEstimada !== null && loteAtual.margemEstimada < 0
                            ? "font-semibold text-destructive"
                            : "font-semibold text-success"
                        }
                      >
                        {loteAtual.margemEstimada !== null ? moeda(loteAtual.margemEstimada) : "—"}
                      </span>
                    </div>
                    {despesasLote.data?.filter((d) => (d.lote?.trim() || "") === loteAtual.nome)
                      .length ? (
                      <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs">
                        {despesasLote.data
                          .filter((d) => (d.lote?.trim() || "") === loteAtual.nome)
                          .slice(0, 8)
                          .map((d) => (
                            <li key={d.id} className="flex items-center justify-between gap-2">
                              <span className="truncate text-muted-foreground">
                                {dataCurta(d.data)} · {d.descricao || d.categoria || "Custo"}
                              </span>
                              <span className="shrink-0 font-medium">{moeda(Number(d.valor))}</span>
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm font-semibold">Entrada do lote</p>
                    <div className="mt-2 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Data de entrada</span>
                        <span className="font-semibold">
                          {loteAtual.dataEntrada ? dataCurta(loteAtual.dataEntrada) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Peso médio inicial</span>
                        <span className="font-semibold">
                          {loteAtual.pesoInicialMedio !== null
                            ? pesoTexto(loteAtual.pesoInicialMedio, prefs.unidade_peso)
                            : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Peso total na entrada</span>
                        <span className="font-semibold">
                          {loteAtual.pesoTotalEntrada !== null
                            ? pesoTexto(loteAtual.pesoTotalEntrada, prefs.unidade_peso)
                            : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Custo total da compra</span>
                        <span className="font-semibold">{moeda(loteAtual.custoCompra)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Preço médio / cabeça</span>
                        <span className="font-semibold">
                          {loteAtual.precoMedioPorCabeca !== null
                            ? moeda(loteAtual.precoMedioPorCabeca)
                            : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Peso/data de entrada vêm da primeira pesagem de cada animal do lote; o custo
                      da compra entra por "Registrar custo" com a categoria "Compra do lote".
                    </p>
                  </div>

                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm font-semibold">Alimentação diária</p>
                    {ultimaAlimentacao ? (
                      <div className="mt-2 space-y-2 text-xs">
                        <p className="text-muted-foreground">
                          Último registro — {dataCurta(ultimaAlimentacao.data)}
                          {ultimaAlimentacao.lote === null ? (
                            <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              todo o rebanho
                            </span>
                          ) : null}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Forragem nativa</span>
                          <span className="font-semibold">
                            {ultimaAlimentacao.forragem_kg !== null
                              ? `${Number(ultimaAlimentacao.forragem_kg).toLocaleString("pt-BR")} kg/dia`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Silagem</span>
                          <span className="font-semibold">
                            {ultimaAlimentacao.silagem_kg !== null
                              ? `${Number(ultimaAlimentacao.silagem_kg).toLocaleString("pt-BR")} kg/dia`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Ração concentrada</span>
                          <span className="font-semibold">
                            {ultimaAlimentacao.racao_kg !== null
                              ? `${Number(ultimaAlimentacao.racao_kg).toLocaleString("pt-BR")} kg/dia`
                              : "—"}
                          </span>
                        </div>
                        {ultimaAlimentacao.outro_kg !== null ? (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              {ultimaAlimentacao.outro_descricao || "Outro"}
                            </span>
                            <span className="font-semibold">
                              {Number(ultimaAlimentacao.outro_kg).toLocaleString("pt-BR")} kg/dia
                            </span>
                          </div>
                        ) : null}
                        {ultimaAlimentacao.custo_dia !== null ? (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Custo do dia</span>
                            <span className="font-semibold">
                              {moeda(Number(ultimaAlimentacao.custo_dia))}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Nenhuma alimentação registrada ainda para este lote.
                      </p>
                    )}

                    <div className="mt-3 space-y-1.5">
                      <Label htmlFor="peso-meta-abate" className="text-xs">
                        Peso de abate (meta, kg/cabeça) — pra estimar a saída
                      </Label>
                      <Input
                        id="peso-meta-abate"
                        type="number"
                        step="1"
                        min="0"
                        className="h-8 bg-card text-xs"
                        value={pesoMetaAbate}
                        onChange={(ev) => setPesoMetaAbate(ev.target.value)}
                        placeholder="Ex: 480"
                      />
                    </div>
                    {projecao ? (
                      <div className="mt-3 space-y-2 rounded-md bg-card px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Permanência estimada</span>
                          <span className="font-semibold">
                            {projecao.diasRestantes} dia(s) restante(s)
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Previsão de saída</span>
                          <span className="font-semibold">{dataCurta(projecao.previsaoSaida)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Custo final projetado</span>
                          <span className="font-semibold">
                            {moeda(projecao.custoFinalProjetado)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Custo final / cabeça</span>
                          <span className="font-semibold">
                            {moeda(projecao.custoFinalPorCabeca)}
                          </span>
                        </div>
                      </div>
                    ) : pesoMetaAbate ? (
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Informe uma meta maior que o peso atual e registre ao menos duas pesagens do
                        lote para calcular a projeção.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPesagemLoteAberto(true)}>
                    Registrar pesagem do lote
                  </Button>
                  {loteAtual.nome !== SEM_LOTE ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setCustoLoteAberto(true)}>
                        Registrar custo (ração/sanidade)
                      </Button>
                      <Button size="sm" onClick={() => setVenderLoteAberto(true)}>
                        <Coins className="size-4" aria-hidden="true" />
                        Vender lote
                      </Button>
                    </>
                  ) : (
                    <p className="w-full text-xs text-muted-foreground">
                      Esses animais não têm um lote definido — dê um nome de lote a eles no Rebanho
                      para registrar custo ou vender em conjunto.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            <DialogPesagemLote
              aberto={pesagemLoteAberto}
              onFechar={() => setPesagemLoteAberto(false)}
              lote={loteAtual}
              fazendaId={fazenda?.id}
              onSalvo={invalidarEngordaGeral}
            />
            <DialogCustoLote
              aberto={custoLoteAberto}
              onFechar={() => setCustoLoteAberto(false)}
              lote={loteAtual?.nome ?? null}
              fazendaId={fazenda?.id}
              onSalvo={invalidarEngordaGeral}
            />
            <DialogVenderLote
              aberto={venderLoteAberto}
              onFechar={() => setVenderLoteAberto(false)}
              lote={loteAtual}
              fazendaId={fazenda?.id}
              precoSugerido={precoVigente ? Number(precoVigente.valor) : null}
              moeda={moeda}
              onSalvo={invalidarEngordaGeral}
            />
          </TabsContent>

          <TabsContent value="animal" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">Venda avulsa</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pra vender um animal (ou peso avulso) com um preço diferente do vigente — se
                escolher um animal do lote, ele já fecha como "vendido" automaticamente.
              </p>

              {mostrarFormVendaAvulsa ? (
                <form
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    salvarVendaAvulsa.mutate();
                  }}
                >
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="venda-boi-animal">Animal (opcional)</Label>
                    <select
                      id="venda-boi-animal"
                      value={vendaAnimalId}
                      onChange={(ev) => selecionarAnimalVenda(ev.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Sem animal específico</option>
                      {animais.data?.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome}
                          {a.brinco ? ` (${a.brinco})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="venda-boi-peso">Peso na saída (kg)</Label>
                    <Input
                      id="venda-boi-peso"
                      type="number"
                      step="0.1"
                      min="0"
                      value={vendaAvulsaPeso}
                      onChange={(ev) => setVendaAvulsaPeso(ev.target.value)}
                      required
                    />
                    {arrobasVendaAvulsa > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        ≈ {arrobasVendaAvulsa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                        @
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="venda-boi-preco">Preço (R$/@)</Label>
                    <Input
                      id="venda-boi-preco"
                      type="number"
                      step="0.01"
                      min="0"
                      value={vendaAvulsaPreco}
                      onChange={(ev) => setVendaAvulsaPreco(ev.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="venda-boi-comprador">Comprador</Label>
                    <Input
                      id="venda-boi-comprador"
                      value={vendaAvulsaComprador}
                      onChange={(ev) => setVendaAvulsaComprador(ev.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="venda-boi-data">Data</Label>
                    <Input
                      id="venda-boi-data"
                      type="date"
                      value={vendaAvulsaData}
                      onChange={(ev) => setVendaAvulsaData(ev.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Pagamento</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={vendaAvulsaPago ? "outline" : "default"}
                        onClick={() => setVendaAvulsaPago(false)}
                      >
                        A receber
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={vendaAvulsaPago ? "default" : "outline"}
                        onClick={() => setVendaAvulsaPago(true)}
                      >
                        Pago agora
                      </Button>
                    </div>
                  </div>

                  {vendaAvulsaPago ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="venda-boi-forma-pagamento">Forma de pagamento</Label>
                      <select
                        id="venda-boi-forma-pagamento"
                        value={vendaAvulsaFormaPagamento}
                        onChange={(ev) => setVendaAvulsaFormaPagamento(ev.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="dinheiro">Dinheiro</option>
                        <option value="pix">Pix</option>
                        <option value="cartao">Cartão</option>
                        <option value="boleto">Boleto</option>
                        <option value="transferencia">Transferência</option>
                      </select>
                    </div>
                  ) : null}

                  {vendaAvulsaPago && vendaAvulsaFormaPagamento === "cartao" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="venda-boi-parcelas">Parcelas</Label>
                      <select
                        id="venda-boi-parcelas"
                        value={vendaAvulsaParcelas}
                        onChange={(ev) => setVendaAvulsaParcelas(ev.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {[1, 2, 3].map((n) => (
                          <option key={n} value={n}>
                            {n}x de {moeda(vendaAvulsaTotal / n)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit" size="sm" disabled={salvarVendaAvulsa.isPending}>
                      <Coins className="size-4" aria-hidden="true" />
                      Registrar venda
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMostrarFormVendaAvulsa(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setMostrarFormVendaAvulsa(true)}
                >
                  Registrar venda avulsa
                </Button>
              )}
            </div>

            <form
              className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                registrar.mutate({ animalId, peso, data });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="animal-engorda">Animal</Label>
                <select
                  id="animal-engorda"
                  value={animalId}
                  onChange={(ev) => setAnimalId(ev.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">Selecione</option>
                  {animais.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                      {a.brinco ? ` (${a.brinco})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-pesagem">Data</Label>
                <Input
                  id="data-pesagem"
                  type="date"
                  value={data}
                  onChange={(ev) => setData(ev.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="peso-pesagem">Peso (kg)</Label>
                <Input
                  id="peso-pesagem"
                  type="number"
                  step="0.1"
                  min="0"
                  value={peso}
                  onChange={(ev) => setPeso(ev.target.value)}
                  required
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={registrar.isPending}>
                  <Plus className="size-4" aria-hidden="true" />
                  Registrar pesagem
                </Button>
              </div>
            </form>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                  Lote em engorda
                </div>
                <ul className="divide-y divide-border">
                  {animais.data?.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <span>
                        {a.nome}
                        {a.brinco ? (
                          <span className="text-muted-foreground"> ({a.brinco})</span>
                        ) : null}
                      </span>
                      <span className="font-semibold">
                        {pesoTexto(a.peso_kg, prefs.unidade_peso)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                  Últimas pesagens
                </div>
                {(pesagens.data?.length ?? 0) === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Nenhuma pesagem registrada ainda.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {pesagens.data?.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <span>
                          {dataCurta(p.data)} ·{" "}
                          <span className="text-muted-foreground">
                            {(p as { animais?: { nome?: string } }).animais?.nome ?? "Rebanho"}
                          </span>
                        </span>
                        <span className="font-semibold">
                          {p.valor !== null ? pesoTexto(Number(p.valor), prefs.unidade_peso) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function Kpi({
  icon: Icon,
  rotulo,
  valor,
}: {
  icon: typeof Weight;
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-2 text-[11px] text-muted-foreground">{rotulo}</p>
      <p className="font-display text-lg font-extrabold">{valor}</p>
    </div>
  );
}

interface LoteResumo {
  nome: string;
  animais: { id: string; nome: string; brinco: string | null; peso_kg: number | string | null }[];
  qtd: number;
  pesoMedio: number;
  pesoTotal: number;
  arrobasTotais: number;
}

function DialogPesagemLote({
  aberto,
  onFechar,
  lote,
  fazendaId,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  lote: LoteResumo | null;
  fazendaId: string | undefined;
  onSalvo: () => void;
}) {
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [data, setData] = useState(hojeISO());

  useEffect(() => {
    if (aberto && lote) {
      const iniciais: Record<string, string> = {};
      for (const a of lote.animais) iniciais[a.id] = a.peso_kg ? String(a.peso_kg) : "";
      setPesos(iniciais);
      setData(hojeISO());
    }
  }, [aberto, lote]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!lote || !fazendaId) return;
      const pesagensValidas = lote.animais
        .map((a) => ({ animalId: a.id, peso: Number(pesos[a.id] ?? "") }))
        .filter((p) => p.peso > 0);
      if (pesagensValidas.length === 0) throw new Error("Informe ao menos um peso maior que zero.");
      const { error } = await db.engorda.registrarPesagemLote({
        fazendaId,
        data,
        pesagens: pesagensValidas,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Pesagens do lote registradas.");
      onSalvo();
      onFechar();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não conseguimos registrar as pesagens."),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" key={lote?.nome}>
        <DialogHeader>
          <DialogTitle>Registrar pesagem do lote</DialogTitle>
          <DialogDescription>
            {lote
              ? `${lote.nome} — ${lote.qtd} animais. Ajuste o peso de cada um antes de salvar.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {lote ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="data-pesagem-lote">Data</Label>
              <Input
                id="data-pesagem-lote"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {lote.animais.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {a.nome}
                    {a.brinco ? <span className="text-muted-foreground"> ({a.brinco})</span> : null}
                  </span>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-28"
                    value={pesos[a.id] ?? ""}
                    onChange={(e) => setPesos((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    aria-label={`Peso de ${a.nome}`}
                  />
                </li>
              ))}
            </ul>
            <DialogFooter className="mt-3">
              <Button variant="outline" type="button" onClick={onFechar}>
                Cancelar
              </Button>
              <Button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
                {salvar.isPending ? "Salvando..." : "Salvar pesagens"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DialogCustoLote({
  aberto,
  onFechar,
  lote,
  fazendaId,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  lote: string | null;
  fazendaId: string | undefined;
  onSalvo: () => void;
}) {
  const salvar = useMutation({
    mutationFn: async (form: FormData) => {
      if (!lote || !fazendaId) return;
      const categoria = String(form.get("categoria") ?? "outro");
      const { error } = await db.from("financeiro_lancamentos").insert({
        fazenda_id: fazendaId,
        tipo: "despesa",
        descricao:
          String(form.get("descricao") ?? "").trim() || `Custo do lote ${lote} (${categoria})`,
        valor: Number(form.get("valor")),
        data: String(form.get("data")),
        categoria,
        lote,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Custo do lote registrado.");
      onSalvo();
      onFechar();
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent key={lote}>
        <DialogHeader>
          <DialogTitle>Registrar custo do lote</DialogTitle>
          <DialogDescription>
            {lote ? `Entra como despesa do lote "${lote}" e conta no cálculo da margem.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          id="form-custo-lote"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate(new FormData(e.currentTarget));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="custo-categoria">Categoria</Label>
            <select
              id="custo-categoria"
              name="categoria"
              defaultValue="racao"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="compra">Compra do lote</option>
              <option value="racao">Ração</option>
              <option value="sanidade">Sanidade</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custo-valor">Valor (R$)</Label>
            <Input id="custo-valor" name="valor" type="number" step="0.01" min="0" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custo-data">Data</Label>
            <Input id="custo-data" name="data" type="date" defaultValue={hojeISO()} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custo-descricao">Descrição (opcional)</Label>
            <Input id="custo-descricao" name="descricao" placeholder="Ex: Ração 20 sacos" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-custo-lote" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando..." : "Salvar custo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogVenderLote({
  aberto,
  onFechar,
  lote,
  fazendaId,
  precoSugerido,
  moeda,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  lote: LoteResumo | null;
  fazendaId: string | undefined;
  precoSugerido: number | null;
  moeda: (v: number | null | undefined) => string;
  onSalvo: () => void;
}) {
  const [preco, setPreco] = useState("");
  const [comprador, setComprador] = useState("");
  const [data, setData] = useState(hojeISO());
  const [pago, setPago] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState("dinheiro");

  useEffect(() => {
    if (aberto) {
      setPreco(precoSugerido ? String(precoSugerido) : "");
      setComprador("");
      setData(hojeISO());
      setPago(false);
      setFormaPagamento("dinheiro");
    }
  }, [aberto, precoSugerido]);

  const valorEstimado = lote && Number(preco) > 0 ? lote.arrobasTotais * Number(preco) : 0;

  const salvar = useMutation({
    mutationFn: async () => {
      if (!lote || !fazendaId) return;
      const { error } = await db.engorda.registrarVendaLote({
        fazendaId,
        lote: lote.nome,
        precoUnitario: Number(preco),
        comprador: comprador.trim() || null,
        data,
        pago,
        formaPagamento,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Venda do lote registrada — todos os animais foram marcados como vendidos.");
      onSalvo();
      onFechar();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não conseguimos registrar a venda."),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent key={lote?.nome}>
        <DialogHeader>
          <DialogTitle>Vender lote</DialogTitle>
          <DialogDescription>
            {lote
              ? `${lote.nome} — ${lote.qtd} animais, ${lote.arrobasTotais.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} @ no total. Todos serão marcados como vendidos.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          id="form-vender-lote"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="vl-preco">Preço (R$/@)</Label>
            <Input
              id="vl-preco"
              type="number"
              step="0.01"
              min="0"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              required
            />
            {valorEstimado > 0 ? (
              <p className="text-xs text-muted-foreground">
                Valor total estimado: {moeda(valorEstimado)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vl-comprador">Comprador</Label>
            <Input
              id="vl-comprador"
              value={comprador}
              onChange={(e) => setComprador(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vl-data">Data</Label>
            <Input
              id="vl-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Pagamento</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={pago ? "outline" : "default"}
                onClick={() => setPago(false)}
              >
                A receber
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pago ? "default" : "outline"}
                onClick={() => setPago(true)}
              >
                Pago agora
              </Button>
            </div>
          </div>
          {pago ? (
            <div className="space-y-1.5">
              <Label htmlFor="vl-forma-pagamento">Forma de pagamento</Label>
              <select
                id="vl-forma-pagamento"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="cartao">Cartão</option>
                <option value="boleto">Boleto</option>
                <option value="transferencia">Transferência</option>
              </select>
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-vender-lote" disabled={salvar.isPending}>
            {salvar.isPending ? "Registrando..." : "Confirmar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TipoAlimento = "forragem" | "silagem" | "racao" | "outro";

interface EstadoTipoAlimento {
  ativo: boolean;
  kg: string;
  descricao: string;
}

const TIPOS_ALIMENTO: {
  chave: TipoAlimento;
  rotulo: string;
  coluna: "forragem_kg" | "silagem_kg" | "racao_kg" | "outro_kg";
}[] = [
  { chave: "forragem", rotulo: "Forragem nativa", coluna: "forragem_kg" },
  { chave: "silagem", rotulo: "Silagem", coluna: "silagem_kg" },
  { chave: "racao", rotulo: "Ração concentrada", coluna: "racao_kg" },
  { chave: "outro", rotulo: "Outro", coluna: "outro_kg" },
];

function DialogAlimentacaoLote({
  aberto,
  onFechar,
  loteInicial,
  lotesDisponiveis,
  fazendaId,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  loteInicial: string | null;
  lotesDisponiveis: string[];
  fazendaId: string | undefined;
  onSalvo: () => void;
}) {
  const [data, setData] = useState(hojeISO());
  const [escopo, setEscopo] = useState<"rebanho" | "lotes">("lotes");
  const [lotesSelecionados, setLotesSelecionados] = useState<string[]>([]);
  const [tipos, setTipos] = useState<Record<TipoAlimento, EstadoTipoAlimento>>({
    forragem: { ativo: false, kg: "", descricao: "" },
    silagem: { ativo: false, kg: "", descricao: "" },
    racao: { ativo: false, kg: "", descricao: "" },
    outro: { ativo: false, kg: "", descricao: "" },
  });
  const [custoDia, setCustoDia] = useState("");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (aberto) {
      setData(hojeISO());
      setEscopo("lotes");
      setLotesSelecionados(loteInicial ? [loteInicial] : []);
      setTipos({
        forragem: { ativo: false, kg: "", descricao: "" },
        silagem: { ativo: false, kg: "", descricao: "" },
        racao: { ativo: false, kg: "", descricao: "" },
        outro: { ativo: false, kg: "", descricao: "" },
      });
      setCustoDia("");
      setObservacoes("");
    }
  }, [aberto, loteInicial]);

  function alternarTipo(chave: TipoAlimento) {
    setTipos((prev) => ({ ...prev, [chave]: { ...prev[chave], ativo: !prev[chave].ativo } }));
  }
  function atualizarTipo(chave: TipoAlimento, campo: "kg" | "descricao", valor: string) {
    setTipos((prev) => ({ ...prev, [chave]: { ...prev[chave], [campo]: valor } }));
  }
  function alternarLote(nome: string) {
    setLotesSelecionados((prev) =>
      prev.includes(nome) ? prev.filter((l) => l !== nome) : [...prev, nome],
    );
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!fazendaId) return;

      const ativos = TIPOS_ALIMENTO.filter(
        (t) => tipos[t.chave].ativo && Number(tipos[t.chave].kg) > 0,
      );
      if (ativos.length === 0) {
        throw new Error("Marque ao menos um tipo de alimento e informe a quantidade (kg/dia).");
      }
      if (ativos.some((t) => t.chave === "outro") && !tipos.outro.descricao.trim()) {
        throw new Error('Descreva o que é o alimento marcado como "Outro".');
      }

      const lotesAlvo: (string | null)[] = escopo === "rebanho" ? [null] : lotesSelecionados;
      if (lotesAlvo.length === 0) {
        throw new Error('Selecione ao menos um lote, ou escolha "Todo o rebanho".');
      }

      const custo = custoDia ? Number(custoDia) : 0;
      // Custo informado pra "todo o rebanho" não é de nenhum lote específico
      // (lançamento sem lote); pra vários lotes selecionados, divide o custo
      // igualmente entre eles — assim o total lançado nunca passa do custo
      // informado, mesmo marcando mais de um lote na mesma rotina.
      const custoPorLote =
        escopo === "lotes" && lotesAlvo.length > 0 ? custo / lotesAlvo.length : custo;

      const camposAlimento: Record<string, number | string | null> = {
        forragem_kg: null,
        silagem_kg: null,
        racao_kg: null,
        outro_kg: null,
        outro_descricao: null,
      };
      for (const t of ativos) {
        camposAlimento[t.coluna] = Number(tipos[t.chave].kg);
        if (t.chave === "outro") camposAlimento["outro_descricao"] = tipos.outro.descricao.trim();
      }

      for (const loteAlvo of lotesAlvo) {
        const { error } = await db.from("alimentacao_lote").insert({
          fazenda_id: fazendaId,
          lote: loteAlvo,
          data,
          ...camposAlimento,
          custo_dia: custo > 0 ? custoPorLote : null,
          observacoes: observacoes.trim() || null,
        } as never);
        if (error) throw error;
      }

      // Custo do dia também entra como despesa (igual ao fluxo manual de
      // "Registrar custo"), uma por lote — ou uma só, sem lote, quando a
      // rotina vale pro rebanho todo — assim já soma no custo acumulado e
      // na margem estimada sem precisar lançar duas vezes.
      if (custo > 0) {
        for (const loteAlvo of lotesAlvo) {
          const descricaoAlvo = loteAlvo ? `lote ${loteAlvo}` : "todo o rebanho";
          const { error: erroDespesa } = await db.from("financeiro_lancamentos").insert({
            fazenda_id: fazendaId,
            tipo: "despesa",
            descricao: `Alimentação — ${descricaoAlvo} (${dataCurta(data)})`,
            valor: custoPorLote,
            data,
            categoria: "racao",
            lote: loteAlvo,
          } as never);
          if (erroDespesa) throw erroDespesa;
        }
      }
    },
    onSuccess: () => {
      toast.success("Rotina de alimentação registrada.");
      onSalvo();
      onFechar();
    },
    onError: (erro: Error) =>
      toast.error(erro.message || "Não conseguimos salvar agora. Tente novamente."),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rotina de alimentação</DialogTitle>
          <DialogDescription>
            Registre quanto cada tipo de alimento é oferecido por dia — pro rebanho todo ou só pra
            lotes específicos. Se informar o custo do dia, ele também entra como despesa.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="alim-data">Data</Label>
            <Input
              id="alim-data"
              type="date"
              value={data}
              onChange={(ev) => setData(ev.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Essa rotina vale para</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={escopo === "rebanho" ? "default" : "outline"}
                onClick={() => setEscopo("rebanho")}
              >
                Todo o rebanho
              </Button>
              <Button
                type="button"
                size="sm"
                variant={escopo === "lotes" ? "default" : "outline"}
                onClick={() => setEscopo("lotes")}
              >
                Selecionar lotes
              </Button>
            </div>
          </div>

          {escopo === "lotes" ? (
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-semibold">Lotes desta rotina</p>
              {lotesDisponiveis.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Nenhum lote disponível ainda.</p>
              ) : (
                <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
                  {lotesDisponiveis.map((nome) => (
                    <li key={nome} className="flex items-center gap-2">
                      <Checkbox
                        id={`alim-lote-${nome}`}
                        checked={lotesSelecionados.includes(nome)}
                        onCheckedChange={() => alternarLote(nome)}
                      />
                      <Label htmlFor={`alim-lote-${nome}`} className="text-xs font-normal">
                        {nome}
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Alimentos oferecidos</Label>
            {TIPOS_ALIMENTO.map((t) => (
              <div
                key={t.chave}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
              >
                <Checkbox
                  id={`alim-tipo-${t.chave}`}
                  checked={tipos[t.chave].ativo}
                  onCheckedChange={() => alternarTipo(t.chave)}
                />
                <Label htmlFor={`alim-tipo-${t.chave}`} className="min-w-28 text-sm font-normal">
                  {t.rotulo}
                </Label>
                {tipos[t.chave].ativo ? (
                  <>
                    {t.chave === "outro" ? (
                      <Input
                        value={tipos.outro.descricao}
                        onChange={(ev) => atualizarTipo("outro", "descricao", ev.target.value)}
                        placeholder="O que é?"
                        className="h-8 w-32 text-xs"
                      />
                    ) : null}
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={tipos[t.chave].kg}
                      onChange={(ev) => atualizarTipo(t.chave, "kg", ev.target.value)}
                      placeholder="kg/dia"
                      className="h-8 w-24 text-xs"
                    />
                  </>
                ) : null}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alim-custo">Custo do dia (R$, opcional)</Label>
            <Input
              id="alim-custo"
              type="number"
              step="0.01"
              min="0"
              value={custoDia}
              onChange={(ev) => setCustoDia(ev.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alim-observacoes">Observações (opcional)</Label>
            <Input
              id="alim-observacoes"
              value={observacoes}
              onChange={(ev) => setObservacoes(ev.target.value)}
              placeholder="Opcional"
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Salvando..." : "Salvar rotina"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
