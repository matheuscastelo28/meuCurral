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
import { dataCurta, dataISO, hojeISO } from "@/lib/formato";

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
// Média bovina — o sistema ainda não distingue por espécie/raça. É só uma
// estimativa: a UI deixa isso explícito e permite ajustar a data manualmente.
// Único lugar onde essa constante existe no app.
const DIAS_GESTACAO = 283;

function previsaoPartoDe(data: string) {
  return dataISO(new Date(new Date(data).getTime() + DIAS_GESTACAO * 86400000));
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

  const [confirmarLactacao, setConfirmarLactacao] = useState<{
    animalId: string;
    nome: string;
  } | null>(null);

  const salvar = useMutation({
    mutationFn: async (vars: {
      tipo: string;
      animalId: string;
      data: string;
      touro: string;
      previsaoParto: string | null;
    }) => {
      const { error } = await db.from("reproducao").insert({
        fazenda_id: fazenda!.id,
        animal_id: vars.animalId || null,
        tipo: vars.tipo,
        data: vars.data,
        touro: vars.touro.trim() || null,
        previsao_parto: vars.previsaoParto,
      } as never);
      if (error) throw error;
      return vars;
    },
    onSuccess: (vars) => {
      toast.success("Registro salvo.");
      setTouro("");
      queryClient.invalidateQueries({ queryKey: ["reproducao"] });
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      queryClient.invalidateQueries({ queryKey: ["indices-rebanho"] });
      if (vars.tipo === "parto" && vars.animalId) {
        const animal = animais.data?.find((a) => a.id === vars.animalId);
        setConfirmarLactacao({
          animalId: vars.animalId,
          nome: animal?.nome || animal?.brinco || "Esse animal",
        });
      }
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  const marcarLactacao = useMutation({
    mutationFn: async (animalId: string) => {
      const { error } = await db
        .from("animais")
        .update({ status: "lactacao" } as never)
        .eq("id", animalId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Animal atualizado para lactação.");
      setConfirmarLactacao(null);
      queryClient.invalidateQueries({ queryKey: ["animais"] });
      queryClient.invalidateQueries({ queryKey: ["animais-simples"] });
      queryClient.invalidateQueries({ queryKey: ["animais-lactantes"] });
      queryClient.invalidateQueries({ queryKey: ["indices-rebanho"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: () => toast.error("Não conseguimos atualizar o status agora."),
  });

  return (
    <AppShell
      titulo="Reprodução"
      descricao="Registre coberturas, inseminações e partos para acompanhar a previsão de cada animal."
    >
      <form
        className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-5 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate({
            tipo,
            animalId,
            data,
            touro,
            previsaoParto: requerPrevisao ? previsaoParto : null,
          });
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
            <Label htmlFor="previsao-parto">Previsão estimada de parto</Label>
            <Input
              id="previsao-parto"
              type="date"
              value={previsaoParto}
              onChange={(e) => setPrevisaoParto(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Calculada com base em uma gestação média de {DIAS_GESTACAO} dias — ajuste se souber de
              uma data mais precisa.
            </p>
          </div>
        ) : null}
        <div className="flex items-end">
          <Button
            type="submit"
            className="w-full"
            disabled={salvar.isPending || confirmarLactacao !== null}
          >
            <Plus className="size-4" aria-hidden="true" />
            Registrar
          </Button>
        </div>
      </form>

      {confirmarLactacao ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Responda a pergunta abaixo antes de registrar outro parto.
        </p>
      ) : null}

      {confirmarLactacao ? (
        <div className="mb-5 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">
            Após este parto, {confirmarLactacao.nome} entrou em lactação?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se sim, o status do animal muda pra "lactação" e ele passa a aparecer na lista de
            registro de leite por vaca.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={marcarLactacao.isPending}
              onClick={() => marcarLactacao.mutate(confirmarLactacao.animalId)}
            >
              Sim
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={marcarLactacao.isPending}
              onClick={() => setConfirmarLactacao(null)}
            >
              Não
            </Button>
          </div>
        </div>
      ) : null}

      {(registros.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Stethoscope}
          titulo="Nenhum registro reprodutivo"
          descricao="Registre uma cobertura ou inseminação para calcular a previsão de parto."
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
                {r.previsao_parto ? ` · previsão estimada ${dataCurta(r.previsao_parto)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
