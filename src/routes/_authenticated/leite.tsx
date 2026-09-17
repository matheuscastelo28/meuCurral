import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Baby, Beef, Droplet, Milk, Percent, Plus, Skull } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { useIndicesRebanho } from "@/hooks/use-indices-rebanho";
import { dataCurta, hojeISO } from "@/lib/formato";
import { PRODUTOS_LEITE, rotuloProduto, unidadeProduto } from "@/lib/produtos-leite";

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
  const { data: fazenda } = useFazenda();
  const indices = useIndicesRebanho(fazenda?.id);
  const queryClient = useQueryClient();
  const [data, setData] = useState(hojeISO());
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
