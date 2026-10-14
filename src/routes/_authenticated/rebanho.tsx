import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beef, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { dataCurta, dataISO, idadeTexto, pesoTexto } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";

export const Route = createFileRoute("/_authenticated/rebanho")({
  head: () => ({
    meta: [
      { title: "Rebanho — Easy Agro" },
      { name: "description", content: "Cadastro e ficha dos animais da fazenda." },
      { property: "og:title", content: "Rebanho — Easy Agro" },
      { property: "og:description", content: "Cadastro e ficha dos animais da fazenda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { editar?: string } => {
    const editar = typeof search["editar"] === "string" ? search["editar"] : undefined;
    return editar ? { editar } : {};
  },
  component: Rebanho,
});

const CATEGORIAS = ["bezerro", "novilha", "vaca", "boi", "touro", "outro"] as const;
const STATUS = ["ativo", "lactacao", "seca", "prenhe", "engorda", "vendido", "morto"] as const;
const SEXOS = ["femea", "macho", "castrado"] as const;

// `text-transform: capitalize` no <select> não é confiável entre
// navegadores pra exibir o valor selecionado fechado — texto já
// capitalizado na própria option evita essa inconsistência.
function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

const OUTRA_RACA = "Outra";
const RACAS_BOVINO: string[] = [
  "Nelore",
  "Gir",
  "Girolando",
  "Holandês",
  "Jersey",
  "Angus",
  "Brahman",
  "Guzerá",
  "Tabapuã",
  "Senepol",
  "Simental",
  "Charolês",
  OUTRA_RACA,
];

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
  observacoes: false,
};

interface EntradaAnimalGrupo {
  nome: string;
  brinco: string;
  sexo: string;
  categoria: string;
  status: string;
  nascimento: string;
  peso_kg: string;
  raca: string;
  racaCustom: string;
  mae: string;
  observacoes: string;
}

function entradaGrupoVazia(): EntradaAnimalGrupo {
  return {
    nome: "",
    brinco: "",
    sexo: SEXOS[0],
    categoria: "vaca",
    status: STATUS[0],
    nascimento: "",
    peso_kg: "",
    raca: RACAS_BOVINO[0]!,
    racaCustom: "",
    mae: "",
    observacoes: "",
  };
}

function Rebanho() {
  const prefs = usePreferencias();
  const { fazenda, atingiu, usados, limite, plano } = useLimitePlano();
  const queryClient = useQueryClient();
  const { editar: editarId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [raca, setRaca] = useState<string>(RACAS_BOVINO[0]!);
  const [racaCustom, setRacaCustom] = useState("");
  const [editando, setEditando] = useState<any>(null);

  // ---- Cadastro em grupo (2 cards: escolha de campos, depois o laço) ----
  const [grupoEtapa, setGrupoEtapa] = useState<"campos" | "animais" | null>(null);
  const [grupoLote, setGrupoLote] = useState("");
  const [camposGrupo, setCamposGrupo] = useState<Record<CampoGrupo, boolean>>(CAMPOS_GRUPO_PADRAO);
  const [animaisGrupo, setAnimaisGrupo] = useState<EntradaAnimalGrupo[]>([]);
  const [entradaAtual, setEntradaAtual] = useState<EntradaAnimalGrupo>(entradaGrupoVazia());

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
  const [filtroCategoria, setFiltroCategoria] = useState<"todas" | (typeof CATEGORIAS)[number]>(
    "todas",
  );
  const [filtroSituacao, setFiltroSituacao] = useState<"todas" | (typeof STATUS)[number]>("todas");
  const [filtroSexo, setFiltroSexo] = useState<"todos" | (typeof SEXOS)[number]>("todos");

  const porAba = useMemo(
    () => ({
      ativo: (animais.data ?? []).filter((a) => a.status !== "vendido"),
      vendido: (animais.data ?? []).filter((a) => a.status === "vendido"),
    }),
    [animais.data],
  );

  const filtroAtivo =
    filtroCategoria !== "todas" || filtroSituacao !== "todas" || filtroSexo !== "todos";

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return porAba[abaRebanho].filter((a) => {
      if (filtroCategoria !== "todas" && a.categoria !== filtroCategoria) return false;
      if (filtroSituacao !== "todas" && a.status !== filtroSituacao) return false;
      if (filtroSexo !== "todos" && a.sexo !== filtroSexo) return false;
      if (!termo) return true;
      return (
        a.nome.toLowerCase().includes(termo) ||
        (a.brinco ?? "").toLowerCase().includes(termo) ||
        (a.lote ?? "").toLowerCase().includes(termo)
      );
    });
  }, [porAba, abaRebanho, busca, filtroCategoria, filtroSituacao, filtroSexo]);

  // Permite abrir a edição direto de outra tela (ex: "Editar dados do
  // animal" na ficha) navegando para /rebanho?editar=<id>.
  useEffect(() => {
    if (!editarId || !animais.data) return;
    const alvo = animais.data.find((a) => a.id === editarId);
    if (alvo) abrirEdicao(alvo);
    navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId, animais.data]);

  const criar = useMutation({
    mutationFn: async (form: FormData) => {
      const racaFinal = raca === OUTRA_RACA ? racaCustom.trim() : raca;
      const payload = {
        fazenda_id: fazenda!.id,
        nome: String(form.get("nome") ?? "").trim(),
        brinco: String(form.get("brinco") ?? "").trim() || null,
        raca: racaFinal || null,
        sexo: String(form.get("sexo") ?? "femea"),
        categoria: String(form.get("categoria") ?? "vaca"),
        status: String(form.get("status") ?? "ativo"),
        nascimento: String(form.get("nascimento") ?? "") || null,
        peso_kg: form.get("peso_kg") ? Number(form.get("peso_kg")) : null,
        lote: String(form.get("lote") ?? "").trim() || null,
      };
      const { error } = await db.from("animais").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Animal cadastrado.");
      setAberto(false);
      setRaca(RACAS_BOVINO[0]!);
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
        brinco: String(form.get("brinco") ?? "").trim() || null,
        raca: racaFinal || null,
        sexo: String(form.get("sexo") ?? "femea"),
        categoria: String(form.get("categoria") ?? "vaca"),
        status: String(form.get("status") ?? "ativo"),
        nascimento: String(form.get("nascimento") ?? "") || null,
        peso_kg: form.get("peso_kg") ? Number(form.get("peso_kg")) : null,
        lote: String(form.get("lote") ?? "").trim() || null,
        mae: String(form.get("mae") ?? "").trim() || null,
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
      brinco: campos.brinco ? entrada.brinco.trim() || null : null,
      sexo: campos.sexo ? entrada.sexo : SEXOS[0],
      categoria: campos.categoria ? entrada.categoria : "vaca",
      status: campos.status ? entrada.status : STATUS[0],
      nascimento: campos.nascimento ? entrada.nascimento || null : null,
      peso_kg: campos.peso_kg && entrada.peso_kg ? Number(entrada.peso_kg) : null,
      raca: campos.raca ? racaFinal || null : null,
      lote: lote.trim(),
      mae: campos.mae ? entrada.mae.trim() || null : null,
      observacoes: campos.observacoes ? entrada.observacoes.trim() || null : null,
    };
  }

  const criarGrupo = useMutation({
    mutationFn: async (entradas: EntradaAnimalGrupo[]) => {
      const payloads = entradas.map((e) =>
        construirPayloadGrupo(e, camposGrupo, grupoLote, fazenda!.id),
      );
      const { error } = await db.from("animais").insert(payloads as never);
      if (error) throw error;
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
    setEntradaAtual(entradaGrupoVazia());
    setGrupoEtapa("campos");
  }

  function fecharGrupo() {
    setGrupoEtapa(null);
    setGrupoLote("");
    setAnimaisGrupo([]);
    setEntradaAtual(entradaGrupoVazia());
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
      ...entradaGrupoVazia(),
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
    setRaca(RACAS_BOVINO[0]!);
    setRacaCustom("");
    setAberto(true);
  }

  function abrirEdicao(a: any) {
    setAberto(false);
    if (a.raca && RACAS_BOVINO.includes(a.raca)) {
      setRaca(a.raca);
      setRacaCustom("");
    } else if (a.raca) {
      setRaca(OUTRA_RACA);
      setRacaCustom(a.raca);
    } else {
      setRaca(RACAS_BOVINO[0]!);
      setRacaCustom("");
    }
    setEditando(a);
  }

  return (
    <AppShell
      titulo="Rebanho"
      descricao="Todos os animais da fazenda, com brinco, categoria e situação."
      acao={
        <div className="flex gap-2">
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
          <TabsTrigger value="vendido">Vendidos ({porAba.vendido.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, brinco ou lote"
            className="pl-9"
            aria-label="Buscar animal"
          />
        </div>
        <select
          aria-label="Filtrar por categoria"
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value as typeof filtroCategoria)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
        >
          <option value="todas">Todas as categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {capitalizar(c)}
            </option>
          ))}
        </select>
        {abaRebanho === "ativo" ? (
          <select
            aria-label="Filtrar por situação"
            value={filtroSituacao}
            onChange={(e) => setFiltroSituacao(e.target.value as typeof filtroSituacao)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            <option value="todas">Todas as situações</option>
            {STATUS.filter((s) => s !== "vendido").map((s) => (
              <option key={s} value={s}>
                {capitalizar(s)}
              </option>
            ))}
          </select>
        ) : null}
        <select
          aria-label="Filtrar por sexo"
          value={filtroSexo}
          onChange={(e) => setFiltroSexo(e.target.value as typeof filtroSexo)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
        >
          <option value="todos">Todos os sexos</option>
          {SEXOS.map((s) => (
            <option key={s} value={s}>
              {capitalizar(s)}
            </option>
          ))}
        </select>
        {filtroAtivo ? (
          <button
            type="button"
            onClick={() => {
              setFiltroCategoria("todas");
              setFiltroSituacao("todas");
              setFiltroSexo("todos");
            }}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={Beef}
          titulo={
            busca || filtroAtivo
              ? "Nenhum animal encontrado"
              : abaRebanho === "vendido"
                ? "Nenhum animal vendido ainda"
                : "Nenhum animal cadastrado"
          }
          descricao={
            busca || filtroAtivo
              ? "Tente outro nome, brinco, lote ou ajuste os filtros."
              : abaRebanho === "vendido"
                ? "Animais marcados como vendidos aparecem aqui."
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
                    {a.brinco ? `Brinco ${a.brinco}` : "Sem brinco"} · {a.categoria}
                  </p>
                </div>
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary capitalize">
                  {a.status}
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
            <div className="grid grid-cols-2 gap-3">
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
              <Selecao id="sexo" nome="Sexo" opcoes={SEXOS} />
              <Selecao id="categoria" nome="Categoria" opcoes={CATEGORIAS} padrao="vaca" />
              <Selecao id="status" nome="Situação" opcoes={STATUS} />
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
                {RACAS_BOVINO.map((r) => (
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
                <div className="grid grid-cols-2 gap-3">
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
                  <Selecao id="sexo" nome="Sexo" opcoes={SEXOS} padrao={editando.sexo} />
                  <Selecao
                    id="categoria"
                    nome="Categoria"
                    opcoes={CATEGORIAS}
                    padrao={editando.categoria ?? "vaca"}
                  />
                  <Selecao
                    id="status"
                    nome="Situação"
                    opcoes={STATUS}
                    padrao={editando.status ?? "ativo"}
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
                    {RACAS_BOVINO.map((r) => (
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
                <div className="space-y-1.5">
                  <Label htmlFor="grupo-nome">Nome ou identificação</Label>
                  <Input
                    id="grupo-nome"
                    value={entradaAtual.nome}
                    onChange={(e) => setEntradaAtual((prev) => ({ ...prev, nome: e.target.value }))}
                    placeholder="Ex: Mimosa"
                    required
                    autoFocus
                  />
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
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                        >
                          {SEXOS.map((s) => (
                            <option key={s} value={s} className="capitalize">
                              {s}
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
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                        >
                          {CATEGORIAS.map((c) => (
                            <option key={c} value={c} className="capitalize">
                              {c}
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
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                        >
                          {STATUS.map((s) => (
                            <option key={s} value={s} className="capitalize">
                              {s}
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
                      {RACAS_BOVINO.map((r) => (
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
}: {
  id: string;
  nome: string;
  opcoes: readonly string[];
  padrao?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{nome}</Label>
      <select
        id={id}
        name={id}
        defaultValue={padrao ?? opcoes[0]}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
      >
        {opcoes.map((o) => (
          <option key={o} value={o} className="capitalize">
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
