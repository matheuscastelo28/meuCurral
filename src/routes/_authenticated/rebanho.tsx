import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beef, Plus, Search, Syringe, Users, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { DialogManejoSanitario } from "@/components/DialogManejoSanitario";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CampoFiltro, CLASSE_SELECT_FILTRO, PainelFiltros } from "@/components/PainelFiltros";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLimitePlano } from "@/hooks/use-fazenda";
import { dataCurta, dataISO, hojeISO, idadeTexto, pesoTexto } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";
import { rotuloCategoria, rotuloSexo, rotuloStatus } from "@/lib/rotulos";
import {
  CATEGORIAS,
  CATEGORIAS_BOVINO,
  CATEGORIAS_OVINO,
  especieDaCategoria,
  OUTRA_RACA,
  RACAS_BOVINO,
  RACAS_OVINO,
  type Especie,
} from "@/lib/especies";

export const Route = createFileRoute("/_authenticated/rebanho")({
  head: () => ({
    meta: [
      { title: "Rebanho — Curral Online" },
      { name: "description", content: "Cadastro e ficha dos animais da fazenda." },
      { property: "og:title", content: "Rebanho — Curral Online" },
      { property: "og:description", content: "Cadastro e ficha dos animais da fazenda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { editar?: string; sanidade?: boolean } => {
    const editar = typeof search["editar"] === "string" ? search["editar"] : undefined;
    const sanidade = search["sanidade"] === true || search["sanidade"] === "1" ? true : undefined;
    return { ...(editar ? { editar } : {}), ...(sanidade ? { sanidade } : {}) };
  },
  component: Rebanho,
});

const STATUS = ["ativo", "lactacao", "seca", "prenhe", "engorda", "vendido", "morto"] as const;
const SEXOS = ["femea", "macho", "castrado"] as const;

// Categoria e raça sempre dependem da espécie escolhida no próprio
// formulário — não mais só da atividade da fazenda — pra fazenda com as
// duas atividades conseguir cadastrar bovino e ovino sem misturar as
// opções no mesmo campo.
function racasDaEspecie(especie: Especie): string[] {
  return especie === "ovino" ? RACAS_OVINO : RACAS_BOVINO;
}
function categoriasDaEspecie(especie: Especie): readonly string[] {
  return especie === "ovino" ? [...CATEGORIAS_OVINO, "outro"] : [...CATEGORIAS_BOVINO, "outro"];
}
function categoriaPadraoDaEspecie(especie: Especie): string {
  return especie === "ovino" ? "ovelha" : "vaca";
}

/**
 * O servidor devolve uma mensagem amigável quando o brinco já está em uso
 * (ver verificarBrincosDuplicados em dados.functions.ts). Só repassamos essa
 * mensagem específica pro usuário — qualquer outro erro usa o texto padrão,
 * pra nunca vazar um erro técnico do banco na tela.
 */
function mensagemErroAnimal(erro: unknown, padrao: string): string {
  const msg =
    erro && typeof erro === "object" && "message" in erro ? String((erro as any).message) : "";
  return msg.startsWith("Já existe um animal com o brinco") ? msg : padrao;
}

// Campos opcionais que o usuário pode escolher incluir no cadastro em
// grupo — nome é sempre pedido (identificação obrigatória de cada animal,
// mesmo atributo obrigatório do cadastro individual) e lote é do grupo
// inteiro, não entra nessa lista de escolha por campo.
type CampoGrupo =
  | "brinco"
  | "sexo"
  | "categoria"
  | "status"
  | "nascimento"
  | "peso_kg"
  | "raca"
  | "mae"
  | "pai"
  | "observacoes";

const CAMPOS_GRUPO: { chave: CampoGrupo; rotulo: string }[] = [
  { chave: "brinco", rotulo: "Brinco" },
  { chave: "sexo", rotulo: "Sexo" },
  { chave: "categoria", rotulo: "Categoria" },
  { chave: "status", rotulo: "Situação" },
  { chave: "nascimento", rotulo: "Nascimento" },
  { chave: "peso_kg", rotulo: "Peso (kg)" },
  { chave: "raca", rotulo: "Raça" },
  { chave: "mae", rotulo: "Mãe" },
  { chave: "pai", rotulo: "Pai" },
  { chave: "observacoes", rotulo: "Observações" },
];

const CAMPOS_GRUPO_PADRAO: Record<CampoGrupo, boolean> = {
  brinco: true,
  sexo: true,
  categoria: true,
  status: true,
  nascimento: false,
  peso_kg: false,
  raca: true,
  mae: false,
  pai: false,
  observacoes: false,
};

interface EntradaAnimalGrupo {
  nome: string;
  especie: Especie;
  brinco: string;
  sexo: string;
  categoria: string;
  status: string;
  nascimento: string;
  peso_kg: string;
  raca: string;
  racaCustom: string;
  mae: string;
  pai: string;
  observacoes: string;
}

function entradaGrupoVazia(especiePadrao: Especie = "bovino"): EntradaAnimalGrupo {
  return {
    nome: "",
    especie: especiePadrao,
    brinco: "",
    sexo: SEXOS[0],
    categoria: categoriaPadraoDaEspecie(especiePadrao),
    status: STATUS[0],
    nascimento: "",
    peso_kg: "",
    raca: racasDaEspecie(especiePadrao)[0]!,
    racaCustom: "",
    mae: "",
    pai: "",
    observacoes: "",
  };
}

function Rebanho() {
  const prefs = usePreferencias();
  const { fazenda, atingiu, usados, limite, plano } = useLimitePlano();
  // Só mostra raça/categoria de bovino OU de ovino conforme a atividade da
  // fazenda — a lista combinada só aparece quando as duas estão marcadas.
  const atividades = fazenda?.atividades ?? ["bovino"];
  const temBovino = atividades.includes("bovino");
  const temOvino = atividades.includes("ovino");
  const soOvino = temOvino && !temBovino;
  const soBovino = temBovino && !temOvino;
  // Só as espécies marcadas em Configurações aparecem como opção. Na edição,
  // a espécie atual do animal continua na lista mesmo que tenha sido
  // desmarcada depois, pra não trocar a espécie de ninguém sem querer.
  const especiesPermitidas: Especie[] = soOvino
    ? ["ovino"]
    : soBovino
      ? ["bovino"]
      : ["bovino", "ovino"];
  function opcoesEspecie(atual: Especie) {
    const lista = especiesPermitidas.includes(atual)
      ? especiesPermitidas
      : [...especiesPermitidas, atual];
    return lista.map((e) => (
      <option key={e} value={e}>
        {e === "bovino" ? "Bovino" : "Ovino"}
      </option>
    ));
  }
  const racasAtual = soOvino
    ? RACAS_OVINO
    : soBovino
      ? RACAS_BOVINO
      : // As duas listas terminam em "Outra" — tira a duplicata do meio.
        [...RACAS_BOVINO.filter((r) => r !== OUTRA_RACA), ...RACAS_OVINO];
  const categoriasAtual = soOvino
    ? [...CATEGORIAS_OVINO, "outro"]
    : soBovino
      ? [...CATEGORIAS_BOVINO, "outro"]
      : CATEGORIAS;
  const categoriaPadrao = soOvino ? "ovelha" : "vaca";
  const queryClient = useQueryClient();
  const { editar: editarId, sanidade: sanidadeNaUrl } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [sanidadeAberto, setSanidadeAberto] = useState(false);

  // Atalho "Vacinas e manejo" do Início abre o registro direto aqui.
  useEffect(() => {
    if (!sanidadeNaUrl) return;
    setSanidadeAberto(true);
    navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sanidadeNaUrl]);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  // Compartilhado entre "Novo animal" e "Editar animal" — só um dos dois
  // diálogos fica aberto por vez, igual já era com raça/raçaCustom.
  const [especie, setEspecie] = useState<Especie>(soOvino ? "ovino" : "bovino");
  const [raca, setRaca] = useState<string>(racasAtual[0]!);
  const [racaCustom, setRacaCustom] = useState("");
  const [editando, setEditando] = useState<any>(null);

  function selecionarEspecie(nova: Especie) {
    setEspecie(nova);
    setRaca(racasDaEspecie(nova)[0]!);
    setRacaCustom("");
  }

  // ---- Cadastro em grupo (2 cards: escolha de campos, depois o laço) ----
  const [grupoEtapa, setGrupoEtapa] = useState<"campos" | "animais" | null>(null);
  const [grupoLote, setGrupoLote] = useState("");
  const [camposGrupo, setCamposGrupo] = useState<Record<CampoGrupo, boolean>>(CAMPOS_GRUPO_PADRAO);
  const [animaisGrupo, setAnimaisGrupo] = useState<EntradaAnimalGrupo[]>([]);
  const [entradaAtual, setEntradaAtual] = useState<EntradaAnimalGrupo>(
    entradaGrupoVazia(soOvino ? "ovino" : "bovino"),
  );

  const animais = useQuery({
    queryKey: ["animais", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("animais")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Rebanho (pertencente à fazenda) e Vendidos são duas listas separadas —
  // igual ao "Por lote"/"Por animal" da Engorda, cada aba com sua própria
  // contagem. Vendido some do operacional do dia a dia, mas continua
  // consultável na própria aba.
  const [abaRebanho, setAbaRebanho] = useState<"ativo" | "vendido">("ativo");
  const [filtroEspecie, setFiltroEspecie] = useState<"todas" | Especie>("todas");
  const [filtroCategoria, setFiltroCategoria] = useState<"todas" | (typeof CATEGORIAS)[number]>(
    "todas",
  );
  const [filtroSituacao, setFiltroSituacao] = useState<"todas" | (typeof STATUS)[number]>("todas");
  const [filtroSexo, setFiltroSexo] = useState<"todos" | (typeof SEXOS)[number]>("todos");
  const [filtroSaida, setFiltroSaida] = useState<"todas" | "vendido" | "morto">("todas");

  // Categoria é o sinal mais confiável de espécie pra animal cadastrado
  // antes do campo Espécie existir no formulário — mesma lógica de
  // abrirEdicao, reaproveitada aqui pro filtro.
  function especieDoAnimal(a: { categoria?: string | null; especie?: string | null }): Especie {
    return especieDaCategoria(a.categoria) ?? (a.especie === "ovino" ? "ovino" : "bovino");
  }

  // Filtrar por espécie primeiro estreita as opções de categoria mostradas
  // no select de categoria — não faz sentido oferecer "touro" se o filtro
  // já está em Ovino.
  const categoriasParaFiltro =
    filtroEspecie === "todas" ? categoriasAtual : categoriasDaEspecie(filtroEspecie);

  // Espécie desmarcada em Configurações some da lista (os dados continuam
  // guardados e voltam a aparecer se a atividade for marcada de novo).
  const porAba = useMemo(() => {
    const visiveis = (animais.data ?? []).filter((a) =>
      especiesPermitidas.includes(especieDoAnimal(a)),
    );
    return {
      ativo: visiveis.filter((a) => a.status !== "vendido" && a.status !== "morto"),
      vendido: visiveis.filter((a) => a.status === "vendido" || a.status === "morto"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animais.data, especiesPermitidas.join(",")]);
  const ocultosPorEspecie =
    (animais.data ?? []).length - porAba.ativo.length - porAba.vendido.length;

  const filtroAtivo =
    filtroEspecie !== "todas" ||
    filtroCategoria !== "todas" ||
    filtroSituacao !== "todas" ||
    filtroSexo !== "todos" ||
    (abaRebanho === "vendido" && filtroSaida !== "todas");
  const qtdFiltros =
    (busca.trim() ? 1 : 0) +
    [
      filtroEspecie !== "todas",
      filtroCategoria !== "todas",
      abaRebanho === "ativo" && filtroSituacao !== "todas",
      filtroSexo !== "todos",
      abaRebanho === "vendido" && filtroSaida !== "todas",
    ].filter(Boolean).length;

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return porAba[abaRebanho].filter((a) => {
      if (filtroEspecie !== "todas" && especieDoAnimal(a) !== filtroEspecie) return false;
      if (filtroCategoria !== "todas" && a.categoria !== filtroCategoria) return false;
      if (abaRebanho === "ativo" && filtroSituacao !== "todas" && a.status !== filtroSituacao) {
        return false;
      }
      if (abaRebanho === "vendido" && filtroSaida !== "todas" && a.status !== filtroSaida) {
        return false;
      }
      if (filtroSexo !== "todos" && a.sexo !== filtroSexo) return false;
      if (!termo) return true;
      return (
        a.nome.toLowerCase().includes(termo) ||
        (a.brinco ?? "").toLowerCase().includes(termo) ||
        (a.lote ?? "").toLowerCase().includes(termo)
      );
    });
  }, [
    porAba,
    abaRebanho,
    busca,
    filtroEspecie,
    filtroCategoria,
    filtroSituacao,
    filtroSexo,
    filtroSaida,
  ]);

  // Permite abrir a edição direto de outra tela (ex: "Editar dados do
  // animal" na ficha) navegando para /rebanho?editar=<id>.
  useEffect(() => {
    if (!editarId || !animais.data) return;
    const alvo = animais.data.find((a) => a.id === editarId);
    if (alvo) abrirEdicao(alvo);
    navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId, animais.data]);

  // O peso informado no cadastro vira a primeira pesagem do animal — sem
  // isso o GMD do Confinamento só aparecia a partir da 3ª pesagem.
  async function registrarPesagensIniciais(
    criados: { id: string; fazenda_id: string; peso_kg?: unknown }[],
  ) {
    const pesagens = criados
      .filter((a) => Number(a.peso_kg) > 0)
      .map((a) => ({
        fazenda_id: a.fazenda_id,
        animal_id: a.id,
        tipo: "pesagem",
        data: hojeISO(),
        valor: Number(a.peso_kg),
        descricao: "Peso no cadastro",
      }));
    if (pesagens.length === 0) return;
    await db.from("manejos").insert(pesagens as never);
    queryClient.invalidateQueries({ queryKey: ["pesagens-engorda-todas"] });
    queryClient.invalidateQueries({ queryKey: ["indices-engorda"] });
  }

  const criar = useMutation({
    mutationFn: async (form: FormData) => {
      const racaFinal = raca === OUTRA_RACA ? racaCustom.trim() : raca;
      const payload = {
        fazenda_id: fazenda!.id,
        nome: String(form.get("nome") ?? "").trim(),
        especie,
        brinco: String(form.get("brinco") ?? "").trim() || null,
        raca: racaFinal || null,
        sexo: String(form.get("sexo") ?? "femea"),
        categoria: String(form.get("categoria") ?? categoriaPadraoDaEspecie(especie)),
        status: String(form.get("status") ?? "ativo"),
        nascimento: String(form.get("nascimento") ?? "") || null,
        peso_kg: form.get("peso_kg") ? Number(form.get("peso_kg")) : null,
        lote: String(form.get("lote") ?? "").trim() || null,
      };
      const { data: criados, error } = await db.from("animais").insert(payload as never);
      if (error) throw error;
      await registrarPesagensIniciais(criados ?? []);
    },
    onSuccess: () => {
      toast.success("Animal cadastrado.");
      setAberto(false);
      setRaca(racasDaEspecie(especie)[0]!);
      setRacaCustom("");
      queryClient.invalidateQueries({ queryKey: ["animais"] });
      queryClient.invalidateQueries({ queryKey: ["animais-contagem"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: (erro) =>
      toast.error(
        mensagemErroAnimal(
          erro,
          "Não conseguimos salvar agora. Confira os campos e tente de novo.",
        ),
      ),
  });

  const editar = useMutation({
    mutationFn: async (form: FormData) => {
      const racaFinal = raca === OUTRA_RACA ? racaCustom.trim() : raca;
      const payload = {
        nome: String(form.get("nome") ?? "").trim(),
        especie,
        brinco: String(form.get("brinco") ?? "").trim() || null,
        raca: racaFinal || null,
        sexo: String(form.get("sexo") ?? "femea"),
        categoria: String(form.get("categoria") ?? categoriaPadraoDaEspecie(especie)),
        status: String(form.get("status") ?? "ativo"),
        nascimento: String(form.get("nascimento") ?? "") || null,
        peso_kg: form.get("peso_kg") ? Number(form.get("peso_kg")) : null,
        lote: String(form.get("lote") ?? "").trim() || null,
        mae: String(form.get("mae") ?? "").trim() || null,
        pai: String(form.get("pai") ?? "").trim() || null,
        observacoes: String(form.get("observacoes") ?? "").trim() || null,
      };
      const { error } = await db
        .from("animais")
        .update(payload as never)
        .eq("id", editando!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Animal atualizado.");
      setEditando(null);
      queryClient.invalidateQueries({ queryKey: ["animais"] });
      queryClient.invalidateQueries({ queryKey: ["animais-contagem"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["animais-simples"] });
      queryClient.invalidateQueries({ queryKey: ["animais-lactantes"] });
      queryClient.invalidateQueries({ queryKey: ["animais-engorda"] });
      queryClient.invalidateQueries({ queryKey: ["indices-rebanho"] });
      queryClient.invalidateQueries({ queryKey: ["indices-engorda"] });
    },
    onError: (erro) =>
      toast.error(
        mensagemErroAnimal(
          erro,
          "Não conseguimos salvar agora. Confira os campos e tente de novo.",
        ),
      ),
  });

  function construirPayloadGrupo(
    entrada: EntradaAnimalGrupo,
    campos: Record<CampoGrupo, boolean>,
    lote: string,
    fazendaId: string,
  ) {
    const racaFinal = entrada.raca === OUTRA_RACA ? entrada.racaCustom.trim() : entrada.raca;
    return {
      fazenda_id: fazendaId,
      nome: entrada.nome.trim(),
      especie: entrada.especie,
      brinco: campos.brinco ? entrada.brinco.trim() || null : null,
      sexo: campos.sexo ? entrada.sexo : SEXOS[0],
      categoria: campos.categoria ? entrada.categoria : categoriaPadraoDaEspecie(entrada.especie),
      status: campos.status ? entrada.status : STATUS[0],
      nascimento: campos.nascimento ? entrada.nascimento || null : null,
      peso_kg: campos.peso_kg && entrada.peso_kg ? Number(entrada.peso_kg) : null,
      raca: campos.raca ? racaFinal || null : null,
      lote: lote.trim(),
      mae: campos.mae ? entrada.mae.trim() || null : null,
      pai: campos.pai ? entrada.pai.trim() || null : null,
      observacoes: campos.observacoes ? entrada.observacoes.trim() || null : null,
    };
  }

  const criarGrupo = useMutation({
    mutationFn: async (entradas: EntradaAnimalGrupo[]) => {
      const payloads = entradas.map((e) =>
        construirPayloadGrupo(e, camposGrupo, grupoLote, fazenda!.id),
      );
      const { data: criados, error } = await db.from("animais").insert(payloads as never);
      if (error) throw error;
      await registrarPesagensIniciais(criados ?? []);
      return payloads.length;
    },
    onSuccess: (qtd) => {
      toast.success(
        `${qtd} ${qtd === 1 ? "animal cadastrado" : "animais cadastrados"} no lote "${grupoLote.trim()}".`,
      );
      fecharGrupo();
      queryClient.invalidateQueries({ queryKey: ["animais"] });
      queryClient.invalidateQueries({ queryKey: ["animais-contagem"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: (erro) =>
      toast.error(
        mensagemErroAnimal(
          erro,
          "Não conseguimos salvar o grupo agora. Confira os campos e tente de novo.",
        ),
      ),
  });

  function novoGrupo() {
    if (atingiu) {
      setUpgrade(true);
      return;
    }
    setGrupoLote("");
    setCamposGrupo(CAMPOS_GRUPO_PADRAO);
    setAnimaisGrupo([]);
    setEntradaAtual(entradaGrupoVazia(soOvino ? "ovino" : "bovino"));
    setGrupoEtapa("campos");
  }

  function fecharGrupo() {
    setGrupoEtapa(null);
    setGrupoLote("");
    setAnimaisGrupo([]);
    setEntradaAtual(entradaGrupoVazia(soOvino ? "ovino" : "bovino"));
  }

  function alternarCampoGrupo(chave: CampoGrupo) {
    setCamposGrupo((prev) => ({ ...prev, [chave]: !prev[chave] }));
  }

  function continuarParaAnimais() {
    if (!grupoLote.trim()) {
      toast.error("Informe o lote do grupo.");
      return;
    }
    setGrupoEtapa("animais");
  }

  function limiteAtingidoNoGrupo() {
    return usados + animaisGrupo.length + 1 > limite;
  }

  function adicionarAoGrupo() {
    if (!entradaAtual.nome.trim()) {
      toast.error("Informe o nome do animal antes de adicionar.");
      return;
    }
    if (limiteAtingidoNoGrupo()) {
      toast.error(`O plano ${plano.nome} permite ${limite} cabeças.`);
      return;
    }
    setAnimaisGrupo((prev) => [...prev, entradaAtual]);
    // Mantém sexo/categoria/situação/raça (costumam se repetir dentro do
    // mesmo grupo) e limpa o que é único de cada animal — reduz quanto o
    // usuário precisa redigitar a cada volta do laço.
    setEntradaAtual((prev) => ({
      ...entradaGrupoVazia(prev.especie),
      sexo: prev.sexo,
      categoria: prev.categoria,
      status: prev.status,
      raca: prev.raca,
      racaCustom: prev.raca === OUTRA_RACA ? prev.racaCustom : "",
    }));
  }

  function removerDoGrupo(index: number) {
    setAnimaisGrupo((prev) => prev.filter((_, i) => i !== index));
  }

  function finalizarGrupo() {
    const temEntradaPendente = entradaAtual.nome.trim() !== "";
    if (!temEntradaPendente && animaisGrupo.length === 0) {
      toast.error("Adicione ao menos um animal.");
      return;
    }
    if (temEntradaPendente && limiteAtingidoNoGrupo()) {
      toast.error(`O plano ${plano.nome} permite ${limite} cabeças.`);
      return;
    }
    const entradasFinal = temEntradaPendente ? [...animaisGrupo, entradaAtual] : animaisGrupo;
    criarGrupo.mutate(entradasFinal);
  }

  function novoAnimal() {
    if (atingiu) {
      setUpgrade(true);
      return;
    }
    setEditando(null);
    const especieInicial: Especie = soOvino ? "ovino" : "bovino";
    setEspecie(especieInicial);
    setRaca(racasDaEspecie(especieInicial)[0]!);
    setRacaCustom("");
    setAberto(true);
  }

  function abrirEdicao(a: any) {
    setAberto(false);
    const especieInicial = especieDoAnimal(a);
    setEspecie(especieInicial);
    const racasDoAnimal = racasDaEspecie(especieInicial);
    if (a.raca && racasDoAnimal.includes(a.raca)) {
      setRaca(a.raca);
      setRacaCustom("");
    } else if (a.raca) {
      setRaca(OUTRA_RACA);
      setRacaCustom(a.raca);
    } else {
      setRaca(racasDoAnimal[0]!);
      setRacaCustom("");
    }
    setEditando(a);
  }

  return (
    <AppShell
      titulo="Rebanho"
      acao={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSanidadeAberto(true)}>
            <Syringe className="size-4" aria-hidden="true" />
            Vacinas e manejo
          </Button>
          <Button variant="outline" onClick={novoGrupo}>
            <Users className="size-4" aria-hidden="true" />
            Novo grupo
          </Button>
          <Button onClick={novoAnimal}>
            <Plus className="size-4" aria-hidden="true" />
            Novo animal
          </Button>
        </div>
      }
    >
      <Tabs
        value={abaRebanho}
        onValueChange={(v) => setAbaRebanho(v as "ativo" | "vendido")}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="ativo">Rebanho ({porAba.ativo.length})</TabsTrigger>
          <TabsTrigger value="vendido">Saídas ({porAba.vendido.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {ocultosPorEspecie > 0 ? (
        <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {ocultosPorEspecie} {especiesPermitidas.includes("ovino") ? "bovino" : "ovino"}
          {ocultosPorEspecie === 1 ? " não aparece" : "s não aparecem"} aqui porque essa atividade
          está desmarcada em Configurações. Os dados continuam guardados.
        </p>
      ) : null}

      <PainelFiltros
        className="mb-4"
        ativos={qtdFiltros}
        onLimpar={() => {
          setBusca("");
          setFiltroEspecie("todas");
          setFiltroCategoria("todas");
          setFiltroSituacao("todas");
          setFiltroSexo("todos");
          setFiltroSaida("todas");
        }}
      >
        <CampoFiltro rotulo="Buscar" largo>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, brinco ou lote"
              className="pl-9"
              aria-label="Buscar animal"
            />
          </div>
        </CampoFiltro>
        {especiesPermitidas.length > 1 ? (
          <CampoFiltro rotulo="Espécie">
            <select
              value={filtroEspecie}
              onChange={(e) => {
                setFiltroEspecie(e.target.value as typeof filtroEspecie);
                setFiltroCategoria("todas");
              }}
              className={CLASSE_SELECT_FILTRO}
            >
              <option value="todas">Todas</option>
              <option value="bovino">Bovino</option>
              <option value="ovino">Ovino</option>
            </select>
          </CampoFiltro>
        ) : null}
        <CampoFiltro rotulo="Categoria">
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value as typeof filtroCategoria)}
            className={CLASSE_SELECT_FILTRO}
          >
            <option value="todas">Todas</option>
            {categoriasParaFiltro.map((c) => (
              <option key={c} value={c}>
                {rotuloCategoria(c)}
              </option>
            ))}
          </select>
        </CampoFiltro>
        {abaRebanho === "ativo" ? (
          <CampoFiltro rotulo="Situação">
            <select
              value={filtroSituacao}
              onChange={(e) => setFiltroSituacao(e.target.value as typeof filtroSituacao)}
              className={CLASSE_SELECT_FILTRO}
            >
              <option value="todas">Todas</option>
              {STATUS.filter((s) => s !== "vendido" && s !== "morto").map((s) => (
                <option key={s} value={s}>
                  {rotuloStatus(s)}
                </option>
              ))}
            </select>
          </CampoFiltro>
        ) : (
          <CampoFiltro rotulo="Tipo de saída">
            <select
              value={filtroSaida}
              onChange={(e) => setFiltroSaida(e.target.value as typeof filtroSaida)}
              className={CLASSE_SELECT_FILTRO}
            >
              <option value="todas">Todas</option>
              <option value="vendido">Vendidos</option>
              <option value="morto">Mortos</option>
            </select>
          </CampoFiltro>
        )}
        <CampoFiltro rotulo="Sexo">
          <select
            value={filtroSexo}
            onChange={(e) => setFiltroSexo(e.target.value as typeof filtroSexo)}
            className={CLASSE_SELECT_FILTRO}
          >
            <option value="todos">Todos</option>
            {SEXOS.map((s) => (
              <option key={s} value={s}>
                {rotuloSexo(s)}
              </option>
            ))}
          </select>
        </CampoFiltro>
      </PainelFiltros>

      {lista.length === 0 ? (
        <EmptyState
          icon={Beef}
          titulo={
            busca || filtroAtivo
              ? "Nenhum animal encontrado"
              : abaRebanho === "vendido"
                ? "Nenhuma saída registrada"
                : "Nenhum animal cadastrado"
          }
          descricao={
            busca || filtroAtivo
              ? "Tente outro nome, brinco, lote ou ajuste os filtros."
              : abaRebanho === "vendido"
                ? "Animais vendidos ou mortos aparecem aqui, fora da contagem do rebanho."
                : "Cadastre o primeiro animal para começar a acompanhar manejo, leite e reprodução."
          }
          acao={
            busca || filtroAtivo || abaRebanho === "vendido" ? undefined : (
              <Button onClick={novoAnimal}>Cadastrar animal</Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((a) => (
            <article key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{a.nome}</h2>
                  <p className="text-xs text-muted-foreground">
                    {a.brinco ? `Brinco ${a.brinco}` : "Sem brinco"} ·{" "}
                    {rotuloCategoria(a.categoria)}
                  </p>
                </div>
                <span
                  className={
                    a.status === "morto"
                      ? "shrink-0 rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-semibold text-destructive"
                      : "shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary"
                  }
                >
                  {rotuloStatus(a.status)}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Idade</dt>
                  <dd className="font-medium">{idadeTexto(a.nascimento)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Peso</dt>
                  <dd className="font-medium">{pesoTexto(a.peso_kg, prefs.unidade_peso)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Entrada</dt>
                  <dd className="font-medium">{dataCurta(a.created_at)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link to="/rebanho/$animalId" params={{ animalId: a.id }}>
                    Ver ficha
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => abrirEdicao(a)}
                >
                  Editar
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo animal</DialogTitle>
            <DialogDescription>
              Preencha o essencial agora — você pode completar a ficha depois.
            </DialogDescription>
          </DialogHeader>
          <form
            id="form-animal"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              criar.mutate(new FormData(e.currentTarget));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome ou identificação</Label>
              <Input id="nome" name="nome" required placeholder="Ex: Mimosa" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="especie">Espécie</Label>
                <select
                  id="especie"
                  name="especie"
                  value={especie}
                  onChange={(e) => selecionarEspecie(e.target.value as Especie)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {opcoesEspecie(especie)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brinco">Brinco</Label>
                <Input id="brinco" name="brinco" placeholder="Ex: 0231" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lote">Lote</Label>
                <Input id="lote" name="lote" placeholder="Ex: Pasto 2" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Selecao id="sexo" nome="Sexo" opcoes={SEXOS} rotular={rotuloSexo} />
              <Selecao
                key={especie}
                id="categoria"
                nome="Categoria"
                opcoes={categoriasDaEspecie(especie)}
                padrao={categoriaPadraoDaEspecie(especie)}
                rotular={rotuloCategoria}
              />
              <Selecao id="status" nome="Situação" opcoes={STATUS} rotular={rotuloStatus} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nascimento">Nascimento</Label>
                <Input id="nascimento" name="nascimento" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="peso_kg">Peso (kg)</Label>
                <Input id="peso_kg" name="peso_kg" type="number" step="0.1" min="0" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raca">Raça</Label>
              <select
                id="raca"
                value={raca}
                onChange={(e) => setRaca(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {racasDaEspecie(especie).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {raca === OUTRA_RACA ? (
                <Input
                  className="mt-1.5"
                  placeholder="Informe a raça"
                  value={racaCustom}
                  onChange={(e) => setRacaCustom(e.target.value)}
                  aria-label="Raça (informe)"
                />
              ) : null}
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} type="button">
              Cancelar
            </Button>
            <Button type="submit" form="form-animal" disabled={criar.isPending}>
              {criar.isPending ? "Salvando..." : "Salvar animal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" key={editando?.id}>
          <DialogHeader>
            <DialogTitle>Editar animal</DialogTitle>
            <DialogDescription>
              Corrija os dados do cadastro. O histórico de produção, reprodução, pesagens e vendas
              continua vinculado a este animal.
            </DialogDescription>
          </DialogHeader>
          {editando ? (
            <>
              <form
                id="form-editar-animal"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  editar.mutate(new FormData(e.currentTarget));
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="edit-nome">Nome ou identificação</Label>
                  <Input
                    id="edit-nome"
                    name="nome"
                    required
                    defaultValue={editando.nome ?? ""}
                    placeholder="Ex: Mimosa"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-especie">Espécie</Label>
                    <select
                      id="edit-especie"
                      name="especie"
                      value={especie}
                      onChange={(e) => selecionarEspecie(e.target.value as Especie)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {opcoesEspecie(especie)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-brinco">Brinco</Label>
                    <Input id="edit-brinco" name="brinco" defaultValue={editando.brinco ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-lote">Lote</Label>
                    <Input id="edit-lote" name="lote" defaultValue={editando.lote ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Selecao
                    id="sexo"
                    nome="Sexo"
                    opcoes={SEXOS}
                    padrao={editando.sexo}
                    rotular={rotuloSexo}
                  />
                  <Selecao
                    key={especie}
                    id="categoria"
                    nome="Categoria"
                    opcoes={categoriasDaEspecie(especie)}
                    rotular={rotuloCategoria}
                    padrao={
                      categoriasDaEspecie(especie).includes(editando.categoria)
                        ? editando.categoria
                        : categoriaPadraoDaEspecie(especie)
                    }
                  />
                  <Selecao
                    id="status"
                    nome="Situação"
                    opcoes={STATUS}
                    padrao={editando.status ?? "ativo"}
                    rotular={rotuloStatus}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-nascimento">Nascimento</Label>
                    <Input
                      id="edit-nascimento"
                      name="nascimento"
                      type="date"
                      defaultValue={editando.nascimento ? dataISO(editando.nascimento) : ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-peso_kg">Peso (kg)</Label>
                    <Input
                      id="edit-peso_kg"
                      name="peso_kg"
                      type="number"
                      step="0.1"
                      min="0"
                      defaultValue={editando.peso_kg ?? ""}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-raca">Raça</Label>
                  <select
                    id="edit-raca"
                    value={raca}
                    onChange={(e) => setRaca(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {racasDaEspecie(especie).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {raca === OUTRA_RACA ? (
                    <Input
                      className="mt-1.5"
                      placeholder="Informe a raça"
                      value={racaCustom}
                      onChange={(e) => setRacaCustom(e.target.value)}
                      aria-label="Raça (informe)"
                    />
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-mae">Mãe</Label>
                  <Input
                    id="edit-mae"
                    name="mae"
                    defaultValue={editando.mae ?? ""}
                    placeholder="Nome ou brinco da mãe (opcional)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-pai">Pai</Label>
                  <Input
                    id="edit-pai"
                    name="pai"
                    defaultValue={editando.pai ?? ""}
                    placeholder="Nome ou brinco do pai (opcional)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-observacoes">Observações</Label>
                  <Input
                    id="edit-observacoes"
                    name="observacoes"
                    defaultValue={editando.observacoes ?? ""}
                  />
                </div>
              </form>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditando(null)} type="button">
                  Cancelar
                </Button>
                <Button type="submit" form="form-editar-animal" disabled={editar.isPending}>
                  {editar.isPending ? "Salvando..." : "Salvar alterações"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={grupoEtapa !== null} onOpenChange={(v) => !v && fecharGrupo()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {grupoEtapa === "campos" ? (
            <>
              <DialogHeader>
                <DialogTitle>Novo grupo de animais</DialogTitle>
                <DialogDescription>
                  Escolha os campos que vai preencher pra cada animal do grupo — o resto fica em
                  branco e pode ser completado depois.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="grupo-lote">Lote</Label>
                  <Input
                    id="grupo-lote"
                    value={grupoLote}
                    onChange={(e) => setGrupoLote(e.target.value)}
                    placeholder="Ex: Pasto 2"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Campos por animal</Label>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {CAMPOS_GRUPO.map((c) => (
                      <div key={c.chave} className="flex items-center gap-2">
                        <Checkbox
                          id={`campo-grupo-${c.chave}`}
                          checked={camposGrupo[c.chave]}
                          onCheckedChange={() => alternarCampoGrupo(c.chave)}
                        />
                        <Label htmlFor={`campo-grupo-${c.chave}`} className="text-sm font-normal">
                          {c.rotulo}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={fecharGrupo}>
                  Cancelar
                </Button>
                <Button type="button" onClick={continuarParaAnimais}>
                  Continuar
                </Button>
              </DialogFooter>
            </>
          ) : grupoEtapa === "animais" ? (
            <>
              <DialogHeader>
                <DialogTitle>Adicionar animais — lote "{grupoLote.trim()}"</DialogTitle>
                <DialogDescription>
                  Preencha os dados e clique em "+ Animal" pra adicionar o próximo. Quando terminar,
                  clique em "Finalizar".
                </DialogDescription>
              </DialogHeader>

              {animaisGrupo.length > 0 ? (
                <div className="rounded-lg border border-border bg-muted p-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {animaisGrupo.length}{" "}
                    {animaisGrupo.length === 1 ? "animal adicionado" : "animais adicionados"}
                  </p>
                  <ul className="mt-1.5 max-h-24 space-y-1 overflow-y-auto">
                    {animaisGrupo.map((a, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 rounded-md bg-card px-2 py-1 text-xs"
                      >
                        <span className="truncate">
                          {a.nome}
                          {a.brinco ? ` (${a.brinco})` : ""}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-5"
                          onClick={() => removerDoGrupo(i)}
                          aria-label={`Remover ${a.nome}`}
                        >
                          <X className="size-3" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <form
                id="form-grupo-animal"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  adicionarAoGrupo();
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo-nome">Nome ou identificação</Label>
                    <Input
                      id="grupo-nome"
                      value={entradaAtual.nome}
                      onChange={(e) =>
                        setEntradaAtual((prev) => ({ ...prev, nome: e.target.value }))
                      }
                      placeholder="Ex: Mimosa"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo-especie">Espécie</Label>
                    <select
                      id="grupo-especie"
                      value={entradaAtual.especie}
                      onChange={(e) => {
                        const novaEspecie = e.target.value as Especie;
                        setEntradaAtual((prev) => ({
                          ...prev,
                          especie: novaEspecie,
                          categoria: categoriaPadraoDaEspecie(novaEspecie),
                          raca: racasDaEspecie(novaEspecie)[0]!,
                          racaCustom: "",
                        }));
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {opcoesEspecie(entradaAtual.especie)}
                    </select>
                  </div>
                </div>

                {camposGrupo.brinco || camposGrupo.peso_kg ? (
                  <div className="grid grid-cols-2 gap-3">
                    {camposGrupo.brinco ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="grupo-brinco">Brinco</Label>
                        <Input
                          id="grupo-brinco"
                          value={entradaAtual.brinco}
                          onChange={(e) =>
                            setEntradaAtual((prev) => ({ ...prev, brinco: e.target.value }))
                          }
                          placeholder="Ex: 0231"
                        />
                      </div>
                    ) : null}
                    {camposGrupo.peso_kg ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="grupo-peso">Peso (kg)</Label>
                        <Input
                          id="grupo-peso"
                          type="number"
                          step="0.1"
                          min="0"
                          value={entradaAtual.peso_kg}
                          onChange={(e) =>
                            setEntradaAtual((prev) => ({ ...prev, peso_kg: e.target.value }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {camposGrupo.sexo || camposGrupo.categoria || camposGrupo.status ? (
                  <div className="grid grid-cols-3 gap-3">
                    {camposGrupo.sexo ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="grupo-sexo">Sexo</Label>
                        <select
                          id="grupo-sexo"
                          value={entradaAtual.sexo}
                          onChange={(e) =>
                            setEntradaAtual((prev) => ({ ...prev, sexo: e.target.value }))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {SEXOS.map((s) => (
                            <option key={s} value={s}>
                              {rotuloSexo(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {camposGrupo.categoria ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="grupo-categoria">Categoria</Label>
                        <select
                          id="grupo-categoria"
                          value={entradaAtual.categoria}
                          onChange={(e) =>
                            setEntradaAtual((prev) => ({ ...prev, categoria: e.target.value }))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {categoriasDaEspecie(entradaAtual.especie).map((c) => (
                            <option key={c} value={c}>
                              {rotuloCategoria(c)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {camposGrupo.status ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="grupo-status">Situação</Label>
                        <select
                          id="grupo-status"
                          value={entradaAtual.status}
                          onChange={(e) =>
                            setEntradaAtual((prev) => ({ ...prev, status: e.target.value }))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {STATUS.map((s) => (
                            <option key={s} value={s}>
                              {rotuloStatus(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {camposGrupo.nascimento ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo-nascimento">Nascimento</Label>
                    <Input
                      id="grupo-nascimento"
                      type="date"
                      value={entradaAtual.nascimento}
                      onChange={(e) =>
                        setEntradaAtual((prev) => ({ ...prev, nascimento: e.target.value }))
                      }
                    />
                  </div>
                ) : null}

                {camposGrupo.raca ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo-raca">Raça</Label>
                    <select
                      id="grupo-raca"
                      value={entradaAtual.raca}
                      onChange={(e) =>
                        setEntradaAtual((prev) => ({ ...prev, raca: e.target.value }))
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {racasDaEspecie(entradaAtual.especie).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    {entradaAtual.raca === OUTRA_RACA ? (
                      <Input
                        className="mt-1.5"
                        placeholder="Informe a raça"
                        value={entradaAtual.racaCustom}
                        onChange={(e) =>
                          setEntradaAtual((prev) => ({ ...prev, racaCustom: e.target.value }))
                        }
                        aria-label="Raça (informe)"
                      />
                    ) : null}
                  </div>
                ) : null}

                {camposGrupo.mae ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo-mae">Mãe</Label>
                    <Input
                      id="grupo-mae"
                      value={entradaAtual.mae}
                      onChange={(e) =>
                        setEntradaAtual((prev) => ({ ...prev, mae: e.target.value }))
                      }
                      placeholder="Nome ou brinco da mãe (opcional)"
                    />
                  </div>
                ) : null}

                {camposGrupo.pai ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo-pai">Pai</Label>
                    <Input
                      id="grupo-pai"
                      value={entradaAtual.pai}
                      onChange={(e) =>
                        setEntradaAtual((prev) => ({ ...prev, pai: e.target.value }))
                      }
                      placeholder="Nome ou brinco do pai (opcional)"
                    />
                  </div>
                ) : null}

                {camposGrupo.observacoes ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo-observacoes">Observações</Label>
                    <Input
                      id="grupo-observacoes"
                      value={entradaAtual.observacoes}
                      onChange={(e) =>
                        setEntradaAtual((prev) => ({ ...prev, observacoes: e.target.value }))
                      }
                    />
                  </div>
                ) : null}
              </form>

              <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
                <Button variant="outline" type="button" onClick={fecharGrupo}>
                  Cancelar
                </Button>
                <Button type="submit" form="form-grupo-animal" variant="secondary">
                  <Plus className="size-4" aria-hidden="true" />
                  Animal
                </Button>
                <Button type="button" onClick={finalizarGrupo} disabled={criarGrupo.isPending}>
                  {criarGrupo.isPending ? "Salvando..." : "Finalizar"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <DialogManejoSanitario aberto={sanidadeAberto} onFechar={() => setSanidadeAberto(false)} />

      <UpgradeDialog
        aberto={upgrade}
        onFechar={() => setUpgrade(false)}
        titulo="Você chegou ao limite do plano"
        descricao={`O plano ${plano.nome} permite ${limite} cabeças e você já cadastrou ${usados}. Escolha um plano maior para continuar cadastrando.`}
      />
    </AppShell>
  );
}

function Selecao({
  id,
  nome,
  opcoes,
  padrao,
  rotular = (v) => v,
}: {
  id: string;
  nome: string;
  opcoes: readonly string[];
  padrao?: string;
  rotular?: (valor: string) => string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{nome}</Label>
      <select
        id={id}
        name={id}
        defaultValue={padrao ?? opcoes[0]}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {rotular(o)}
          </option>
        ))}
      </select>
    </div>
  );
}
