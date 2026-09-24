import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Baby, Beef, Coins, Plus, Scale, Skull, Tag, TrendingUp, Weight } from "lucide-react";
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
import { useIndicesEngorda } from "@/hooks/use-indices-engorda";
import { dataCurta, hojeISO, moeda as formatarMoeda, pesoTexto } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";

const KG_POR_ARROBA = 15;

export const Route = createFileRoute("/_authenticated/engorda")({
  head: () => ({
    meta: [
      { title: "Engorda — Curral Online" },
      {
        name: "description",
        content: "Acompanhamento de peso e ganho de peso do lote em engorda.",
      },
      { property: "og:title", content: "Engorda — Curral Online" },
      { property: "og:description", content: "Pesagens, GMD e arrobas do lote em engorda." },
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

  const [animalId, setAnimalId] = useState("");
  const [peso, setPeso] = useState("");
  const [data, setData] = useState(hojeISO());

  const animais = useQuery({
    queryKey: ["animais-engorda", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("id, nome, brinco, peso_kg")
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

  const registrar = useMutation({
    mutationFn: async () => {
      const pesoNum = Number(peso);
      const { error: erroManejo } = await db.from("manejos").insert({
        fazenda_id: fazenda!.id,
        animal_id: animalId,
        tipo: "pesagem",
        data,
        valor: pesoNum,
      } as never);
      if (erroManejo) throw erroManejo;
      const { error: erroAnimal } = await db
        .from("animais")
        .update({ peso_kg: pesoNum } as never)
        .eq("id", animalId);
      if (erroAnimal) throw erroAnimal;
    },
    onSuccess: () => {
      toast.success("Pesagem registrada.");
      setPeso("");
      queryClient.invalidateQueries({ queryKey: ["animais-engorda"] });
      queryClient.invalidateQueries({ queryKey: ["pesagens-engorda"] });
      queryClient.invalidateQueries({ queryKey: ["indices-engorda"] });
      queryClient.invalidateQueries({ queryKey: ["animais"] });
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);
  const hoje = hojeISO();

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

  const precoVigente = useMemo(() => {
    return (precos.data ?? []).find((p) => {
      const inicio = String(p.data_inicio).slice(0, 10);
      const fim = p.data_fim ? String(p.data_fim).slice(0, 10) : null;
      return inicio <= hoje && (!fim || fim >= hoje);
    });
  }, [precos.data, hoje]);

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

  const arrobasVendaAvulsa = Number(vendaAvulsaPeso) > 0 ? Number(vendaAvulsaPeso) / KG_POR_ARROBA : 0;

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
      });
      if (error) throw new Error(error.message);

      // A venda já foi registrada nesse ponto — se marcar o animal como
      // vendido falhar, não desfaz a venda nem trata como erro geral (senão
      // o formulário fica aberto e o usuário pode reenviar, duplicando a
      // venda). Só avisa que esse passo específico não completou.
      let avisoAnimal: string | null = null;
      if (vendaAnimalId) {
        const { error: erroAnimal } = await db
          .from("animais")
          .update({ status: "vendido", peso_kg: pesoKg } as never)
          .eq("id", vendaAnimalId);
        if (erroAnimal) {
          avisoAnimal = "Venda registrada, mas não conseguimos marcar o animal como vendido.";
        }
      }
      return { avisoAnimal };
    },
    onSuccess: ({ avisoAnimal }) => {
      if (avisoAnimal) {
        toast.warning(avisoAnimal);
      } else {
        toast.success(
          vendaAnimalId ? "Venda registrada e animal marcado como vendido." : "Venda registrada.",
        );
      }
      setMostrarFormVendaAvulsa(false);
      setVendaAnimalId("");
      setVendaAvulsaPeso("");
      setVendaAvulsaPreco("");
      setVendaAvulsaComprador("");
      setVendaAvulsaData(hoje);
      setVendaAvulsaPago(false);
      setVendaAvulsaFormaPagamento("dinheiro");
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["animais-engorda"] });
      queryClient.invalidateQueries({ queryKey: ["indices-engorda"] });
      queryClient.invalidateQueries({ queryKey: ["animais"] });
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: (erro: Error) =>
      toast.error(erro.message || "Não conseguimos registrar a venda."),
  });

  const i = indices.data;
  const e = indicesEngorda.data;

  return (
    <AppShell titulo="Engorda" descricao="Peso, ganho médio diário e arrobas do lote em engorda.">
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

          <div className="mt-5 border-t border-border pt-4">
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
                      ≈ {arrobasVendaAvulsa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} @
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
        </CartaoConfig>
      </div>

      <form
        className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          registrar.mutate();
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

      {(animais.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Weight}
          titulo="Nenhum animal em engorda"
          descricao="Marque um animal com a situação 'engorda' no Rebanho para acompanhar peso e GMD aqui."
        />
      ) : (
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
                    {a.brinco ? <span className="text-muted-foreground"> ({a.brinco})</span> : null}
                  </span>
                  <span className="font-semibold">{pesoTexto(a.peso_kg, prefs.unidade_peso)}</span>
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
