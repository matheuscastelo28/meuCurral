import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Stethoscope, Users } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, dataISO, hojeISO, idadeTexto } from "@/lib/formato";

export const Route = createFileRoute("/_authenticated/reproducao")({
  head: () => ({
    meta: [
      { title: "Reprodução — Easy Agro" },
      {
        name: "description",
        content: "Primeiro cio, coberturas, inseminações, diagnósticos e previsão de parto.",
      },
      { property: "og:title", content: "Reprodução — Easy Agro" },
      { property: "og:description", content: "Controle reprodutivo do rebanho." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reproducao,
});

const TIPOS = [
  "primeiro_cio",
  "cobertura",
  "inseminacao",
  "diagnostico",
  "parto",
  "secagem",
] as const;
const TIPO_LABEL: Record<string, string> = {
  primeiro_cio: "Primeiro cio",
  cobertura: "Cobertura",
  inseminacao: "Inseminação",
  diagnostico: "Diagnóstico",
  parto: "Parto",
  secagem: "Secagem",
};
// Touro não entra como "Animal" (o animal sendo coberto/inseminado/secado/
// parindo/em primeiro cio) nesses tipos — só faz sentido escolher um touro
// ali em diagnóstico.
const TIPOS_SEM_TOURO_NO_ANIMAL = new Set([
  "cobertura",
  "inseminacao",
  "secagem",
  "parto",
  "primeiro_cio",
]);
// Médias por espécie — o sistema não distingue por raça individual. São só
// estimativas: a UI deixa isso explícito e permite ajustar a data manualmente.
const DIAS_GESTACAO_BOVINO = 283;
const DIAS_GESTACAO_OVINO = 150;

function previsaoPartoDe(data: string, diasGestacao: number) {
  return dataISO(new Date(new Date(data).getTime() + diasGestacao * 86400000));
}

function Reproducao() {
  const { data: fazenda } = useFazenda();
  const soOvino =
    !!fazenda?.atividades?.includes("ovino") && !fazenda.atividades.includes("bovino");
  const categoriaReprodutor = soOvino ? "carneiro" : "touro";
  const rotuloReprodutor = soOvino ? "Carneiro" : "Touro";
  const diasGestacao = soOvino ? DIAS_GESTACAO_OVINO : DIAS_GESTACAO_BOVINO;
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<string>("cobertura");
  const [data, setData] = useState(hojeISO());
  const [animalId, setAnimalId] = useState("");
  // "" = nenhum, "outro" = touro não cadastrado (usa touroCustom), senão é o id do animal touro.
  const [touroId, setTouroId] = useState("");
  const [touroCustom, setTouroCustom] = useState("");
  const [previsaoParto, setPrevisaoParto] = useState(() =>
    previsaoPartoDe(hojeISO(), diasGestacao),
  );

  const requerPrevisao = tipo === "cobertura" || tipo === "inseminacao";

  useEffect(() => {
    if (requerPrevisao) setPrevisaoParto(previsaoPartoDe(data, diasGestacao));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, data, diasGestacao]);

  const animais = useQuery({
    queryKey: ["animais-simples", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("id, nome, brinco, categoria, nascimento, mae, pai")
        .eq("fazenda_id", fazenda!.id)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const animalSelecionado = animais.data?.find((a) => a.id === animalId) ?? null;

  const animaisParaSelecao = (animais.data ?? []).filter(
    (a) => !TIPOS_SEM_TOURO_NO_ANIMAL.has(tipo) || a.categoria !== categoriaReprodutor,
  );

  useEffect(() => {
    if (animalId && !animaisParaSelecao.some((a) => a.id === animalId)) setAnimalId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, animais.data]);

  // Touros cadastrados no rebanho da fazenda — o campo de texto livre fica
  // só pra quando o touro/sêmen doador não é um animal cadastrado aqui.
  const touros = useQuery({
    queryKey: ["animais-touros", fazenda?.id, categoriaReprodutor],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("id, nome, brinco")
        .eq("fazenda_id", fazenda!.id)
        .eq("categoria", categoriaReprodutor)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  function touroTextoAtual() {
    if (touroId === "outro") return touroCustom.trim();
    const t = touros.data?.find((a) => a.id === touroId);
    return t ? `${t.nome}${t.brinco ? ` (${t.brinco})` : ""}` : "";
  }

  const registros = useQuery({
    queryKey: ["reproducao", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("reproducao")
        .select("*, animais(nome, mae, pai, nascimento)")
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
      setTouroId("");
      setTouroCustom("");
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
      descricao="Primeiro cio, coberturas, inseminações e partos — com mãe, pai e idade de cada animal à mão."
    >
      <form
        className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate({
            tipo,
            animalId,
            data,
            touro: requerPrevisao ? touroTextoAtual() : "",
            previsaoParto: requerPrevisao ? previsaoParto : null,
          });
        }}
      >
        <div className="min-w-[150px] flex-1 space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select
            id="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[150px] flex-1 space-y-1.5">
          <Label htmlFor="animal">Animal</Label>
          <select
            id="animal"
            value={animalId}
            onChange={(e) => setAnimalId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            required
          >
            <option value="">Selecione</option>
            {animaisParaSelecao.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
                {a.brinco ? ` (${a.brinco})` : ""}
              </option>
            ))}
          </select>
          {animalSelecionado ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {animalSelecionado.nascimento ? (
                <span>
                  Nascido em {dataCurta(animalSelecionado.nascimento)} (
                  {idadeTexto(animalSelecionado.nascimento)})
                </span>
              ) : null}
              {animalSelecionado.mae ? <span>Mãe: {animalSelecionado.mae}</span> : null}
              {animalSelecionado.pai ? <span>Pai: {animalSelecionado.pai}</span> : null}
            </p>
          ) : null}
        </div>
        <div className="min-w-[150px] flex-1 space-y-1.5">
          <Label htmlFor="data-repro">Data</Label>
          <Input
            id="data-repro"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </div>
        {requerPrevisao ? (
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <Label htmlFor="touro">{rotuloReprodutor} / sêmen</Label>
            <select
              id="touro"
              value={touroId}
              onChange={(e) => setTouroId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Nenhum</option>
              {touros.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                  {t.brinco ? ` (${t.brinco})` : ""}
                </option>
              ))}
              <option value="outro">Outro (não cadastrado)</option>
            </select>
          </div>
        ) : null}
        {requerPrevisao && touroId === "outro" ? (
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <Label htmlFor="touro-custom">Nome do {rotuloReprodutor.toLowerCase()}/sêmen</Label>
            <Input
              id="touro-custom"
              value={touroCustom}
              onChange={(e) => setTouroCustom(e.target.value)}
              placeholder={`Ex: ${rotuloReprodutor} emprestado — Fazenda X`}
            />
          </div>
        ) : null}
        {requerPrevisao ? (
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <Label htmlFor="previsao-parto">Previsão de parto</Label>
            <Input
              id="previsao-parto"
              type="date"
              value={previsaoParto}
              onChange={(e) => setPrevisaoParto(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Calculada com base em uma gestação média de {diasGestacao} dias
              {soOvino ? " (ovinos)" : ""}.
            </p>
          </div>
        ) : null}
        <div className="w-full space-y-1.5 sm:w-auto sm:min-w-[150px]">
          <Label className="invisible hidden sm:block">Registrar</Label>
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
          {registros.data?.map((r) => {
            const animal = (
              r as {
                animais?: { nome?: string; mae?: string; pai?: string; nascimento?: string } | null;
              }
            ).animais;
            const genealogia = [
              animal?.nascimento ? `nascido em ${dataCurta(animal.nascimento)}` : null,
              animal?.mae ? `mãe: ${animal.mae}` : null,
              animal?.pai ? `pai: ${animal.pai}` : null,
            ].filter(Boolean);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span>
                    <span className="font-medium">{TIPO_LABEL[r.tipo ?? ""] ?? r.tipo}</span>
                    {" · "}
                    <span className="text-muted-foreground">{animal?.nome ?? "Rebanho"}</span>
                  </span>
                  {genealogia.length > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3 shrink-0" aria-hidden="true" />
                      {genealogia.join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dataCurta(r.data)}
                  {r.previsao_parto ? ` · previsão de parto ${dataCurta(r.previsao_parto)}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
