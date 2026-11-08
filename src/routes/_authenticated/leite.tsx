import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Baby,
  Beef,
  ChevronDown,
  Coins,
  Droplet,
  Milk,
  Percent,
  Plus,
  Skull,
  Tag,
  Trash2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { CATEGORIAS_BOVINO } from "@/lib/especies";
import { AppShell } from "@/components/AppShell";
import { CartaoConfig } from "@/components/config/CartaoConfig";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFazenda } from "@/hooks/use-fazenda";
import { cn } from "@/lib/utils";
import { useIndicesRebanho } from "@/hooks/use-indices-rebanho";
import { dataCurta, dataISO, diasAtrasISO, hojeISO, moeda as formatarMoeda } from "@/lib/formato";
import { rotuloTurno } from "@/lib/rotulos";
import { usePreferencias } from "@/hooks/use-preferencias";
import { PRODUTOS_LEITE, rotuloProduto, unidadeProduto } from "@/lib/produtos-leite";
import { encontrarPrecoVigente } from "@/lib/precos-produto";
import { SecaoDerivados } from "@/components/leite/SecaoDerivados";

const CONSUMO_TIPOS = [
  { valor: "bezerros", rotulo: "Bezerros" },
  { valor: "consumo_familiar", rotulo: "Consumo familiar" },
  { valor: "derivados", rotulo: "Derivados" },
  { valor: "outros", rotulo: "Outros" },
] as const;

const DERIVADOS = PRODUTOS_LEITE.filter((p) => p.valor !== "leite");

/** Rótulos usados antes desta tela existir — mapeia pro novo tipo de consumo. */
const MIGRAR_TIPO_CONSUMO: Record<string, (typeof CONSUMO_TIPOS)[number]["valor"]> = {
  queijo: "derivados",
  consumo: "consumo_familiar",
  outro: "outros",
};

const FORMAS_PAGAMENTO = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "transferencia", rotulo: "Transferência" },
] as const;

