import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, hojeISO } from "@/lib/formato";

export const Route = createFileRoute("/_authenticated/reproducao")({
  head: () => ({
    meta: [
      { title: "Reprodução — Curral Online" },
      {
        name: "description",
        content: "Coberturas, inseminações, diagnósticos e previsão de parto.",
      },
      { property: "og:title", content: "Reprodução — Curral Online" },
      { property: "og:description", content: "Controle reprodutivo do rebanho." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reproducao,
});

const TIPOS = ["cobertura", "inseminacao", "diagnostico", "parto", "secagem"] as const;
const DIAS_GESTACAO = 283;

function previsaoPartoDe(data: string) {
  return new Date(new Date(data).getTime() + DIAS_GESTACAO * 86400000).toISOString().slice(0, 10);
}

function Reproducao() {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<string>("cobertura");
  const [data, setData] = useState(hojeISO());
  const [animalId, setAnimalId] = useState("");
  const [touro, setTouro] = useState("");
  const [previsaoParto, setPrevisaoParto] = useState(() => previsaoPartoDe(hojeISO()));

  const requerPrevisao = tipo === "cobertura" || tipo === "inseminacao";

  useEffect(() => {
    if (requerPrevisao) setPrevisaoParto(previsaoPartoDe(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, data]);

  const animais = useQuery({
    queryKey: ["animais-simples", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("id, nome, brinco")
        .eq("fazenda_id", fazenda!.id)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const registros = useQuery({
    queryKey: ["reproducao", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("reproducao")
        .select("*, animais(nome)")
        .eq("fazenda_id", fazenda!.id)
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("reproducao").insert({
        fazenda_id: fazenda!.id,
        animal_id: animalId || null,
        tipo,
        data,
        touro: touro.trim() || null,
        previsao_parto: requerPrevisao ? previsaoParto : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro salvo. O calendário já foi atualizado.");
      setTouro("");
      queryClient.invalidateQueries({ queryKey: ["reproducao"] });
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  return (
    <AppShell
      titulo="Reprodução"
      descricao="Cada registro gera automaticamente os avisos no calendário."
    >
      <form
        className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-5 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select
            id="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="animal">Animal</Label>
          <select
            id="animal"
            value={animalId}
            onChange={(e) => setAnimalId(e.target.value)}
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
          <Label htmlFor="data-repro">Data</Label>
          <Input
            id="data-repro"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="touro">Touro / sêmen</Label>
          <Input id="touro" value={touro} onChange={(e) => setTouro(e.target.value)} />
        </div>
        {requerPrevisao ? (
          <div className="space-y-1.5">
            <Label htmlFor="previsao-parto">Previsão de parto</Label>
            <Input
              id="previsao-parto"
              type="date"
              value={previsaoParto}
              onChange={(e) => setPrevisaoParto(e.target.value)}
            />
          </div>
        ) : null}
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={salvar.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            Registrar
          </Button>
        </div>
      </form>

      {(registros.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Stethoscope}
          titulo="Nenhum registro reprodutivo"
          descricao="Registre uma cobertura ou inseminação e a previsão de parto entra sozinha no calendário."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {registros.data?.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span>
                <span className="font-medium capitalize">{r.tipo}</span>
                {" · "}
                <span className="text-muted-foreground">
                  {(r as { animais?: { nome?: string } }).animais?.nome ?? "Rebanho"}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {dataCurta(r.data)}
                {r.previsao_parto ? ` · previsão de parto ${dataCurta(r.previsao_parto)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
