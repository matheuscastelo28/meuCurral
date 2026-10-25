import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Stethoscope, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { dataCurta, dataISO, diasAtrasISO, hojeISO, idadeTexto } from "@/lib/formato";
import { especieDaCategoria, especieDoAnimal } from "@/lib/especies";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reproducao")({
  head: () => ({
    meta: [
      { title: "Reprodução — Curral Online" },
      {
        name: "description",
        content: "Primeiro cio, coberturas, inseminações, diagnósticos e previsão de parto.",
      },
      { property: "og:title", content: "Reprodução — Curral Online" },
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
// Diagnóstico de prenhez costuma ser feito a partir de ~30 dias do serviço;
// secagem da vaca leiteira, ~60 dias antes do parto.
const DIAS_PARA_DIAGNOSTICO = 30;
const DIAS_SECAGEM_ANTES_PARTO = 60;
const DIAS_GESTACAO_BOVINO = 283;
const DIAS_GESTACAO_OVINO = 150;

function previsaoPartoDe(data: string, diasGestacao: number) {
  return dataISO(new Date(new Date(data).getTime() + diasGestacao * 86400000));
}

function Reproducao() {
  const { data: fazenda } = useFazenda();
  const temBovino = !!fazenda?.atividades?.includes("bovino");
  const temOvino = !!fazenda?.atividades?.includes("ovino");
  const ambasAtividades = temBovino && temOvino;
  const [visaoEspecie, setVisaoEspecie] = useState<"bovino" | "ovino">("bovino");
  const soOvino = ambasAtividades ? visaoEspecie === "ovino" : temOvino && !temBovino;
  // Com uma atividade só, a outra espécie some daqui também.
  const especieVisivel = soOvino ? "ovino" : "bovino";
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
  const [resultadoDiagnostico, setResultadoDiagnostico] = useState<"positivo" | "negativo">(
    "positivo",
  );
  const [excluindo, setExcluindo] = useState<{ id: string; texto: string } | null>(null);
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
        .select("id, nome, brinco, categoria, especie, nascimento, mae, pai, sexo, status")
        .eq("fazenda_id", fazenda!.id)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const animalSelecionado = animais.data?.find((a) => a.id === animalId) ?? null;

  // Só fêmeas que ainda estão no rebanho — vendido/morto e macho não
  // entram em cobertura, diagnóstico, parto etc.
  const animaisParaSelecao = (animais.data ?? [])
    .filter((a) => a.status !== "vendido" && a.status !== "morto")
    .filter((a) => especieDoAnimal(a) === especieVisivel)
    .filter((a) => !TIPOS_SEM_TOURO_NO_ANIMAL.has(tipo) || a.categoria !== categoriaReprodutor)
    .filter((a) =>
      tipo === "diagnostico" || TIPOS_SEM_TOURO_NO_ANIMAL.has(tipo)
        ? a.sexo !== "macho" && a.sexo !== "castrado"
        : true,
    );

  useEffect(() => {
    if (animalId && !animaisParaSelecao.some((a) => a.id === animalId)) setAnimalId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, animais.data, visaoEspecie]);

  // Touros cadastrados no rebanho da fazenda — o campo de texto livre fica
  // só pra quando o touro/sêmen doador não é um animal cadastrado aqui.
  const touros = useQuery({
    queryKey: ["animais-touros", fazenda?.id, categoriaReprodutor],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("id, nome, brinco, status")
        .eq("fazenda_id", fazenda!.id)
        .eq("categoria", categoriaReprodutor)
        .order("nome");
      if (error) throw error;
      return (data ?? []).filter((t) => t.status !== "vendido" && t.status !== "morto");
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
        .select("*, animais(nome, mae, pai, nascimento, categoria)")
        .eq("fazenda_id", fazenda!.id)
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Registro sem animal vinculado (ex: diagnóstico avulso) não some — só
  // filtra quem tem como saber a espécie e ela não bate com a visão atual.
  const registrosFiltrados = (registros.data ?? []).filter((r) => {
    const categoria = (r as { animais?: { categoria?: string } | null }).animais?.categoria;
    const especie = especieDaCategoria(categoria);
    return especie === null || especie === especieVisivel;
  });

  // Situação reprodutiva de cada fêmea a partir do histórico: o último
  // serviço (cobertura/IA) sem parto depois dele é uma gestação em aberto;
  // diagnóstico negativo encerra, positivo confirma.
  const situacao = useMemo(() => {
    const hoje = hojeISO();
    const porAnimal = new Map<string, typeof registrosFiltrados>();
    for (const r of registrosFiltrados) {
      if (!r.animal_id) continue;
      const lista = porAnimal.get(r.animal_id) ?? [];
      lista.push(r);
      porAnimal.set(r.animal_id, lista);
    }
    const partos: {
      animalId: string;
      nome: string;
      previsao: string;
      confirmada: boolean;
      secarAte: string | null;
    }[] = [];
    const aguardandoDiagnostico: { animalId: string; nome: string; servico: string }[] = [];
    for (const [animalId, lista] of porAnimal) {
      const ordenados = [...lista].sort((a, b) => dataISO(a.data).localeCompare(dataISO(b.data)));
      let servico: (typeof lista)[number] | null = null;
      let diagnostico: string | null = null;
      for (const r of ordenados) {
        if (r.tipo === "cobertura" || r.tipo === "inseminacao") {
          servico = r;
          diagnostico = null;
        } else if (r.tipo === "diagnostico" && servico) {
          diagnostico = r.resultado ?? null;
        } else if (r.tipo === "parto") {
          servico = null;
          diagnostico = null;
        }
      }
      if (!servico || diagnostico === "negativo") continue;
      const animal = animais.data?.find((a) => a.id === animalId);
      if (animal && (animal.status === "vendido" || animal.status === "morto")) continue;
      const nome = animal?.nome || animal?.brinco || "Animal";
      const dataServico = dataISO(servico.data);
      if (servico.previsao_parto) {
        const previsao = dataISO(servico.previsao_parto);
        const secar = new Date(`${previsao}T00:00:00Z`);
        secar.setUTCDate(secar.getUTCDate() - DIAS_SECAGEM_ANTES_PARTO);
        partos.push({
          animalId,
          nome,
          previsao,
          confirmada: diagnostico === "positivo",
          secarAte: soOvino ? null : secar.toISOString().slice(0, 10),
        });
      }
      if (diagnostico === null && dataServico <= diasAtrasISO(DIAS_PARA_DIAGNOSTICO)) {
        aguardandoDiagnostico.push({ animalId, nome, servico: dataServico });
      }
    }
    partos.sort((a, b) => a.previsao.localeCompare(b.previsao));
    aguardandoDiagnostico.sort((a, b) => a.servico.localeCompare(b.servico));
    return { partos, aguardandoDiagnostico, hoje };
  }, [registrosFiltrados, animais.data, soOvino]);

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("reproducao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro excluído.");
      setExcluindo(null);
      queryClient.invalidateQueries({ queryKey: ["reproducao"] });
      queryClient.invalidateQueries({ queryKey: ["ficha-reproducao"] });
      queryClient.invalidateQueries({ queryKey: ["indices-rebanho"] });
    },
    onError: () => toast.error("Não conseguimos excluir agora. Tente novamente."),
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
      resultado: string | null;
    }) => {
      const { error } = await db.from("reproducao").insert({
        fazenda_id: fazenda!.id,
        animal_id: vars.animalId || null,
        tipo: vars.tipo,
        data: vars.data,
        touro: vars.touro.trim() || null,
        previsao_parto: vars.previsaoParto,
        resultado: vars.resultado,
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
      {ambasAtividades ? (
        <div className="mb-4 inline-flex rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setVisaoEspecie("bovino")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transicao-suave",
              visaoEspecie === "bovino"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Bovinos
          </button>
          <button
            type="button"
            onClick={() => setVisaoEspecie("ovino")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transicao-suave",
              visaoEspecie === "ovino"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Ovinos
          </button>
        </div>
      ) : null}
      <form
        className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (requerPrevisao && !touroTextoAtual()) {
            toast.error(`Informe o ${rotuloReprodutor.toLowerCase()} ou o sêmen usado.`);
            return;
          }
          salvar.mutate({
            tipo,
            animalId,
            data,
            touro: requerPrevisao ? touroTextoAtual() : "",
            previsaoParto: requerPrevisao ? previsaoParto : null,
            resultado: tipo === "diagnostico" ? resultadoDiagnostico : null,
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
        {tipo === "diagnostico" ? (
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <Label htmlFor="resultado-diagnostico">Resultado</Label>
            <select
              id="resultado-diagnostico"
              value={resultadoDiagnostico}
              onChange={(e) => setResultadoDiagnostico(e.target.value as "positivo" | "negativo")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="positivo">Prenhe (positivo)</option>
              <option value="negativo">Vazia (negativo)</option>
            </select>
          </div>
        ) : null}
        {requerPrevisao ? (
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <Label htmlFor="touro">
              {rotuloReprodutor} / sêmen <span className="text-destructive">*</span>
            </Label>
            <select
              id="touro"
              value={touroId}
              onChange={(e) => setTouroId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              <option value="" disabled>
                Selecione
              </option>
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
            <Label htmlFor="touro-custom">
              Nome do {rotuloReprodutor.toLowerCase()}/sêmen{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="touro-custom"
              value={touroCustom}
              onChange={(e) => setTouroCustom(e.target.value)}
              required
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

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Partos previstos</h2>
          <p className="text-xs text-muted-foreground">
            Fêmeas cobertas ou inseminadas, sem parto registrado depois.
            {soOvino ? "" : " A data de secagem é ~60 dias antes do parto."}
          </p>
          {situacao.partos.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma gestação em andamento.</p>
          ) : (
            <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto">
              {situacao.partos.map((p) => {
                const passou = p.previsao < situacao.hoje;
                return (
                  <li
                    key={p.animalId}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.confirmada ? "Prenhez confirmada" : "Sem diagnóstico ainda"}
                        {p.secarAte && !passou ? ` · secar até ${dataCurta(p.secarAte)}` : ""}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                        passou ? "bg-destructive/15 text-destructive" : "bg-accent text-primary",
                      )}
                    >
                      {passou ? `Previsto ${dataCurta(p.previsao)}` : dataCurta(p.previsao)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Aguardando diagnóstico</h2>
          <p className="text-xs text-muted-foreground">
            Serviço há mais de {DIAS_PARA_DIAGNOSTICO} dias e nenhum diagnóstico registrado.
          </p>
          {situacao.aguardandoDiagnostico.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nada pendente.</p>
          ) : (
            <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto">
              {situacao.aguardandoDiagnostico.map((a) => (
                <li
                  key={a.animalId}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="truncate font-medium">{a.nome}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    serviço em {dataCurta(a.servico)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {registrosFiltrados.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          titulo="Nenhum registro reprodutivo"
          descricao="Registre uma cobertura ou inseminação para calcular a previsão de parto."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {registrosFiltrados.map((r) => {
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
                    {r.tipo === "diagnostico" && r.resultado ? (
                      <span
                        className={cn(
                          "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                          r.resultado === "positivo"
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.resultado === "positivo" ? "Prenhe" : "Vazia"}
                      </span>
                    ) : null}
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
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {dataCurta(r.data)}
                  {r.previsao_parto ? ` · previsão de parto ${dataCurta(r.previsao_parto)}` : ""}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:text-destructive"
                    aria-label="Excluir registro"
                    onClick={() =>
                      setExcluindo({
                        id: r.id,
                        texto: `${TIPO_LABEL[r.tipo ?? ""] ?? r.tipo} · ${animal?.nome ?? "Rebanho"} · ${dataCurta(r.data)}`,
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

      <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
            <AlertDialogDescription>{excluindo?.texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluindo && excluir.mutate(excluindo.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
