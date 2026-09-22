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

const DESTINOS = [
  { valor: "venda", rotulo: "Venda" },
  { valor: "bezerros", rotulo: "Bezerros" },
  { valor: "queijo", rotulo: "Queijo" },
  { valor: "consumo", rotulo: "Consumo" },
  { valor: "descarte", rotulo: "Descarte" },
  { valor: "outro", rotulo: "Outro" },
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

  const precoVigente = useMemo(() => {
    // As datas voltam da API como ISO completo (ex: 2026-09-22T00:00:00.000Z),
    // então comparar direto com "hoje" (YYYY-MM-DD) nunca bate — normaliza
    // pros 10 primeiros caracteres antes de comparar.
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

  const [destinos, setDestinos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!destinacoesHoje.data) return;
    const preenchido: Record<string, string> = {};
    for (const d of destinacoesHoje.data) preenchido[d.destino] = String(d.quantidade);
    setDestinos(preenchido);
  }, [destinacoesHoje.data]);

  const totalDestinado = DESTINOS.reduce(
    (soma, d) => soma + (Number(destinos[d.valor]) || 0),
    0,
  );
  const restante = totalHoje - totalDestinado;
  const valorGeradoHoje = (vendasHoje.data ?? []).reduce(
    (s, v) => s + Number(v.valor_total),
    0,
  );

  const salvarDestinacao = useMutation({
    mutationFn: async () => {
      const lista = DESTINOS.map((d) => ({
        destino: d.valor,
        quantidade: Number(destinos[d.valor]) || 0,
      })).filter((d) => d.quantidade > 0);

      const { error } = await db.leite.registrarDestinacao({
        fazendaId: fazenda!.id,
        data: hoje,
        destinos: lista,
      });
      if (error) throw new Error(error.message);

      const vendaLitros = Number(destinos["venda"]) || 0;
      const jaTemVenda = (vendasHoje.data ?? []).length > 0;
      if (vendaLitros > 0 && !jaTemVenda) {
        if (!precoVigente) {
          throw new Error(
            "Cadastre o preço do leite antes de destinar litros para venda.",
          );
        }
        const { error: erroVenda } = await db.leite.registrarVenda({
          fazendaId: fazenda!.id,
          quantidade: vendaLitros,
          precoUnitario: Number(precoVigente.valor),
          comprador: precoVigente.comprador,
          data: hoje,
        });
        if (erroVenda) throw new Error(erroVenda.message);
      }
    },
    onSuccess: () => {
      toast.success("Destinação salva.");
      queryClient.invalidateQueries({ queryKey: ["destinacoes-leite"] });
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
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
        </CartaoConfig>

        <CartaoConfig
          id="destinacao-leite"
          titulo="Destinação de hoje"
          descricao="Nem todo litro produzido é vendido — separe aqui o que foi pra venda, bezerros, queijo etc. Só a parte vendida vira receita."
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

          <form
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              salvarDestinacao.mutate();
            }}
          >
            {DESTINOS.map((d) => (
              <div key={d.valor} className="space-y-1.5">
                <Label htmlFor={`destino-${d.valor}`}>{d.rotulo} (L)</Label>
                <Input
                  id={`destino-${d.valor}`}
                  type="number"
                  step="0.1"
                  min="0"
                  value={destinos[d.valor] ?? ""}
                  onChange={(e) =>
                    setDestinos((atual) => ({ ...atual, [d.valor]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="col-span-2 flex items-end sm:col-span-3">
              <Button
                type="submit"
                size="sm"
                disabled={salvarDestinacao.isPending || totalHoje === 0}
              >
                <Coins className="size-4" aria-hidden="true" />
                Salvar destinação
              </Button>
            </div>
          </form>
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
