import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Baby, Beef, Coins, Droplet, Milk, Percent, Plus, Skull, Tag } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { CartaoConfig } from "@/components/config/CartaoConfig";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { useIndicesRebanho } from "@/hooks/use-indices-rebanho";
import { dataCurta, hojeISO, moeda as formatarMoeda } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";
import { PRODUTOS_LEITE, rotuloProduto, unidadeProduto } from "@/lib/produtos-leite";

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
  descarte: "outros",
};

const FORMAS_PAGAMENTO = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "transferencia", rotulo: "Transferência" },
] as const;

/** Preço vigente pra uma data: data_inicio <= dataAlvo && (data_fim == null || data_fim >= dataAlvo). */
function encontrarPrecoVigente(precos: any[] | undefined, dataAlvo: string) {
  return (precos ?? []).find((p: any) => {
    const inicio = String(p.data_inicio).slice(0, 10);
    const fim = p.data_fim ? String(p.data_fim).slice(0, 10) : null;
    return inicio <= dataAlvo && (!fim || fim >= dataAlvo);
  });
}

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
  const indices = useIndicesRebanho(fazenda?.id);
  const queryClient = useQueryClient();
  const hoje = hojeISO();
  const [data, setData] = useState(hoje);
  const [litros, setLitros] = useState("");
  const [turno, setTurno] = useState("manha");
  const [produto, setProduto] = useState("leite");

  const produtosTrabalhados = fazenda?.produtos_leite?.length ? fazenda.produtos_leite : ["leite"];
  const opcoesProduto = PRODUTOS_LEITE.filter((p) => produtosTrabalhados.includes(p.valor));

  useEffect(() => {
    if (!produtosTrabalhados.includes(produto)) setProduto(produtosTrabalhados[0] ?? "leite");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazenda?.id]);

  const registros = useQuery({
    queryKey: ["leite", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("producao_leite")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .order("data", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("producao_leite").insert({
        fazenda_id: fazenda!.id,
        data,
        litros: Number(litros),
        turno,
        produto,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produção registrada.");
      setLitros("");
      queryClient.invalidateQueries({ queryKey: ["leite"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["indices-rebanho"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  const totalLeite = (registros.data ?? [])
    .filter((r) => r.produto === "leite")
    .reduce((s, r) => s + Number(r.litros), 0);

  const totalHoje = (registros.data ?? [])
    .filter((r) => r.produto === "leite" && String(r.data).slice(0, 10) === hoje)
    .reduce((s, r) => s + Number(r.litros), 0);

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

  const salvarVendaAvulsa = useMutation({
    mutationFn: async () => {
      const { error } = await db.leite.registrarVenda({
        fazendaId: fazenda!.id,
        quantidade: Number(vendaAvulsaLitros),
        precoUnitario: Number(vendaAvulsaPreco),
        comprador: vendaAvulsaComprador.trim() || null,
        data: vendaAvulsaData,
        pago: vendaAvulsaPago,
        formaPagamento: vendaAvulsaFormaPagamento,
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
      const comprador = precoNaDataLaticinio.comprador || vendaLaticinioComprador.trim() || null;
      const { error } = await db.leite.registrarVenda({
        fazendaId: fazenda!.id,
        quantidade: litrosNum,
        precoUnitario: Number(precoNaDataLaticinio.valor),
        comprador,
        data: vendaLaticinioData,
        pago: vendaLaticinioPago,
        formaPagamento: vendaLaticinioFormaPagamento,
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
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: (erro: Error) =>
      toast.error(erro.message || "Não conseguimos registrar a venda."),
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
  };

  const [consumoEntries, setConsumoEntries] = useState<ConsumoEntry[]>([]);
  const [mostrarFormConsumo, setMostrarFormConsumo] = useState(false);
  const [consumoTipo, setConsumoTipo] = useState<ConsumoEntry["tipo"]>("bezerros");
  const [consumoDerivado, setConsumoDerivado] = useState<string>(DERIVADOS[0]?.valor ?? "queijo");
  const [consumoNome, setConsumoNome] = useState("");
  const [consumoQuantidade, setConsumoQuantidade] = useState("");

  useEffect(() => {
    if (!destinacoesHoje.data) return;
    const entradas: ConsumoEntry[] = destinacoesHoje.data
      .filter((d) => d.destino !== "venda")
      .map((d) => {
        const tipo = (MIGRAR_TIPO_CONSUMO[d.destino] ?? d.destino) as ConsumoEntry["tipo"];
        return {
          id: d.id,
          tipo,
          derivado: tipo === "derivados" ? (d.observacoes ?? undefined) : undefined,
          nome: tipo === "outros" ? (d.observacoes ?? undefined) : undefined,
          quantidade: String(d.quantidade),
        };
      });
    setConsumoEntries(entradas);
  }, [destinacoesHoje.data]);

  const vendaLitrosHoje = (vendasHoje.data ?? []).reduce((s, v) => s + Number(v.quantidade), 0);
  const totalConsumo = consumoEntries.reduce((s, e) => s + (Number(e.quantidade) || 0), 0);
  const totalDestinado = vendaLitrosHoje + totalConsumo;
  const restante = totalHoje - totalDestinado;
  const valorGeradoHoje = (vendasHoje.data ?? []).reduce(
    (s, v) => s + Number(v.valor_total),
    0,
  );

  function rotuloConsumoEntry(e: ConsumoEntry) {
    const base = CONSUMO_TIPOS.find((t) => t.valor === e.tipo)?.rotulo ?? e.tipo;
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

  const salvarDestinacao = useMutation({
    mutationFn: async () => {
      const lista = [
        ...(vendaLitrosHoje > 0 ? [{ destino: "venda", quantidade: vendaLitrosHoje }] : []),
        ...consumoEntries
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
    onError: (erro: Error) =>
      toast.error(erro.message || "Não conseguimos salvar a destinação."),
  });

  const i = indices.data;

  return (
    <AppShell titulo="Leite" descricao="Anote a produção por dia e turno para acompanhar a curva.">
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi icon={Beef} rotulo="Total do rebanho" valor={i ? `${i.totalRebanho} cab` : "—"} />
        <Kpi icon={Baby} rotulo="Total de prenhes" valor={i ? `${i.totalPrenhes} cab` : "—"} />
        <Kpi icon={Baby} rotulo="Partos (últimos 30 dias)" valor={i ? `${i.partos30d} cab` : "—"} />
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
          icon={Percent}
          rotulo="Lactantes / vacas"
          valor={i ? `${i.lactantesVacasPct}%` : "—"}
        />
        <Kpi
          icon={Milk}
          rotulo="DEL médio"
          valor={i ? (i.delMedio !== null ? `${i.delMedio} dias` : "—") : "—"}
        />
        <Kpi
          icon={Droplet}
          rotulo="Média do último controle"
          valor={
            i
              ? `${i.mediaUltimoControle.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`
              : "—"
          }
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

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <CartaoConfig
          id="preco-leite"
          titulo="Preço do leite"
          descricao="Vale para os litros vendidos a partir da data de vigência — o histórico anterior continua usando o preço antigo."
        >
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
            <p className="mt-1 text-sm text-muted-foreground">
              Venda avulsa: preço digitado na hora, pra uma ocasião específica. Venda para
              laticínio: usa o preço do leite vigente na data escolhida, sem digitar de novo.
            </p>

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
                        placeholder="Opcional"
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

                    <div className="flex gap-2 sm:col-span-2">
                      <Button type="submit" size="sm" disabled={salvarVendaAvulsa.isPending}>
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
                          placeholder="Opcional"
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
                        Nenhum preço do leite cadastrado para esta data. Atualize o preço do
                        leite antes de registrar a venda.
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

                    <div className="flex gap-2 sm:col-span-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          salvarVendaLaticinio.isPending ||
                          !precoNaDataLaticinio ||
                          !(Number(vendaLaticinioLitros) > 0)
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
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setMostrarFormVenda(true)}
              >
                Registrar venda
              </Button>
            )}
          </div>
        </CartaoConfig>

        <CartaoConfig
          id="destinacao-leite"
          titulo="Destinação de hoje"
          descricao="Nem todo litro produzido é vendido — a venda vem das vendas já registradas, e o resto você separa em consumo. Só a parte vendida vira receita."
        >
          <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Produzido hoje</p>
              <p className="font-display text-lg font-extrabold">
                {totalHoje.toLocaleString("pt-BR")} L
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Destinado</p>
              <p className="font-display text-lg font-extrabold">
                {totalDestinado.toLocaleString("pt-BR")} L
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gerado hoje</p>
              <p className="font-display text-lg font-extrabold text-success">
                {moeda(valorGeradoHoje)}
              </p>
            </div>
          </div>

          {restante < 0 ? (
            <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              A soma dos destinos passou {Math.abs(restante).toLocaleString("pt-BR")} L do que foi
              produzido hoje.
            </p>
          ) : totalHoje > 0 ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Falta destinar {restante.toLocaleString("pt-BR")} L.
            </p>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Venda</p>
                <p className="text-xs text-muted-foreground">
                  Somado das vendas já registradas hoje.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-extrabold">
                  {vendaLitrosHoje.toLocaleString("pt-BR")} L
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  aria-label="Registrar venda"
                  onClick={() => {
                    setMostrarFormVenda(true);
                    document
                      .getElementById("preco-leite")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Consumo</p>
                  <p className="text-xs text-muted-foreground">
                    Bezerros, consumo familiar, derivados ou outros.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-extrabold">
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
                        <span className="font-medium">
                          {Number(e.quantidade).toLocaleString("pt-BR")} L
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remover"
                          onClick={() => removerConsumo(e.id)}
                        >
                          ×
                        </button>
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
                        placeholder="Ex: Descarte"
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

      <form
        className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
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
          <Label htmlFor="produto">Produto</Label>
          <select
            id="produto"
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {opcoesProduto.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="litros">Quantidade ({unidadeProduto(produto)})</Label>
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
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={salvar.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            Registrar
          </Button>
        </div>
      </form>

      {(registros.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Milk}
          titulo="Nenhuma produção registrada"
          descricao="Registre a primeira ordenha para começar a acompanhar a produção da fazenda."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Total de leite dos últimos registros: {totalLeite.toLocaleString("pt-BR")} L
          </div>
          <ul className="divide-y divide-border">
            {registros.data?.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {dataCurta(r.data)} · <span className="text-muted-foreground">{r.turno}</span> ·{" "}
                  <span className="text-muted-foreground">{rotuloProduto(r.produto)}</span>
                </span>
                <span className="font-semibold">
                  {Number(r.litros).toLocaleString("pt-BR")} {unidadeProduto(r.produto)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}

function Kpi({ icon: Icon, rotulo, valor }: { icon: typeof Milk; rotulo: string; valor: string }) {
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
