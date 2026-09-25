import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beef, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      { title: "Rebanho — Curral Online" },
      { name: "description", content: "Cadastro e ficha dos animais da fazenda." },
      { property: "og:title", content: "Rebanho — Curral Online" },
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
const ESPECIES = ["bovino", "ovino"] as const;
const SEXOS = ["femea", "macho", "castrado"] as const;

const OUTRA_RACA = "Outra";
const RACAS: Record<string, string[]> = {
  bovino: [
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
  ],
  ovino: [
    "Santa Inês",
    "Dorper",
    "Morada Nova",
    "Suffolk",
    "Texel",
    "Bergamácia",
    "Ile de France",
    OUTRA_RACA,
  ],
};

function Rebanho() {
  const prefs = usePreferencias();
  const { fazenda, atingiu, usados, limite, plano } = useLimitePlano();
  const queryClient = useQueryClient();
  const { editar: editarId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [especie, setEspecie] = useState<string>(ESPECIES[0]);
  const [raca, setRaca] = useState<string>(RACAS[ESPECIES[0]]![0]!);
  const [racaCustom, setRacaCustom] = useState("");
  const [editando, setEditando] = useState<any>(null);

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

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return animais.data ?? [];
    return (animais.data ?? []).filter(
      (a) =>
        a.nome.toLowerCase().includes(termo) ||
        (a.brinco ?? "").toLowerCase().includes(termo) ||
        (a.lote ?? "").toLowerCase().includes(termo),
    );
  }, [animais.data, busca]);

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
        especie,
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
      setEspecie(ESPECIES[0]);
      setRaca(RACAS[ESPECIES[0]]![0]!);
      setRacaCustom("");
      queryClient.invalidateQueries({ queryKey: ["animais"] });
      queryClient.invalidateQueries({ queryKey: ["animais-contagem"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Confira os campos e tente de novo."),
  });

  const editar = useMutation({
    mutationFn: async (form: FormData) => {
      const racaFinal = raca === OUTRA_RACA ? racaCustom.trim() : raca;
      const payload = {
        nome: String(form.get("nome") ?? "").trim(),
        brinco: String(form.get("brinco") ?? "").trim() || null,
        especie,
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
    onError: () => toast.error("Não conseguimos salvar agora. Confira os campos e tente de novo."),
  });

  function novoAnimal() {
    if (atingiu) {
      setUpgrade(true);
      return;
    }
    setEditando(null);
    setEspecie(ESPECIES[0]);
    setRaca(RACAS[ESPECIES[0]]![0]!);
    setRacaCustom("");
    setAberto(true);
  }

  function abrirEdicao(a: any) {
    setAberto(false);
    setEspecie(a.especie ?? ESPECIES[0]);
    const racasDaEspecie = RACAS[a.especie] ?? RACAS["bovino"]!;
    if (a.raca && racasDaEspecie.includes(a.raca)) {
      setRaca(a.raca);
      setRacaCustom("");
    } else if (a.raca) {
      setRaca(OUTRA_RACA);
      setRacaCustom(a.raca);
    } else {
      setRaca(racasDaEspecie[0]!);
      setRacaCustom("");
    }
    setEditando(a);
  }

  return (
    <AppShell
      titulo="Rebanho"
      descricao="Todos os animais da fazenda, com brinco, categoria e situação."
      acao={
        <Button onClick={novoAnimal}>
          <Plus className="size-4" aria-hidden="true" />
          Novo animal
        </Button>
      }
    >
      <div className="relative mb-4 max-w-sm">
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

      {lista.length === 0 ? (
        <EmptyState
          icon={Beef}
          titulo={busca ? "Nenhum animal encontrado" : "Nenhum animal cadastrado"}
          descricao={
            busca
              ? "Tente outro nome, brinco ou lote."
              : "Cadastre o primeiro animal para começar a acompanhar manejo, leite e reprodução."
          }
          acao={busca ? undefined : <Button onClick={novoAnimal}>Cadastrar animal</Button>}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="especie">Espécie</Label>
                <select
                  id="especie"
                  name="especie"
                  value={especie}
                  onChange={(e) => {
                    const novaEspecie = e.target.value;
                    setEspecie(novaEspecie);
                    setRaca(RACAS[novaEspecie]![0]!);
                    setRacaCustom("");
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                >
                  {ESPECIES.map((o) => (
                    <option key={o} value={o} className="capitalize">
                      {o}
                    </option>
                  ))}
                </select>
              </div>
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
                {(RACAS[especie] ?? RACAS["bovino"]!).map((r) => (
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-especie">Espécie</Label>
                    <select
                      id="edit-especie"
                      name="especie"
                      value={especie}
                      onChange={(e) => {
                        const novaEspecie = e.target.value;
                        setEspecie(novaEspecie);
                        setRaca(RACAS[novaEspecie]![0]!);
                        setRacaCustom("");
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                    >
                      {ESPECIES.map((o) => (
                        <option key={o} value={o} className="capitalize">
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
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
                    {(RACAS[especie] ?? RACAS["bovino"]!).map((r) => (
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