export const Route = createFileRoute("/_authenticated/leite")({
  head: () => ({
    meta: [
      { title: "Leite — Curral Online" },
      { name: "description", content: "Registro diário da produção de leite da fazenda." },
      { property: "og:title", content: "Leite — Curral Online" },
      { property: "og:description", content: "Registro diário da produção de leite." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Leite,
});

function Leite() {
  const prefs = usePreferencias();
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);
  const { data: fazenda } = useFazenda();
  const indices = useIndicesRebanho(fazenda?.id, CATEGORIAS_BOVINO);
  const queryClient = useQueryClient();
  const hoje = hojeISO();
  const [todosIndices, setTodosIndices] = useState(false);
  const [modoRegistro, setModoRegistro] = useState<"vaca" | "lote">("vaca");
  const [data, setData] = useState(hoje);
  const [litros, setLitros] = useState("");
  const [turno, setTurno] = useState("manha");
  const [animalId, setAnimalId] = useState("");
  const [loteData, setLoteData] = useState(hoje);
  const [loteSelecionado, setLoteSelecionado] = useState("");
  const [loteLitros, setLoteLitros] = useState("");
  const [loteObservacao, setLoteObservacao] = useState("");
  const [loteTurno, setLoteTurno] = useState("manha");
  const [excluindoRegistro, setExcluindoRegistro] = useState<{
    id: string;
    texto: string;
  } | null>(null);

  // Derivados (queijo, manteiga...) têm seção própria lá embaixo; o
  // formulário de cima é só a ordenha.
  const produtosTrabalhados = fazenda?.produtos_leite?.length ? fazenda.produtos_leite : ["leite"];

  const registros = useQuery({
    queryKey: ["leite", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("producao_leite")
        .select("*, animais(nome)")
        .eq("fazenda_id", fazenda!.id)
        .order("data", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  // A lista acima é só "os últimos registros"; os números do dia e o
  // gráfico precisam de tudo do período, senão uma fazenda com muitas vacas
  // (60+ registros por dia) via o total de hoje cortado.
  const ultimos30Dias = useQuery({
    queryKey: ["leite-30d", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("producao_leite")
        .select("id, data, litros, produto, animal_id, lote")
        .eq("fazenda_id", fazenda!.id)
        .gte("data", diasAtrasISO(29))
        .order("data", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const excluirRegistro = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("producao_leite").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro excluído.");
      setExcluindoRegistro(null);
      queryClient.invalidateQueries({ queryKey: ["leite"] });
      queryClient.invalidateQueries({ queryKey: ["leite-30d"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["indices-rebanho"] });
      queryClient.invalidateQueries({ queryKey: ["ficha-leite"] });
    },
    onError: () => toast.error("Não conseguimos excluir agora. Tente novamente."),
  });

  // ---- Animais compatíveis com ordenha (status "lactacao") e lotes existentes ----
  const animaisLactantes = useQuery({
    queryKey: ["animais-lactantes", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("id, nome, brinco, categoria")
        .eq("fazenda_id", fazenda!.id)
        .eq("status", "lactacao")
        .order("nome");
      if (error) throw error;
      return (data ?? []).filter((a) => CATEGORIAS_BOVINO.includes(a.categoria ?? ""));
    },
  });

  const lotesDoRebanho = useQuery({
    queryKey: ["lotes-rebanho", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("lote, status, categoria")
        .eq("fazenda_id", fazenda!.id);
      if (error) throw error;
      return (data ?? []).filter((a) => CATEGORIAS_BOVINO.includes(a.categoria ?? ""));
    },
  });

  // Só lotes com animal em lactação ou seca (mesmo critério de "vaca
  // leiteira" já usado no modo "Por vaca", acima) — um lote só de bezerros,
  // engorda etc. não entra aqui, porque ele não produz leite.
  const lotesDisponiveis = Array.from(
    new Set(
      (lotesDoRebanho.data ?? [])
        .filter((a) => a.status === "lactacao" || a.status === "seca")
        .map((a) => String(a.lote ?? "").trim())
        .filter((l) => l.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const salvar = useMutation({
    mutationFn: async () => {
      if (modoRegistro === "vaca") {
        const { error } = await db.from("producao_leite").insert({
          fazenda_id: fazenda!.id,
          animal_id: animalId || null,
          data,
          litros: Number(litros),
          turno,
          produto: "leite",
        } as never);
        if (error) throw error;
      } else {
        const { error } = await db.from("producao_leite").insert({
          fazenda_id: fazenda!.id,
          lote: loteSelecionado,
          data: loteData,
          litros: Number(loteLitros),
          turno: loteTurno,
          produto: "leite",
          observacoes: loteObservacao.trim() || null,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Produção registrada.");
      setLitros("");
      setAnimalId("");
      setLoteLitros("");
      setLoteObservacao("");
      queryClient.invalidateQueries({ queryKey: ["leite"] });
      queryClient.invalidateQueries({ queryKey: ["leite-30d"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["indices-rebanho"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  const leite30d = (ultimos30Dias.data ?? []).filter((r) => r.produto === "leite");
  const registrosLeite = (registros.data ?? []).filter((r) => (r.produto ?? "leite") === "leite");
  const registrosHoje = leite30d.filter((r) => dataISO(r.data) === hoje);
  const totalHoje = registrosHoje.reduce((s, r) => s + Number(r.litros), 0);

  const porDia = useMemo(() => {
    const mapa = new Map<string, number>();
    for (let d = 29; d >= 0; d--) mapa.set(diasAtrasISO(d), 0);
    for (const r of leite30d) {
      const dia = dataISO(r.data);
      if (mapa.has(dia)) mapa.set(dia, (mapa.get(dia) ?? 0) + Number(r.litros));
    }
    return Array.from(mapa.entries()).map(([dia, litros]) => ({
      dia,
      data: dataCurta(dia).slice(0, 5),
      litros: Math.round(litros * 10) / 10,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimos30Dias.data]);
  const ultimos7 = porDia.slice(-7);
  const diasComProducao7 = ultimos7.filter((d) => d.litros > 0).length;
  const media7Dias =
    diasComProducao7 > 0 ? ultimos7.reduce((s, d) => s + d.litros, 0) / diasComProducao7 : 0;
  const total30Dias = porDia.reduce((s, d) => s + d.litros, 0);
  const temIndividualHoje = registrosHoje.some((r) => r.animal_id);
  const temLoteHoje = registrosHoje.some((r) => r.lote);
  const misturaIndividualELote = temIndividualHoje && temLoteHoje;

  // ---- Preço vigente ---------------------------------------------------
  const precos = useQuery({
    queryKey: ["precos-produto", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("precos_produto")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .eq("produto", "leite")
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
        produto: "leite",
        valor: Number(precoValor),
        unidade: "litro",
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

  // ---- Venda (avulsa com preço manual, ou pro laticínio com preço vigente) ---
  const [mostrarFormVenda, setMostrarFormVenda] = useState(false);
  const [modoVenda, setModoVenda] = useState<"avulsa" | "laticinio">("avulsa");

  const [vendaAvulsaLitros, setVendaAvulsaLitros] = useState("");
  const [vendaAvulsaPreco, setVendaAvulsaPreco] = useState("");
  const [vendaAvulsaComprador, setVendaAvulsaComprador] = useState("");
  const [vendaAvulsaData, setVendaAvulsaData] = useState(hoje);
  const [vendaAvulsaPago, setVendaAvulsaPago] = useState(false);
  const [vendaAvulsaFormaPagamento, setVendaAvulsaFormaPagamento] = useState("dinheiro");
  const [vendaAvulsaParcelas, setVendaAvulsaParcelas] = useState("1");

  const salvarVendaAvulsa = useMutation({
    mutationFn: async () => {
      if (!vendaAvulsaComprador.trim()) {
        throw new Error("Informe o comprador para registrar esta venda.");
      }
      const { error } = await db.leite.registrarVenda({
        fazendaId: fazenda!.id,
        quantidade: Number(vendaAvulsaLitros),
        precoUnitario: Number(vendaAvulsaPreco),
        comprador: vendaAvulsaComprador.trim(),
        data: vendaAvulsaData,
        pago: vendaAvulsaPago,
        formaPagamento: vendaAvulsaFormaPagamento,
        parcelas: vendaAvulsaFormaPagamento === "cartao" ? Number(vendaAvulsaParcelas) || 1 : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Venda avulsa registrada.");
      setMostrarFormVenda(false);
      setVendaAvulsaLitros("");
      setVendaAvulsaPreco("");
      setVendaAvulsaComprador("");
      setVendaAvulsaData(hoje);
      setVendaAvulsaPago(false);
      setVendaAvulsaFormaPagamento("dinheiro");
      setVendaAvulsaParcelas("1");
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: (erro: Error) =>
      toast.error(erro.message || "Não conseguimos registrar a venda avulsa."),
  });

  const vendaAvulsaTotal = (Number(vendaAvulsaLitros) || 0) * (Number(vendaAvulsaPreco) || 0);

  // ---- Venda para laticínio (usa o preço vigente na data da venda) -----
  const [vendaLaticinioLitros, setVendaLaticinioLitros] = useState("");
  const [vendaLaticinioComprador, setVendaLaticinioComprador] = useState("");
  const [vendaLaticinioData, setVendaLaticinioData] = useState(hoje);
  const [vendaLaticinioPago, setVendaLaticinioPago] = useState(false);
  const [vendaLaticinioFormaPagamento, setVendaLaticinioFormaPagamento] = useState("dinheiro");
  const [vendaLaticinioParcelas, setVendaLaticinioParcelas] = useState("1");

  const precoNaDataLaticinio = useMemo(
    () => encontrarPrecoVigente(precos.data, vendaLaticinioData),
    [precos.data, vendaLaticinioData],
  );

  const vendaLaticinioTotal = precoNaDataLaticinio
    ? (Number(vendaLaticinioLitros) || 0) * Number(precoNaDataLaticinio.valor)
    : 0;

  const salvarVendaLaticinio = useMutation({
    mutationFn: async () => {
      if (!precoNaDataLaticinio) {
        throw new Error(
          "Nenhum preço do leite cadastrado para esta data. Atualize o preço do leite antes de registrar a venda.",
        );
      }
      const litrosNum = Number(vendaLaticinioLitros);
      if (!(litrosNum > 0)) {
        throw new Error("Informe uma quantidade maior que zero.");
      }
      const comprador = precoNaDataLaticinio.comprador || vendaLaticinioComprador.trim();
      if (!comprador) {
        throw new Error("Informe o comprador para registrar esta venda.");
      }
      const { error } = await db.leite.registrarVenda({
        fazendaId: fazenda!.id,
        quantidade: litrosNum,
        precoUnitario: Number(precoNaDataLaticinio.valor),
        comprador,
        data: vendaLaticinioData,
        pago: vendaLaticinioPago,
        formaPagamento: vendaLaticinioFormaPagamento,
        parcelas:
          vendaLaticinioFormaPagamento === "cartao" ? Number(vendaLaticinioParcelas) || 1 : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Venda para laticínio registrada.");
      setMostrarFormVenda(false);
      setVendaLaticinioLitros("");
      setVendaLaticinioComprador("");
      setVendaLaticinioData(hoje);
      setVendaLaticinioPago(false);
      setVendaLaticinioFormaPagamento("dinheiro");
      setVendaLaticinioParcelas("1");
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: (erro: Error) => toast.error(erro.message || "Não conseguimos registrar a venda."),
  });

  // ---- Destinação e venda do dia ----------------------------------------
  const destinacoesHoje = useQuery({
    queryKey: ["destinacoes-leite", fazenda?.id, hoje],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("destinacoes_leite")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .eq("data", hoje);
      if (error) throw error;
      return data;
    },
  });

  const vendasHoje = useQuery({
    queryKey: ["vendas", fazenda?.id, hoje],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("vendas")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .eq("data", hoje)
        .eq("produto", "leite");
      if (error) throw error;
      return data;
    },
  });

  type ConsumoEntry = {
    id: string;
    tipo: (typeof CONSUMO_TIPOS)[number]["valor"];
    derivado?: string | undefined;
    nome?: string | undefined;
    quantidade: string;
    // Veio de uma fabricação de derivado: não se edita aqui (excluir a
    // fabricação lá embaixo devolve o leite).
    fixo?: boolean;
  };

  type DescarteEntry = {
    id: string;
    observacao?: string | undefined;
    quantidade: string;
  };

  const [consumoEntries, setConsumoEntries] = useState<ConsumoEntry[]>([]);
  const [mostrarFormConsumo, setMostrarFormConsumo] = useState(false);
  const [consumoTipo, setConsumoTipo] = useState<ConsumoEntry["tipo"]>("bezerros");
  const [consumoDerivado, setConsumoDerivado] = useState<string>(DERIVADOS[0]?.valor ?? "queijo");
  const [consumoNome, setConsumoNome] = useState("");
  const [consumoQuantidade, setConsumoQuantidade] = useState("");

  const [descarteEntries, setDescarteEntries] = useState<DescarteEntry[]>([]);
  const [mostrarFormDescarte, setMostrarFormDescarte] = useState(false);
  const [descarteObservacao, setDescarteObservacao] = useState("");
  const [descarteQuantidade, setDescarteQuantidade] = useState("");

  useEffect(() => {
    if (!destinacoesHoje.data) return;
    const consumo: ConsumoEntry[] = [];
    const descarte: DescarteEntry[] = [];
    for (const d of destinacoesHoje.data) {
      if (d.destino === "venda") continue;
      if (d.destino === "descarte") {
        descarte.push({
          id: d.id,
          observacao: d.observacoes ?? undefined,
          quantidade: String(d.quantidade),
        });
        continue;
      }
      const tipo = (MIGRAR_TIPO_CONSUMO[d.destino] ?? d.destino) as ConsumoEntry["tipo"];
      consumo.push({
        id: d.id,
        tipo,
        derivado: tipo === "derivados" ? (d.observacoes ?? undefined) : undefined,
        nome: tipo === "outros" ? (d.observacoes ?? undefined) : undefined,
        quantidade: String(d.quantidade),
        fixo: !!d.producao_id,
      });
    }
    setConsumoEntries(consumo);
    setDescarteEntries(descarte);
  }, [destinacoesHoje.data]);

  const vendaLitrosHoje = (vendasHoje.data ?? []).reduce((s, v) => s + Number(v.quantidade), 0);
  const totalConsumo = consumoEntries.reduce((s, e) => s + (Number(e.quantidade) || 0), 0);
  const totalDescarte = descarteEntries.reduce((s, e) => s + (Number(e.quantidade) || 0), 0);
  const semDestinacao = totalHoje - vendaLitrosHoje - totalConsumo - totalDescarte;
  const valorGeradoHoje = (vendasHoje.data ?? []).reduce((s, v) => s + Number(v.valor_total), 0);

  function rotuloConsumoEntry(e: ConsumoEntry) {
    const base = CONSUMO_TIPOS.find((t) => t.valor === e.tipo)?.rotulo ?? e.tipo;
    if (e.fixo && e.derivado) return `Fabricação de ${rotuloProduto(e.derivado).toLowerCase()}`;
    if (e.tipo === "derivados" && e.derivado) return `${base} — ${rotuloProduto(e.derivado)}`;
    if (e.tipo === "outros" && e.nome) return e.nome;
    return base;
  }

  function adicionarConsumo() {
    const quantidadeNum = Number(consumoQuantidade);
    if (!(quantidadeNum > 0)) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    if (consumoTipo === "outros" && !consumoNome.trim()) {
      toast.error("Informe o nome do destino.");
      return;
    }
    setConsumoEntries((atual): ConsumoEntry[] => [
      ...atual,
      {
        id: crypto.randomUUID(),
        tipo: consumoTipo,
        derivado: consumoTipo === "derivados" ? consumoDerivado : undefined,
        nome: consumoTipo === "outros" ? consumoNome.trim() : undefined,
        quantidade: consumoQuantidade,
      },
    ]);
    setConsumoQuantidade("");
    setConsumoNome("");
  }

  function removerConsumo(id: string) {
    setConsumoEntries((atual) => atual.filter((e) => e.id !== id));
  }

  function adicionarDescarte() {
    const quantidadeNum = Number(descarteQuantidade);
    if (!(quantidadeNum > 0)) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    setDescarteEntries((atual): DescarteEntry[] => [
      ...atual,
      {
        id: crypto.randomUUID(),
        observacao: descarteObservacao.trim() || undefined,
        quantidade: descarteQuantidade,
      },
    ]);
    setDescarteQuantidade("");
    setDescarteObservacao("");
  }

  function removerDescarte(id: string) {
    setDescarteEntries((atual) => atual.filter((e) => e.id !== id));
  }

  const salvarDestinacao = useMutation({
    mutationFn: async () => {
      const lista = [
        ...(vendaLitrosHoje > 0 ? [{ destino: "venda", quantidade: vendaLitrosHoje }] : []),
        ...consumoEntries
          .filter((e) => !e.fixo)
          .map((e) => ({
            destino: e.tipo,
            quantidade: Number(e.quantidade) || 0,
            observacoes:
              e.tipo === "derivados"
                ? e.derivado
                  ? rotuloProduto(e.derivado)
                  : null
                : e.tipo === "outros"
                  ? e.nome || null
                  : null,
          }))
          .filter((d) => d.quantidade > 0),
        ...descarteEntries
          .map((e) => ({
            destino: "descarte",
            quantidade: Number(e.quantidade) || 0,
            observacoes: e.observacao || null,
          }))
          .filter((d) => d.quantidade > 0),
      ];

      const { error } = await db.leite.registrarDestinacao({
        fazendaId: fazenda!.id,
        data: hoje,
        destinos: lista,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Destinação salva.");
      queryClient.invalidateQueries({ queryKey: ["destinacoes-leite"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: (erro: Error) => toast.error(erro.message || "Não conseguimos salvar a destinação."),
  });

  const i = indices.data;

  return (
    <AppShell titulo="Leite">
      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Registrar produção de leite</h2>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={modoRegistro === "vaca" ? "default" : "outline"}
            onClick={() => setModoRegistro("vaca")}
          >
            Por vaca
          </Button>
          <Button
            type="button"
            size="sm"
            variant={modoRegistro === "lote" ? "default" : "outline"}
            onClick={() => setModoRegistro("lote")}
          >
            Por lote
          </Button>
        </div>

        {misturaIndividualELote ? (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            Hoje já tem produção registrada por vaca e por lote — confira se não é a mesma produção
            contada duas vezes.
          </p>
        ) : null}

        {modoRegistro === "vaca" ? (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="animal">Vaca</Label>
              <select
                id="animal"
                value={animalId}
                onChange={(e) => setAnimalId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                <option value="" disabled>
                  Selecione
                </option>
                {(animaisLactantes.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome || a.brinco || "Sem nome"}
                    {a.nome && a.brinco ? ` (${a.brinco})` : ""}
                  </option>
                ))}
              </select>
              {(animaisLactantes.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma vaca com status "lactação" cadastrada.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="litros">Quantidade (L)</Label>
              <Input
                id="litros"
                type="number"
                step="0.1"
                min="0"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="turno">Turno</Label>
              <select
                id="turno"
                value={turno}
                onChange={(e) => setTurno(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </div>
            <div className="flex items-end sm:col-span-4">
              <Button type="submit" disabled={salvar.isPending}>
                <Plus className="size-4" aria-hidden="true" />
                Registrar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-4">
              Total registrado hoje: {totalHoje.toLocaleString("pt-BR")} L
            </p>
          </form>
        ) : (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="lote">Lote</Label>
              <select
                id="lote"
                value={loteSelecionado}
                onChange={(e) => setLoteSelecionado(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                <option value="" disabled>
                  Selecione
                </option>
                {lotesDisponiveis.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              {lotesDisponiveis.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum lote com vaca em lactação ou seca — defina o lote e a situação no cadastro
                  dos animais.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lote-litros">Quantidade total (L)</Label>
              <Input
                id="lote-litros"
                type="number"
                step="0.1"
                min="0"
                value={loteLitros}
                onChange={(e) => setLoteLitros(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lote-data">Data</Label>
              <Input
                id="lote-data"
                type="date"
                value={loteData}
                onChange={(e) => setLoteData(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lote-turno">Turno</Label>
              <select
                id="lote-turno"
                value={loteTurno}
                onChange={(e) => setLoteTurno(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lote-observacao">Observação</Label>
              <Input
                id="lote-observacao"
                value={loteObservacao}
                onChange={(e) => setLoteObservacao(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="flex items-end sm:col-span-5">
              <Button type="submit" disabled={salvar.isPending || lotesDisponiveis.length === 0}>
                <Plus className="size-4" aria-hidden="true" />
                Registrar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-5">
              Total registrado hoje: {totalHoje.toLocaleString("pt-BR")} L
            </p>
          </form>
        )}
      </div>

      {/* Os 5 números do dia a dia à vista; o resto fica em "Ver todos". */}
      <div className="mb-3 grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        <Kpi icon={Milk} rotulo="Leite hoje" valor={`${totalHoje.toLocaleString("pt-BR")} L`} />
        <Kpi
          icon={Droplet}
          rotulo="Média por dia (7 dias)"
          valor={`${media7Dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`}
        />
        <Kpi
          icon={Droplet}
          rotulo="Média por vaca (último dia)"
          valor={
            i && i.mediaUltimoControle !== null
              ? `${i.mediaUltimoControle.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`
              : "—"
          }
        />
        <Kpi icon={Milk} rotulo="Vacas em lactação" valor={i ? `${i.lactantes}` : "—"} />
        <Kpi
          icon={Percent}
          rotulo="Taxa de prenhes / vacas"
          valor={i ? (i.vacas > 0 ? `${Math.round((i.totalPrenhes / i.vacas) * 100)}%` : "—") : "—"}
        />
      </div>
      <div className="mb-5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setTodosIndices((v) => !v)}
          aria-expanded={todosIndices}
        >
          <ChevronDown
            className={cn("size-4 transition-transform", todosIndices && "rotate-180")}
            aria-hidden="true"
          />
          {todosIndices ? "Ocultar índices" : "Ver todos os índices (8)"}
        </Button>
        {todosIndices ? (
          <div className="mt-3 grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              icon={Percent}
              rotulo="Em lactação / vacas"
              valor={i ? `${i.lactantesVacasPct}%` : "—"}
            />
            <Kpi
              icon={Milk}
              rotulo="Dias em lactação (média)"
              valor={i ? (i.delMedio !== null ? `${i.delMedio} dias` : "—") : "—"}
            />
            <Kpi icon={Beef} rotulo="Total do rebanho" valor={i ? `${i.totalRebanho} cab` : "—"} />
            <Kpi icon={Baby} rotulo="Total de prenhes" valor={i ? `${i.totalPrenhes} cab` : "—"} />
            <Kpi
              icon={Baby}
              rotulo="Partos (últimos 30 dias)"
              valor={i ? `${i.partos30d} cab` : "—"}
            />
            <Kpi
              icon={Skull}
              rotulo="Mortes (últimos 30 dias)"
              valor={i ? `${i.mortes30d} cab` : "—"}
            />
            <Kpi
              icon={Percent}
              rotulo="Lactantes / rebanho"
              valor={i ? `${i.lactantesRebanhoPct}%` : "—"}
            />
            <Kpi
              icon={Droplet}
              rotulo="Total do último controle"
              valor={
                i
                  ? `${i.totalUltimoControle.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`
                  : "—"
              }
            />
          </div>
        ) : null}
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Produção dos últimos 30 dias</h2>
            <span className="text-xs text-muted-foreground">
              Total: {total30Dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
            </span>
          </div>
          {total30Dias > 0 ? (
            <ChartContainer
              config={{ litros: { label: "Litros", color: "var(--primary)" } }}
              className="mt-3 h-48 w-full"
            >
              <BarChart data={porDia}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="data"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  interval={4}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="litros" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              O gráfico aparece assim que houver produção registrada.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Últimos registros
          </div>
          {registrosLeite.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Milk}
                titulo="Nenhuma produção registrada"
                descricao="Registre a primeira ordenha no formulário acima."
              />
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {registrosLeite.map((r) => {
                const nomeVaca = (r as { animais?: { nome?: string } | null }).animais?.nome;
                const origem = r.lote ? `Lote ${r.lote}` : nomeVaca ? nomeVaca : "Rebanho";
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{origem}</span>
                      <span className="block text-xs text-muted-foreground">
                        {dataCurta(r.data)} · {rotuloTurno(r.turno)}
                        {r.produto !== "leite" ? ` · ${rotuloProduto(r.produto)}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="font-semibold">
                        {Number(r.litros).toLocaleString("pt-BR")} {unidadeProduto(r.produto)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label="Excluir registro"
                        onClick={() =>
                          setExcluindoRegistro({
                            id: r.id,
                            texto: `${origem} · ${dataCurta(r.data)} · ${Number(r.litros).toLocaleString("pt-BR")} ${unidadeProduto(r.produto)}`,
                          })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!excluindoRegistro}
        onOpenChange={(v) => !v && setExcluindoRegistro(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este registro de produção?</AlertDialogTitle>
            <AlertDialogDescription>{excluindoRegistro?.texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluindoRegistro && excluirRegistro.mutate(excluindoRegistro.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <h2 className="mb-3 text-base font-semibold">Preço, venda e destino do leite</h2>
      <div className="mb-5 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <CartaoConfig id="preco-leite" titulo="Preço do leite">
          {precoVigente ? (
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                <Tag className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-xl font-extrabold">
                  {moeda(Number(precoVigente.valor))}/L
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
              onSubmit={(e) => {
                e.preventDefault();
                salvarPreco.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="preco-valor">Preço (R$/L)</Label>
                <Input
                  id="preco-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={precoValor}
                  onChange={(e) => setPrecoValor(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preco-comprador">Comprador</Label>
                <Input
                  id="preco-comprador"
                  value={precoComprador}
                  onChange={(e) => setPrecoComprador(e.target.value)}
                  placeholder="Ex: Laticínio X"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preco-data">Vigente a partir de</Label>
                <Input
                  id="preco-data"
                  type="date"
                  value={precoDataInicio}
                  onChange={(e) => setPrecoDataInicio(e.target.value)}
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

          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-base font-semibold">Venda</h3>
            {mostrarFormVenda ? (
              <div className="mt-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={modoVenda === "avulsa" ? "default" : "outline"}
                    onClick={() => setModoVenda("avulsa")}
                  >
                    Venda avulsa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={modoVenda === "laticinio" ? "default" : "outline"}
                    onClick={() => setModoVenda("laticinio")}
                  >
                    Venda para laticínio
                  </Button>
                </div>

                {modoVenda === "avulsa" ? (
                  <form
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      salvarVendaAvulsa.mutate();
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="va-litros">Quantidade (L)</Label>
                      <Input
                        id="va-litros"
                        type="number"
                        step="0.1"
                        min="0"
                        value={vendaAvulsaLitros}
                        onChange={(e) => setVendaAvulsaLitros(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="va-preco">Preço (R$/L)</Label>
                      <Input
                        id="va-preco"
                        type="number"
                        step="0.01"
                        min="0"
                        value={vendaAvulsaPreco}
                        onChange={(e) => setVendaAvulsaPreco(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="va-comprador">Comprador</Label>
                      <Input
                        id="va-comprador"
                        value={vendaAvulsaComprador}
                        onChange={(e) => setVendaAvulsaComprador(e.target.value)}
                        placeholder="Ex: Sítio Vizinho"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="va-data">Data</Label>
                      <Input
                        id="va-data"
                        type="date"
                        value={vendaAvulsaData}
                        onChange={(e) => setVendaAvulsaData(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Total</Label>
                      <p className="font-display text-lg font-extrabold">
                        {moeda(vendaAvulsaTotal)}
                      </p>
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
                        <Label htmlFor="va-forma-pagamento">Forma de pagamento</Label>
                        <select
                          id="va-forma-pagamento"
                          value={vendaAvulsaFormaPagamento}
                          onChange={(e) => setVendaAvulsaFormaPagamento(e.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {FORMAS_PAGAMENTO.map((f) => (
                            <option key={f.valor} value={f.valor}>
                              {f.rotulo}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {vendaAvulsaPago && vendaAvulsaFormaPagamento === "cartao" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="va-parcelas">Parcelas</Label>
                        <select
                          id="va-parcelas"
                          value={vendaAvulsaParcelas}
                          onChange={(e) => setVendaAvulsaParcelas(e.target.value)}
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
                      <Button
                        type="submit"
                        size="sm"
                        disabled={salvarVendaAvulsa.isPending || !vendaAvulsaComprador.trim()}
                      >
                        <Coins className="size-4" aria-hidden="true" />
                        Registrar venda
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setMostrarFormVenda(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      salvarVendaLaticinio.mutate();
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="vl-litros">Quantidade (L)</Label>
                      <Input
                        id="vl-litros"
                        type="number"
                        step="0.1"
                        min="0"
                        value={vendaLaticinioLitros}
                        onChange={(e) => setVendaLaticinioLitros(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vl-preco">Preço vigente (R$/L)</Label>
                      <Input
                        id="vl-preco"
                        readOnly
                        disabled
                        value={
                          precoNaDataLaticinio ? moeda(Number(precoNaDataLaticinio.valor)) : "—"
                        }
                      />
                    </div>

                    {precoNaDataLaticinio?.comprador ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="vl-comprador">Comprador</Label>
                        <Input
                          id="vl-comprador"
                          readOnly
                          disabled
                          value={precoNaDataLaticinio.comprador}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor="vl-comprador">Comprador</Label>
                        <Input
                          id="vl-comprador"
                          value={vendaLaticinioComprador}
                          onChange={(e) => setVendaLaticinioComprador(e.target.value)}
                          placeholder="Ex: Laticínio X"
                          required
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="vl-data">Data</Label>
                      <Input
                        id="vl-data"
                        type="date"
                        value={vendaLaticinioData}
                        onChange={(e) => setVendaLaticinioData(e.target.value)}
                        required
                      />
                    </div>

                    {!precoNaDataLaticinio ? (
                      <p
                        role="alert"
                        className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive sm:col-span-2"
                      >
                        Nenhum preço do leite cadastrado para esta data. Atualize o preço do leite
                        antes de registrar a venda.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        <Label>Total</Label>
                        <p className="font-display text-lg font-extrabold">
                          {moeda(vendaLaticinioTotal)}
                        </p>
                      </div>
                    )}
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Pagamento</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={vendaLaticinioPago ? "outline" : "default"}
                          onClick={() => setVendaLaticinioPago(false)}
                        >
                          A receber
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={vendaLaticinioPago ? "default" : "outline"}
                          onClick={() => setVendaLaticinioPago(true)}
                        >
                          Pago agora
                        </Button>
                      </div>
                    </div>

                    {vendaLaticinioPago ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="vl-forma-pagamento">Forma de pagamento</Label>
                        <select
                          id="vl-forma-pagamento"
                          value={vendaLaticinioFormaPagamento}
                          onChange={(e) => setVendaLaticinioFormaPagamento(e.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {FORMAS_PAGAMENTO.map((f) => (
                            <option key={f.valor} value={f.valor}>
                              {f.rotulo}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {vendaLaticinioPago && vendaLaticinioFormaPagamento === "cartao" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="vl-parcelas">Parcelas</Label>
                        <select
                          id="vl-parcelas"
                          value={vendaLaticinioParcelas}
                          onChange={(e) => setVendaLaticinioParcelas(e.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {[1, 2, 3].map((n) => (
                            <option key={n} value={n}>
                              {n}x de {moeda(vendaLaticinioTotal / n)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <div className="flex gap-2 sm:col-span-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          salvarVendaLaticinio.isPending ||
                          !precoNaDataLaticinio ||
                          !(Number(vendaLaticinioLitros) > 0) ||
                          !(precoNaDataLaticinio?.comprador || vendaLaticinioComprador.trim())
                        }
                      >
                        <Coins className="size-4" aria-hidden="true" />
                        Registrar venda
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setMostrarFormVenda(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <Button
                type="button"
                className="mt-3 w-full sm:w-auto"
                onClick={() => setMostrarFormVenda(true)}
              >
                <Coins className="size-4" aria-hidden="true" />
                Registrar venda
              </Button>
            )}
          </div>
        </CartaoConfig>

        <CartaoConfig id="destinacao-leite" titulo="Destinação de hoje">
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Produzido hoje</p>
              <p className="font-display text-lg font-extrabold">
                {totalHoje.toLocaleString("pt-BR")} L
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vendido hoje</p>
              <p className="font-display text-lg font-extrabold">
                {vendaLitrosHoje.toLocaleString("pt-BR")} L
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Consumo</p>
              <p className="font-display text-lg font-extrabold">
                {totalConsumo.toLocaleString("pt-BR")} L
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Descarte</p>
              <p className="font-display text-lg font-extrabold">
                {totalDescarte.toLocaleString("pt-BR")} L
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sem destinação</p>
              <p className="font-display text-lg font-extrabold">
                {semDestinacao < 0 ? "—" : semDestinacao.toLocaleString("pt-BR")} L
              </p>
            </div>
          </div>

          <p className="mb-3 text-xs text-muted-foreground">
            Gerado hoje:{" "}
            <span className="font-semibold text-success">{moeda(valorGeradoHoje)}</span>
          </p>

          {semDestinacao < 0 ? (
            <p
              role="alert"
              className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              Vendido + consumo + descarte passou {Math.abs(semDestinacao).toLocaleString("pt-BR")}{" "}
              L do que foi produzido hoje — confira as vendas, o consumo e o descarte registrados.
            </p>
          ) : totalHoje > 0 && semDestinacao > 0 ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Falta destinar {semDestinacao.toLocaleString("pt-BR")} L.
            </p>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Venda</p>
                <p className="text-xs text-muted-foreground">Vem das vendas registradas hoje.</p>
              </div>
              <span className="font-display text-sm font-extrabold whitespace-nowrap">
                {vendaLitrosHoje.toLocaleString("pt-BR")} L
              </span>
            </div>

            <div className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Consumo</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-extrabold whitespace-nowrap">
                    {totalConsumo.toLocaleString("pt-BR")} L
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-7"
                    aria-label="Adicionar consumo"
                    onClick={() => setMostrarFormConsumo((v) => !v)}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {consumoEntries.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {consumoEntries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between text-xs">
                      <span>{rotuloConsumoEntry(e)}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium whitespace-nowrap">
                          {Number(e.quantidade).toLocaleString("pt-BR")} L
                        </span>
                        {e.fixo ? null : (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remover"
                            onClick={() => removerConsumo(e.id)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {mostrarFormConsumo ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="consumo-tipo">Tipo</Label>
                    <select
                      id="consumo-tipo"
                      value={consumoTipo}
                      onChange={(e) => setConsumoTipo(e.target.value as ConsumoEntry["tipo"])}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {CONSUMO_TIPOS.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>

                  {consumoTipo === "derivados" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="consumo-derivado">Qual derivado</Label>
                      <select
                        id="consumo-derivado"
                        value={consumoDerivado}
                        onChange={(e) => setConsumoDerivado(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {DERIVADOS.map((d) => (
                          <option key={d.valor} value={d.valor}>
                            {d.rotulo}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {consumoTipo === "outros" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="consumo-nome">Nome do destino</Label>
                      <Input
                        id="consumo-nome"
                        value={consumoNome}
                        onChange={(e) => setConsumoNome(e.target.value)}
                        placeholder="Ex: Doação"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="consumo-quantidade">Quantidade (L)</Label>
                    <Input
                      id="consumo-quantidade"
                      type="number"
                      step="0.1"
                      min="0"
                      value={consumoQuantidade}
                      onChange={(e) => setConsumoQuantidade(e.target.value)}
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <Button type="button" size="sm" onClick={adicionarConsumo}>
                      Adicionar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMostrarFormConsumo(false)}
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Descarte</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-extrabold whitespace-nowrap">
                    {totalDescarte.toLocaleString("pt-BR")} L
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-7"
                    aria-label="Adicionar descarte"
                    onClick={() => setMostrarFormDescarte((v) => !v)}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {descarteEntries.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {descarteEntries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between text-xs">
                      <span>{e.observacao || "Descarte"}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium whitespace-nowrap">
                          {Number(e.quantidade).toLocaleString("pt-BR")} L
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remover"
                          onClick={() => removerDescarte(e.id)}
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {mostrarFormDescarte ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="descarte-motivo">Motivo (opcional)</Label>
                    <Input
                      id="descarte-motivo"
                      value={descarteObservacao}
                      onChange={(e) => setDescarteObservacao(e.target.value)}
                      placeholder="Ex: Mastite, antibiótico"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="descarte-quantidade">Quantidade (L)</Label>
                    <Input
                      id="descarte-quantidade"
                      type="number"
                      step="0.1"
                      min="0"
                      value={descarteQuantidade}
                      onChange={(e) => setDescarteQuantidade(e.target.value)}
                    />
                  </div>

                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Button type="button" size="sm" onClick={adicionarDescarte}>
                      Adicionar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMostrarFormDescarte(false)}
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={salvarDestinacao.isPending || totalHoje === 0}
                onClick={() => salvarDestinacao.mutate()}
              >
                <Coins className="size-4" aria-hidden="true" />
                Salvar destinação
              </Button>
            </div>
          </div>
        </CartaoConfig>
      </div>

      {fazenda ? (
        <SecaoDerivados
          fazendaId={fazenda.id}
          produtosMarcados={produtosTrabalhados}
          moeda={moeda}
        />
      ) : null}
    </AppShell>
  );
}

function Kpi({ icon: Icon, rotulo, valor }: { icon: typeof Milk; rotulo: string; valor: string }) {
  return (
    <div className="h-full rounded-xl border border-border bg-card p-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-2 text-[11px] text-muted-foreground">{rotulo}</p>
      <p className="font-display text-lg font-extrabold">{valor}</p>
    </div>
  );
}
