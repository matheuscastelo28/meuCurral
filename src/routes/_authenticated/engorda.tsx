import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Baby, Beef, Plus, Scale, Skull, TrendingUp, Weight } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { useIndicesRebanho } from "@/hooks/use-indices-rebanho";
import { useIndicesEngorda } from "@/hooks/use-indices-engorda";
import { dataCurta, hojeISO, pesoTexto } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";

export const Route = createFileRoute("/_authenticated/engorda")({
  head: () => ({
    meta: [
      { title: "Engorda — Meu Curral Digital" },
      {
        name: "description",
        content: "Acompanhamento de peso e ganho de peso do lote em engorda.",
      },
      { property: "og:title", content: "Engorda — Meu Curral Digital" },
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
