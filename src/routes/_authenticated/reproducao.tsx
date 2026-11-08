import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Baby,
  CalendarClock,
  HeartPulse,
  Pencil,
  Plus,
  Repeat,
  Stethoscope,
  Trash2,
  Users,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, dataISO, diasAtrasISO, hojeISO, idadeTexto } from "@/lib/formato";
import { especieDaCategoria, especieDoAnimal } from "@/lib/especies";
import { cn } from "@/lib/utils";
import {
  agruparPorAnimal,
  DIAS_PARA_DIAGNOSTICO,
  DIAS_SECAGEM_ANTES_PARTO,
  DIAS_VAZIA,
  estadoDaFemea,
  indicesReproducao,
  statusAposRegistro,
  type RegistroRepro,
} from "@/lib/reproducao";

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
  const [custo, setCusto] = useState("");
  // Cria do parto: cadastrada no Rebanho junto com o registro.
  const [criaSexo, setCriaSexo] = useState<"femea" | "macho" | "nao">("femea");
  const [criaNome, setCriaNome] = useState("");
  const [criaBrinco, setCriaBrinco] = useState("");
  const [criaPeso, setCriaPeso] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
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
        .select("id, nome, brinco, categoria, especie, nascimento, mae, pai, sexo, status, lote")
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

  // Situação reprodutiva de cada fêmea a partir do histórico (ver
  // src/lib/reproducao.ts): gestação em aberto, diagnóstico pendente,
  // vazias e os índices do período.
  const situacao = useMemo(() => {
    const hoje = hojeISO();
    const porAnimal = agruparPorAnimal(registrosFiltrados as RegistroRepro[]);
    const ativa = (id: string) => {
      const a = animais.data?.find((x) => x.id === id);
      return a && a.status !== "vendido" && a.status !== "morto" ? a : null;
    };
    const partos: {
      animalId: string;
      nome: string;
      previsao: string;
      confirmada: boolean;
      secarAte: string | null;
      secar: boolean;
    }[] = [];
    const aguardandoDiagnostico: { animalId: string; nome: string; servico: string }[] = [];
    const vazias: {
      animalId: string;
      nome: string;
      desde: string;
      dias: number;
      motivo: string;
    }[] = [];
    const diasVazia = DIAS_VAZIA[especieVisivel];
    for (const [animalId, historico] of porAnimal) {
      const animal = ativa(animalId);
      if (!animal) continue;
      const nome = animal.nome || animal.brinco || "Animal";
      const est = estadoDaFemea(historico);
      if (est.servicoAberto) {
        const dataServico = dataISO(est.servicoAberto.data);
        if (est.servicoAberto.previsao_parto) {
          const previsao = dataISO(est.servicoAberto.previsao_parto);
          const secarEm = new Date(`${previsao}T00:00:00Z`);
          secarEm.setUTCDate(secarEm.getUTCDate() - DIAS_SECAGEM_ANTES_PARTO);
          const secarAte = soOvino ? null : secarEm.toISOString().slice(0, 10);
          partos.push({
            animalId,
            nome,
            previsao,
            confirmada: est.diagnostico === "positivo",
            secarAte,
            // Hora de secar: já passou da data e ainda não registrou secagem.
            secar:
              !!secarAte &&
              secarAte <= hoje &&
              !est.secagemDepoisDoServico &&
              animal.status !== "seca",
          });
        }
        if (est.diagnostico === null && dataServico <= diasAtrasISO(DIAS_PARA_DIAGNOSTICO)) {
          aguardandoDiagnostico.push({ animalId, nome, servico: dataServico });
        }
      } else if (est.vaziaDesde) {
        const dias = Math.round(
          (new Date(`${hoje}T00:00:00Z`).getTime() -
            new Date(`${est.vaziaDesde}T00:00:00Z`).getTime()) /
            86400000,
        );
        const posParto = est.vaziaDesde === est.ultimoParto;
        // Diagnóstico negativo: vazia na hora. Depois do parto: só passa a
        // contar quando já devia ter sido servida de novo.
        if (!posParto || dias >= diasVazia) {
          vazias.push({
            animalId,
            nome,
            desde: est.vaziaDesde,
            dias,
            motivo: posParto ? "desde o parto" : "diagnóstico negativo",
          });
        }
      }
    }
    partos.sort((a, b) => a.previsao.localeCompare(b.previsao));
    aguardandoDiagnostico.sort((a, b) => a.servico.localeCompare(b.servico));
    vazias.sort((a, b) => b.dias - a.dias);
    const ativos = new Map(
      [...porAnimal].filter(([id]) => ativa(id)) as [string, RegistroRepro[]][],
    );
    const indices = indicesReproducao(ativos, hoje);
    // IEP olha o histórico inteiro, inclusive de quem já saiu do rebanho.
    const iep = indicesReproducao(porAnimal, hoje).intervaloEntrePartos;
    return { partos, aguardandoDiagnostico, vazias, hoje, indices: { ...indices, iep } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["ficha-custos"] });
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
      custo: number;
      cria: { sexo: "femea" | "macho"; nome: string; brinco: string; peso: number | null } | null;
    }) => {
      const { data: criados, error } = await db.from("reproducao").insert({
        fazenda_id: fazenda!.id,
        animal_id: vars.animalId || null,
        tipo: vars.tipo,
        data: vars.data,
        touro: vars.touro.trim() || null,
        previsao_parto: vars.previsaoParto,
        resultado: vars.resultado,
      } as never);
      if (error) throw error;
      // Custo (sêmen, inseminador, veterinário) vira despesa ligada ao
      // registro e à fêmea; excluir o registro apaga a despesa junto. Se só
      // a despesa falhar, o registro fica e avisamos (refazer duplicaria).
      let custoOk = true;
      if (vars.custo > 0) {
        const animal = animais.data?.find((a) => a.id === vars.animalId);
        const nome = animal ? `${animal.nome}${animal.brinco ? ` (${animal.brinco})` : ""}` : "";
        const { error: erroCusto } = await db.from("financeiro_lancamentos").insert({
          fazenda_id: fazenda!.id,
          tipo: "despesa",
          descricao: `${TIPO_LABEL[vars.tipo] ?? vars.tipo}${vars.touro.trim() ? `: ${vars.touro.trim()}` : ""}${nome ? ` — ${nome}` : ""}`,
          valor: Math.round(vars.custo * 100) / 100,
          data: vars.data,
          categoria: "sanidade",
          lote: String(animal?.lote ?? "").trim() || null,
          animal_id: vars.animalId || null,
          reproducao_id: (criados?.[0]?.id as string | undefined) ?? null,
        } as never);
        custoOk = !erroCusto;
      }
      // A situação do animal acompanha o registro (prenhe, vazia, seca),
      // sem tirar de lactação ou engorda quem está nelas.
      const animal = animais.data?.find((a) => a.id === vars.animalId);
      const novoStatus = animal
        ? statusAposRegistro(animal.status, vars.tipo, vars.resultado)
        : null;
      if (novoStatus && animal) {
        await db
          .from("animais")
          .update({ status: novoStatus } as never)
          .eq("id", animal.id);
      }

      // Parto: a cria entra no Rebanho com mãe, pai (touro do último
      // serviço), lote da mãe e data de nascimento.
      let criaOk: boolean | null = null;
      let criaErro = "";
      if (vars.tipo === "parto" && vars.cria && animal) {
        const historico = (registros.data ?? []).filter(
          (r) => r.animal_id === animal.id,
        ) as RegistroRepro[];
        const pai = estadoDaFemea(historico).servicoAberto?.touro ?? null;
        const nomeMae = animal.nome || animal.brinco || "";
        const { data: criadas, error: erroCria } = await db.from("animais").insert({
          fazenda_id: fazenda!.id,
          nome: vars.cria.nome.trim() || `Cria de ${nomeMae}`,
          brinco: vars.cria.brinco.trim() || null,
          especie: especieVisivel,
          sexo: vars.cria.sexo,
          categoria: especieVisivel === "ovino" ? "cordeiro" : "bezerro",
          status: "ativo",
          nascimento: vars.data,
          peso_kg: vars.cria.peso,
          lote: String(animal.lote ?? "").trim() || null,
          mae: nomeMae || null,
          pai,
        } as never);
        criaOk = !erroCria;
        criaErro = erroCria?.message ?? "";
        const criaId = criadas?.[0]?.id as string | undefined;
        if (criaId && vars.cria.peso) {
          await db.from("manejos").insert({
            fazenda_id: fazenda!.id,
            animal_id: criaId,
            tipo: "pesagem",
            data: vars.data,
            valor: vars.cria.peso,
            descricao: "Peso ao nascer",
          } as never);
        }
      }
      return { ...vars, custoOk, novoStatus, criaOk, criaErro };
    },
    onSuccess: (vars) => {
      if (!vars.custoOk) {
        toast.error(
          "Registro salvo, mas o custo não entrou no Financeiro. Lance em Financeiro → Novo lançamento.",
        );
      } else {
        toast.success(
          vars.custo > 0 ? "Registro salvo e custo lançado no Financeiro." : "Registro salvo.",
        );
      }
      if (vars.criaOk === true) toast.success("Cria cadastrada no Rebanho.");
      if (vars.criaOk === false) {
        toast.error(
          vars.criaErro || "O parto foi salvo, mas não conseguimos cadastrar a cria no Rebanho.",
        );
      }
      if (vars.novoStatus) {
        const rotulo: Record<string, string> = { prenhe: "prenhe", ativo: "vazia", seca: "seca" };
        toast.message(
          `Situação do animal atualizada: ${rotulo[vars.novoStatus] ?? vars.novoStatus}.`,
        );
      }
      setTouroId("");
      setTouroCustom("");
      setCusto("");
      setCriaNome("");
      setCriaBrinco("");
      setCriaPeso("");
      setCriaSexo("femea");
      for (const chave of ["animais", "animais-simples", "animais-contagem", "inicio-resumo"]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
      for (const chave of ["financeiro", "inicio-resumo", "ficha-custos", "despesas-lote"]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
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

  // Histórico: filtro por animal e tipo, 30 por vez, e edição de registro.
  const [filtroAnimalHist, setFiltroAnimalHist] = useState("");
  const [filtroTipoHist, setFiltroTipoHist] = useState("");
  const [limiteHist, setLimiteHist] = useState(30);
  const historico = registrosFiltrados.filter(
    (r) =>
      (!filtroAnimalHist || r.animal_id === filtroAnimalHist) &&
      (!filtroTipoHist || r.tipo === filtroTipoHist),
  );
  const animaisDoHistorico = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const r of registrosFiltrados) {
      const nome = (r as { animais?: { nome?: string } | null }).animais?.nome;
      if (r.animal_id && nome && !vistos.has(r.animal_id)) vistos.set(r.animal_id, nome);
    }
    return [...vistos].sort((a, b) => a[1].localeCompare(b[1]));
  }, [registrosFiltrados]);

  const [editando, setEditando] = useState<{
    id: string;
    tipo: string;
    animalId: string | null;
    nome: string;
    data: string;
    touro: string;
    previsao: string;
    resultado: string;
    resultadoAntes: string;
  } | null>(null);

  const atualizar = useMutation({
    mutationFn: async (e: NonNullable<typeof editando>) => {
      const servico = e.tipo === "cobertura" || e.tipo === "inseminacao";
      const campos: Record<string, string | null> = { data: e.data };
      if (servico) {
        campos["touro"] = e.touro.trim() || null;
        campos["previsao_parto"] = e.previsao || null;
      }
      if (e.tipo === "diagnostico") campos["resultado"] = e.resultado;
      const { error } = await db
        .from("reproducao")
        .update(campos as never)
        .eq("id", e.id);
      if (error) throw error;
      // Diagnóstico corrigido (prenhe ↔ vazia): a situação do animal acompanha.
      if (e.tipo === "diagnostico" && e.resultado !== e.resultadoAntes && e.animalId) {
        const animal = animais.data?.find((a) => a.id === e.animalId);
        const novo = animal ? statusAposRegistro(animal.status, "diagnostico", e.resultado) : null;
        if (novo) {
          await db
            .from("animais")
            .update({ status: novo } as never)
            .eq("id", e.animalId);
        }
      }
    },
    onSuccess: () => {
      toast.success("Registro atualizado.");
      setEditando(null);
      for (const chave of [
        "reproducao",
        "ficha-reproducao",
        "indices-rebanho",
        "animais-simples",
        "animais",
      ]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  // Atalhos das listas: deixa o formulário pronto pro animal e rola até ele.
  function preencher(novoTipo: string, id: string) {
    setTipo(novoTipo);
    setAnimalId(id);
    setData(hojeISO());
    if (novoTipo === "diagnostico") setResultadoDiagnostico("positivo");
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const ind = situacao.indices;
  const kpis: { icone: typeof Baby; rotulo: string; valor: string; detalhe?: string }[] = [
    {
      icone: Baby,
      rotulo: "Gestantes",
      valor: `${ind.gestantes}`,
      detalhe: `${ind.confirmadas} confirmada${ind.confirmadas === 1 ? "" : "s"}`,
    },
    {
      icone: HeartPulse,
      rotulo: "Taxa de prenhez (12 meses)",
      valor: ind.taxaPrenhezServico !== null ? `${ind.taxaPrenhezServico}%` : "—",
      detalhe:
        ind.servicosComDesfecho > 0
          ? `${ind.servicosComDesfecho} serviço${ind.servicosComDesfecho === 1 ? "" : "s"} com resultado`
          : "sem serviços com resultado",
    },
    {
      icone: Repeat,
      rotulo: "Serviços por concepção",
      valor:
        ind.servicosPorConcepcao !== null
          ? ind.servicosPorConcepcao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
          : "—",
    },
    {
      icone: CalendarClock,
      rotulo: "Intervalo entre partos",
      valor:
        ind.iep !== null
          ? `${(ind.iep / 30.44).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses`
          : "—",
      detalhe: ind.iep !== null ? `${ind.iep} dias em média` : "precisa de 2 partos da mesma fêmea",
    },
    {
      icone: Stethoscope,
      rotulo: `Vazias`,
      valor: `${situacao.vazias.length}`,
      detalhe: `+${DIAS_VAZIA[especieVisivel]} dias do parto ou diagnóstico negativo`,
    },
  ];

  return (
    <AppShell titulo="Reprodução">
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
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {kpis.map((k) => (
          <div key={k.rotulo} className="h-full rounded-xl border border-border bg-card p-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
              <k.icone className="size-4" aria-hidden="true" />
            </span>
            <p className="mt-2 text-[11px] text-muted-foreground">{k.rotulo}</p>
            <p className="font-display text-lg font-extrabold">{k.valor}</p>
            {k.detalhe ? <p className="text-[11px] text-muted-foreground">{k.detalhe}</p> : null}
          </div>
        ))}
      </div>

      <form
        ref={formRef}
        id="form-reproducao"
        className="mb-5 flex scroll-mt-24 flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
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
            custo: Number(custo) || 0,
            cria:
              tipo === "parto" && criaSexo !== "nao"
                ? {
                    sexo: criaSexo,
                    nome: criaNome,
                    brinco: criaBrinco,
                    peso: Number(criaPeso) > 0 ? Number(criaPeso) : null,
                  }
                : null,
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
        {tipo === "parto" ? (
          <>
            <div className="min-w-[150px] flex-1 space-y-1.5">
              <Label htmlFor="cria-sexo">Cria</Label>
              <select
                id="cria-sexo"
                value={criaSexo}
                onChange={(e) => setCriaSexo(e.target.value as typeof criaSexo)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="femea">Cadastrar fêmea</option>
                <option value="macho">Cadastrar macho</option>
                <option value="nao">Não cadastrar</option>
              </select>
            </div>
            {criaSexo !== "nao" ? (
              <>
                <div className="min-w-[150px] flex-1 space-y-1.5">
                  <Label htmlFor="cria-nome">Nome da cria</Label>
                  <Input
                    id="cria-nome"
                    value={criaNome}
                    placeholder={
                      animalSelecionado ? `Cria de ${animalSelecionado.nome}` : "Opcional"
                    }
                    onChange={(e) => setCriaNome(e.target.value)}
                  />
                </div>
                <div className="min-w-[120px] flex-1 space-y-1.5">
                  <Label htmlFor="cria-brinco">Brinco</Label>
                  <Input
                    id="cria-brinco"
                    value={criaBrinco}
                    placeholder="Opcional"
                    onChange={(e) => setCriaBrinco(e.target.value)}
                  />
                </div>
                <div className="min-w-[120px] flex-1 space-y-1.5">
                  <Label htmlFor="cria-peso">Peso ao nascer (kg)</Label>
                  <Input
                    id="cria-peso"
                    type="number"
                    step="0.1"
                    min="0"
                    value={criaPeso}
                    placeholder="Opcional"
                    onChange={(e) => setCriaPeso(e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </>
        ) : null}
        <div className="min-w-[150px] flex-1 space-y-1.5">
          <Label htmlFor="custo-reproducao">Custo (R$)</Label>
          <Input
            id="custo-reproducao"
            type="number"
            step="0.01"
            min="0"
            value={custo}
            placeholder="Opcional"
            onChange={(e) => setCusto(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Sêmen, inseminador, veterinário.</p>
        </div>
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
              onClick={() => {
                const a = animais.data?.find((x) => x.id === confirmarLactacao.animalId);
                // Pariu e não entrou em lactação: deixa de ser prenhe/seca.
                if (a && (a.status === "prenhe" || a.status === "seca")) {
                  void db
                    .from("animais")
                    .update({ status: "ativo" } as never)
                    .eq("id", a.id)
                    .then(() => queryClient.invalidateQueries({ queryKey: ["animais-simples"] }));
                }
                setConfirmarLactacao(null);
              }}
            >
              Não
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Partos previstos</h2>
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
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          passou ? "bg-destructive/15 text-destructive" : "bg-accent text-primary",
                        )}
                      >
                        {passou ? `Previsto ${dataCurta(p.previsao)}` : dataCurta(p.previsao)}
                      </span>
                      <span className="flex gap-1">
                        {p.secar ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => preencher("secagem", p.animalId)}
                          >
                            Secar
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => preencher("parto", p.animalId)}
                        >
                          Registrar parto
                        </Button>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Aguardando diagnóstico</h2>
          {situacao.aguardandoDiagnostico.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nada pendente.</p>
          ) : (
            <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto">
              {situacao.aguardandoDiagnostico.map((a) => (
                <li
                  key={a.animalId}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      serviço em {dataCurta(a.servico)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => preencher("diagnostico", a.animalId)}
                  >
                    Registrar diagnóstico
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Vazias</h2>
          {situacao.vazias.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhuma fêmea vazia esperando serviço.
            </p>
          ) : (
            <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto">
              {situacao.vazias.map((v) => (
                <li
                  key={v.animalId}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{v.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {v.dias} dia{v.dias === 1 ? "" : "s"} · {v.motivo}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => preencher("cobertura", v.animalId)}
                  >
                    Registrar serviço
                  </Button>
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
        <section className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold">Histórico</h2>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Filtrar por animal"
                value={filtroAnimalHist}
                onChange={(e) => {
                  setFiltroAnimalHist(e.target.value);
                  setLimiteHist(30);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Todos os animais</option>
                {animaisDoHistorico.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por tipo"
                value={filtroTipoHist}
                onChange={(e) => {
                  setFiltroTipoHist(e.target.value);
                  setLimiteHist(30);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Todos os tipos</option>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {historico.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nenhum registro com esse filtro.
            </p>
          ) : null}
          <ul className="divide-y divide-border">
            {historico.slice(0, limiteHist).map((r) => {
              const animal = (
                r as {
                  animais?: {
                    nome?: string;
                    mae?: string;
                    pai?: string;
                    nascimento?: string;
                  } | null;
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
                      className="size-7"
                      aria-label="Editar registro"
                      onClick={() =>
                        setEditando({
                          id: r.id,
                          tipo: r.tipo ?? "",
                          animalId: r.animal_id ?? null,
                          nome: animal?.nome ?? "Rebanho",
                          data: dataISO(r.data),
                          touro: r.touro ?? "",
                          previsao: r.previsao_parto ? dataISO(r.previsao_parto) : "",
                          resultado: r.resultado ?? "positivo",
                          resultadoAntes: r.resultado ?? "positivo",
                        })
                      }
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
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
          {historico.length > limiteHist ? (
            <div className="border-t border-border px-4 py-3 text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLimiteHist((n) => n + 30)}
              >
                Ver mais ({historico.length - limiteHist})
              </Button>
            </div>
          ) : null}
        </section>
      )}

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar {editando ? (TIPO_LABEL[editando.tipo] ?? editando.tipo).toLowerCase() : ""}
              {editando ? ` · ${editando.nome}` : ""}
            </DialogTitle>
          </DialogHeader>
          {editando ? (
            <form
              id="form-editar-repro"
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                atualizar.mutate(editando);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="ed-data">Data</Label>
                <Input
                  id="ed-data"
                  type="date"
                  value={editando.data}
                  onChange={(e) => setEditando({ ...editando, data: e.target.value })}
                  required
                />
              </div>
              {editando.tipo === "diagnostico" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ed-resultado">Resultado</Label>
                  <select
                    id="ed-resultado"
                    value={editando.resultado}
                    onChange={(e) => setEditando({ ...editando, resultado: e.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="positivo">Prenhe (positivo)</option>
                    <option value="negativo">Vazia (negativo)</option>
                  </select>
                </div>
              ) : null}
              {editando.tipo === "cobertura" || editando.tipo === "inseminacao" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-touro">{rotuloReprodutor} / sêmen</Label>
                    <Input
                      id="ed-touro"
                      value={editando.touro}
                      onChange={(e) => setEditando({ ...editando, touro: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-previsao">Previsão de parto</Label>
                    <Input
                      id="ed-previsao"
                      type="date"
                      value={editando.previsao}
                      onChange={(e) => setEditando({ ...editando, previsao: e.target.value })}
                    />
                  </div>
                </>
              ) : null}
            </form>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-editar-repro" disabled={atualizar.isPending}>
              {atualizar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
