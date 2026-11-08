import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Package, Plus, ShoppingCart, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataCurta, dataISO, diasAtrasISO, hojeISO } from "@/lib/formato";
import { encontrarPrecoVigente } from "@/lib/precos-produto";
import { PRODUTOS_LEITE, rotuloProduto, unidadeProduto } from "@/lib/produtos-leite";

const FORMAS_PAGAMENTO = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "transferencia", rotulo: "Transferência" },
] as const;

const CAMPO_SELECT = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type Movimento = {
  id: string;
  tipo: "fabricacao" | "venda";
  data: string;
  produto: string;
  quantidade: number;
  detalhe: string;
};

const num = (v: number, casas = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/**
 * Derivados do leite (queijo, manteiga...), no mesmo caminho do leite:
 * fabricar (com o leite usado indo pra destinação do dia), ter preço,
 * vender (vira receita no Financeiro) e acompanhar o estoque.
 */
export function SecaoDerivados({
  fazendaId,
  produtosMarcados,
  moeda,
}: {
  fazendaId: string;
  produtosMarcados: string[];
  moeda: (v: number | null | undefined) => string;
}) {
  const queryClient = useQueryClient();
  const hoje = hojeISO();
  const derivados = PRODUTOS_LEITE.filter(
    (p) => p.valor !== "leite" && produtosMarcados.includes(p.valor),
  );
  const valores: string[] = derivados.map((d) => d.valor);

  const fabricacoes = useQuery({
    queryKey: ["derivados-producao", fazendaId, valores.join(",")],
    enabled: valores.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("producao_leite")
        .select("id, data, litros, produto, observacoes, created_at")
        .eq("fazenda_id", fazendaId)
        .in("produto", valores)
        .order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Leite usado em cada fabricação (destinação ligada a ela).
  const leiteUsado = useQuery({
    queryKey: ["derivados-leite-usado", fazendaId],
    enabled: valores.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("destinacoes_leite")
        .select("producao_id, quantidade")
        .eq("fazenda_id", fazendaId)
        .eq("destino", "derivados");
      if (error) throw error;
      const mapa = new Map<string, number>();
      for (const d of data ?? []) {
        if (d.producao_id) mapa.set(String(d.producao_id), Number(d.quantidade));
      }
      return mapa;
    },
  });

  // Custo de insumos lançado em cada fabricação (despesa ligada a ela).
  const insumos = useQuery({
    queryKey: ["derivados-insumos", fazendaId],
    enabled: valores.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("financeiro_lancamentos")
        .select("producao_id, valor")
        .eq("fazenda_id", fazendaId)
        .eq("categoria", "outro");
      if (error) throw error;
      const mapa = new Map<string, number>();
      for (const l of data ?? []) {
        if (l.producao_id) {
          const id = String(l.producao_id);
          mapa.set(id, (mapa.get(id) ?? 0) + Number(l.valor));
        }
      }
      return mapa;
    },
  });

  const vendas = useQuery({
    queryKey: ["derivados-vendas", fazendaId, valores.join(",")],
    enabled: valores.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("vendas")
        .select("id, data, produto, quantidade, valor_total, comprador")
        .eq("fazenda_id", fazendaId)
        .in("produto", valores)
        .order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const precos = useQuery({
    queryKey: ["derivados-precos", fazendaId, valores.join(",")],
    enabled: valores.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("precos_produto")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .in("produto", valores)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const precoDe = (produto: string, dia: string) =>
    encontrarPrecoVigente(
      (precos.data ?? []).filter((p) => p.produto === produto),
      dia,
    );

  const resumo = useMemo(() => {
    const limite30 = diasAtrasISO(29);
    return derivados.map((d) => {
      const prod = (fabricacoes.data ?? []).filter((f) => f.produto === d.valor);
      const vend = (vendas.data ?? []).filter((v) => v.produto === d.valor);
      const produzido = prod.reduce((s, f) => s + Number(f.litros), 0);
      const vendido = vend.reduce((s, v) => s + Number(v.quantidade), 0);
      const leiteTotal = prod.reduce((s, f) => s + (leiteUsado.data?.get(f.id) ?? 0), 0);
      const comCusto = prod.filter((f) => insumos.data?.has(f.id));
      const custoInsumos = comCusto.reduce((s, f) => s + (insumos.data?.get(f.id) ?? 0), 0);
      const produzidoComCusto = comCusto.reduce((s, f) => s + Number(f.litros), 0);
      const produzidoComLeite = prod
        .filter((f) => leiteUsado.data?.has(f.id))
        .reduce((s, f) => s + Number(f.litros), 0);
      return {
        ...d,
        estoque: produzido - vendido,
        produzido30: prod
          .filter((f) => dataISO(f.data) >= limite30)
          .reduce((s, f) => s + Number(f.litros), 0),
        vendido30: vend
          .filter((v) => dataISO(v.data) >= limite30)
          .reduce((s, v) => s + Number(v.quantidade), 0),
        // Litros de leite por kg (ou L) de derivado, só com fabricações que
        // informaram o leite usado.
        rendimento: produzidoComLeite > 0 ? leiteTotal / produzidoComLeite : null,
        // Custo de insumos por kg (ou L), só com fabricações que lançaram custo.
        insumosPorUnidade: produzidoComCusto > 0 ? custoInsumos / produzidoComCusto : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricacoes.data, vendas.data, leiteUsado.data, insumos.data, valores.join(",")]);

  function invalidar() {
    for (const chave of [
      "derivados-producao",
      "derivados-leite-usado",
      "derivados-vendas",
      "derivados-precos",
      "derivados-insumos",
      "destinacoes-leite",
      "leite",
      "leite-30d",
      "vendas",
      "financeiro",
      "inicio-resumo",
    ]) {
      queryClient.invalidateQueries({ queryKey: [chave] });
    }
  }

  // ---- Fabricação --------------------------------------------------------
  const [fabProduto, setFabProduto] = useState(valores[0] ?? "");
  const [fabData, setFabData] = useState(hoje);
  const [fabQuantidade, setFabQuantidade] = useState("");
  const [fabLeite, setFabLeite] = useState("");
  const [fabCusto, setFabCusto] = useState("");
  const produtoFab = valores.includes(fabProduto) ? fabProduto : (valores[0] ?? "");

  const fabricar = useMutation({
    mutationFn: async () => {
      const { error } = await db.leite.registrarFabricacao({
        fazendaId,
        produto: produtoFab,
        data: fabData,
        quantidade: Number(fabQuantidade),
        leiteUsado: fabLeite ? Number(fabLeite) : null,
        custoInsumos: fabCusto ? Number(fabCusto) : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(
        `${rotuloProduto(produtoFab)}: ${num(Number(fabQuantidade))} ${unidadeProduto(produtoFab)} registrado${fabLeite ? ` (${num(Number(fabLeite))} L de leite)` : ""}.`,
      );
      setFabQuantidade("");
      setFabLeite("");
      setFabCusto("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message || "Não conseguimos registrar agora."),
  });

  // ---- Venda -------------------------------------------------------------
  const [venProduto, setVenProduto] = useState(valores[0] ?? "");
  const [venData, setVenData] = useState(hoje);
  const [venQuantidade, setVenQuantidade] = useState("");
  const [venPreco, setVenPreco] = useState("");
  const [venComprador, setVenComprador] = useState("");
  const [venPago, setVenPago] = useState(true);
  const [venForma, setVenForma] = useState("dinheiro");
  const [venParcelas, setVenParcelas] = useState("1");
  const produtoVen = valores.includes(venProduto) ? venProduto : (valores[0] ?? "");
  const precoSugerido = precoDe(produtoVen, venData);
  // Campo vazio = usa o preço cadastrado do produto na data da venda.
  const precoVenda = venPreco !== "" ? Number(venPreco) : Number(precoSugerido?.valor ?? 0);
  const totalVenda = (Number(venQuantidade) || 0) * (precoVenda || 0);
  const estoqueVen = resumo.find((r) => r.valor === produtoVen)?.estoque ?? 0;

  const vender = useMutation({
    mutationFn: async () => {
      if (!(precoVenda > 0))
        throw new Error("Informe o preço por " + unidadeProduto(produtoVen) + ".");
      const { error } = await db.leite.registrarVenda({
        fazendaId,
        produto: produtoVen,
        unidade: unidadeProduto(produtoVen),
        quantidade: Number(venQuantidade),
        precoUnitario: precoVenda,
        comprador: venComprador.trim() || null,
        data: venData,
        pago: venPago,
        formaPagamento: venForma,
        parcelas: venPago && venForma === "cartao" ? Number(venParcelas) || 1 : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`Venda de ${rotuloProduto(produtoVen).toLowerCase()} registrada.`);
      setVenQuantidade("");
      setVenPreco("");
      setVenComprador("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message || "Não conseguimos registrar a venda."),
  });

  // ---- Preço por derivado --------------------------------------------------
  const [editandoPreco, setEditandoPreco] = useState<string | null>(null);
  const [precoNovo, setPrecoNovo] = useState("");
  const [precoDesde, setPrecoDesde] = useState(hoje);

  const salvarPreco = useMutation({
    mutationFn: async (produto: string) => {
      const { error } = await db.from("precos_produto").insert({
        fazenda_id: fazendaId,
        produto,
        valor: Number(precoNovo),
        unidade: unidadeProduto(produto),
        data_inicio: precoDesde,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preço atualizado.");
      setEditandoPreco(null);
      setPrecoNovo("");
      invalidar();
    },
    onError: () => toast.error("Não conseguimos salvar o preço agora."),
  });

  // ---- Movimentações -------------------------------------------------------
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const excluirFabricacao = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("producao_leite").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fabricação excluída.");
      setExcluindo(null);
      invalidar();
    },
    onError: () => toast.error("Não conseguimos excluir agora."),
  });

  const movimentos: Movimento[] = useMemo(() => {
    const lista: Movimento[] = [
      ...(fabricacoes.data ?? []).map((f) => {
        const leite = leiteUsado.data?.get(f.id);
        return {
          id: f.id,
          tipo: "fabricacao" as const,
          data: dataISO(f.data),
          produto: f.produto,
          quantidade: Number(f.litros),
          detalhe:
            [
              leite ? `${num(leite)} L de leite` : null,
              insumos.data?.get(f.id) ? `insumos ${moeda(insumos.data.get(f.id) ?? 0)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Fabricação",
        };
      }),
      ...(vendas.data ?? []).map((v) => ({
        id: v.id,
        tipo: "venda" as const,
        data: dataISO(v.data),
        produto: v.produto,
        quantidade: Number(v.quantidade),
        detalhe: `${moeda(Number(v.valor_total))}${v.comprador ? ` · ${v.comprador}` : ""}`,
      })),
    ];
    return lista.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricacoes.data, vendas.data, leiteUsado.data, insumos.data]);

  if (derivados.length === 0) return null;

  const opcoes = derivados.map((d) => (
    <option key={d.valor} value={d.valor}>
      {d.rotulo}
    </option>
  ));

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-semibold">Derivados</h2>

      {/* Um quadro por derivado: estoque em destaque, giro dos 30 dias e preço. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resumo.map((r) => {
          const preco = precoDe(r.valor, hoje);
          return (
            <div key={r.valor} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{r.rotulo}</p>
                  <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">
                    {num(Math.max(0, r.estoque))} {r.unidade}
                  </p>
                  <p className="text-[11px] text-muted-foreground">em estoque</p>
                </div>
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                  <Package className="size-4" aria-hidden="true" />
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Produzido (30 dias)</dt>
                  <dd className="font-semibold tabular-nums">
                    {num(r.produzido30)} {r.unidade}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Vendido (30 dias)</dt>
                  <dd className="font-semibold tabular-nums">
                    {num(r.vendido30)} {r.unidade}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rendimento</dt>
                  <dd className="font-semibold tabular-nums">
                    {r.rendimento ? `${num(r.rendimento)} L por ${r.unidade}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Insumos</dt>
                  <dd className="font-semibold tabular-nums">
                    {r.insumosPorUnidade !== null
                      ? `${moeda(r.insumosPorUnidade)}/${r.unidade}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Preço</dt>
                  <dd className="font-semibold tabular-nums">
                    {preco ? `${moeda(Number(preco.valor))}/${r.unidade}` : "—"}
                  </dd>
                </div>
              </dl>
              {editandoPreco === r.valor ? (
                <form
                  className="mt-3 grid grid-cols-2 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    salvarPreco.mutate(r.valor);
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor={`preco-${r.valor}`} className="text-xs">
                      R$ por {r.unidade}
                    </Label>
                    <Input
                      id={`preco-${r.valor}`}
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={precoNovo}
                      onChange={(e) => setPrecoNovo(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`preco-desde-${r.valor}`} className="text-xs">
                      Vale a partir de
                    </Label>
                    <Input
                      id={`preco-desde-${r.valor}`}
                      type="date"
                      value={precoDesde}
                      onChange={(e) => setPrecoDesde(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-span-2 flex gap-2">
                    <Button type="submit" size="sm" disabled={salvarPreco.isPending}>
                      Salvar preço
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditandoPreco(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setEditandoPreco(r.valor);
                    setPrecoNovo(preco ? String(preco.valor) : "");
                    setPrecoDesde(hoje);
                  }}
                >
                  <Tag className="size-4" aria-hidden="true" />
                  {preco ? "Atualizar preço" : "Definir preço"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <form
          className="rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            fabricar.mutate();
          }}
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Factory className="size-4 text-primary" aria-hidden="true" />
            Registrar fabricação
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fab-produto">Produto</Label>
              <select
                id="fab-produto"
                value={produtoFab}
                onChange={(e) => setFabProduto(e.target.value)}
                className={CAMPO_SELECT}
              >
                {opcoes}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fab-data">Data</Label>
              <Input
                id="fab-data"
                type="date"
                value={fabData}
                max={hoje}
                onChange={(e) => setFabData(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fab-quantidade">Produzido ({unidadeProduto(produtoFab)})</Label>
              <Input
                id="fab-quantidade"
                type="number"
                step="0.1"
                min="0.1"
                value={fabQuantidade}
                onChange={(e) => setFabQuantidade(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fab-leite">Leite usado (L)</Label>
              <Input
                id="fab-leite"
                type="number"
                step="0.1"
                min="0"
                value={fabLeite}
                placeholder="Opcional"
                onChange={(e) => setFabLeite(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="fab-custo">Custo dos insumos (R$)</Label>
              <Input
                id="fab-custo"
                type="number"
                step="0.01"
                min="0"
                value={fabCusto}
                placeholder="Opcional — coalho, sal, embalagem"
                onChange={(e) => setFabCusto(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            O leite usado sai da destinação do leite do dia como "Derivados"; o custo dos insumos
            entra no Financeiro.
            {Number(fabQuantidade) > 0 && Number(fabLeite) > 0
              ? ` Rendimento: ${num(Number(fabLeite) / Number(fabQuantidade))} L por ${unidadeProduto(produtoFab)}.`
              : ""}
          </p>
          <Button type="submit" className="mt-3" disabled={fabricar.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            {fabricar.isPending ? "Registrando..." : "Registrar fabricação"}
          </Button>
        </form>

        <form
          className="rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            vender.mutate();
          }}
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="size-4 text-primary" aria-hidden="true" />
            Registrar venda
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ven-produto">Produto</Label>
              <select
                id="ven-produto"
                value={produtoVen}
                onChange={(e) => {
                  setVenProduto(e.target.value);
                  setVenPreco("");
                }}
                className={CAMPO_SELECT}
              >
                {opcoes}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ven-data">Data</Label>
              <Input
                id="ven-data"
                type="date"
                value={venData}
                max={hoje}
                onChange={(e) => setVenData(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ven-quantidade">Quantidade ({unidadeProduto(produtoVen)})</Label>
              <Input
                id="ven-quantidade"
                type="number"
                step="0.1"
                min="0.1"
                value={venQuantidade}
                onChange={(e) => setVenQuantidade(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ven-preco">R$ por {unidadeProduto(produtoVen)}</Label>
              <Input
                id="ven-preco"
                type="number"
                step="0.01"
                min="0"
                value={venPreco}
                placeholder={precoSugerido ? String(precoSugerido.valor) : "Sem preço cadastrado"}
                onChange={(e) => setVenPreco(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ven-comprador">Comprador (opcional)</Label>
              <Input
                id="ven-comprador"
                value={venComprador}
                onChange={(e) => setVenComprador(e.target.value)}
              />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={venPago}
                onChange={(e) => setVenPago(e.target.checked)}
                className="size-4"
              />
              Já recebi o pagamento
            </label>
            {venPago ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ven-forma">Forma de pagamento</Label>
                  <select
                    id="ven-forma"
                    value={venForma}
                    onChange={(e) => setVenForma(e.target.value)}
                    className={CAMPO_SELECT}
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f.valor} value={f.valor}>
                        {f.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                {venForma === "cartao" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="ven-parcelas">Parcelas</Label>
                    <Input
                      id="ven-parcelas"
                      type="number"
                      min="1"
                      max="12"
                      value={venParcelas}
                      onChange={(e) => setVenParcelas(e.target.value)}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{moeda(totalVenda)}</span>
            {" · "}vai pro Financeiro como "Venda de derivados"
            {venPago ? "" : " (a receber)"}.
            {Number(venQuantidade) > estoqueVen
              ? ` Atenção: o estoque registrado é ${num(Math.max(0, estoqueVen))} ${unidadeProduto(produtoVen)}.`
              : ""}
          </p>
          <Button type="submit" className="mt-3" disabled={vender.isPending}>
            <ShoppingCart className="size-4" aria-hidden="true" />
            {vender.isPending ? "Registrando..." : "Registrar venda"}
          </Button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Movimentações de derivados
        </div>
        {movimentos.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhuma fabricação ou venda ainda. Registre a primeira fabricação acima.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {movimentos.map((m) => (
              <li key={`${m.tipo}-${m.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={
                    m.tipo === "fabricacao"
                      ? "rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary"
                      : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                  }
                >
                  {m.tipo === "fabricacao" ? "Fabricação" : "Venda"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {rotuloProduto(m.produto)} · {m.tipo === "fabricacao" ? "+" : "−"}
                    {num(m.quantidade)} {unidadeProduto(m.produto)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {dataCurta(m.data)} · {m.detalhe}
                  </span>
                </span>
                {m.tipo === "fabricacao" ? (
                  excluindo === m.id ? (
                    <span className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => excluirFabricacao.mutate(m.id)}
                        disabled={excluirFabricacao.isPending}
                      >
                        Excluir
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setExcluindo(null)}>
                        Não
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-8 px-0"
                      aria-label={`Excluir fabricação de ${rotuloProduto(m.produto)}`}
                      onClick={() => setExcluindo(m.id)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
