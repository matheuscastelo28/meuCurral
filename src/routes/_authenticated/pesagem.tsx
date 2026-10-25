import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Scale, TriangleAlert } from "lucide-react";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { usePreferencias } from "@/hooks/use-preferencias";
import { dataCurta, dataISO, hojeISO, pesoTexto } from "@/lib/formato";
import { especieDoAnimal, especiesDasAtividades } from "@/lib/especies";
import { rotuloCategoria, textoLote } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pesagem")({
  head: () => ({
    meta: [
      { title: "Pesagem rápida — Curral Online" },
      { name: "description", content: "Pese o rebanho pelo brinco, um animal atrás do outro." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PesagemRapida,
});

interface AnimalPesagem {
  id: string;
  nome: string;
  brinco: string | null;
  peso_kg: string | number | null;
  lote: string | null;
  categoria: string | null;
  especie: string | null;
  status: string | null;
}

interface Pesado {
  animalId: string;
  manejoId: string | null;
  nome: string;
  brinco: string | null;
  peso: number;
  data: string;
  /** Última pesagem antes desta sessão — base do ganho por dia. */
  anterior: { data: string; valor: number } | null;
  gmd: number | null;
  corrigido: boolean;
}

function ganhoPorDia(
  peso: number,
  data: string,
  anterior: { data: string; valor: number } | null,
): number | null {
  if (!anterior) return null;
  const dias = Math.round(
    (new Date(`${data}T00:00:00Z`).getTime() - new Date(`${anterior.data}T00:00:00Z`).getTime()) /
      86400000,
  );
  return dias > 0 ? (peso - anterior.valor) / dias : null;
}

/** "0231", " 231 " e "231" são o mesmo brinco. */
function normalizarBrinco(valor: string): string {
  const limpo = valor.trim().toLowerCase();
  return /^\d+$/.test(limpo) ? String(Number(limpo)) : limpo;
}

function PesagemRapida() {
  const { data: fazenda } = useFazenda();
  const prefs = usePreferencias();
  const queryClient = useQueryClient();

  const [data, setData] = useState(hojeISO());
  const [busca, setBusca] = useState("");
  const [animal, setAnimal] = useState<AnimalPesagem | null>(null);
  const [peso, setPeso] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pesados, setPesados] = useState<Pesado[]>([]);
  const campoBrinco = useRef<HTMLInputElement>(null);
  const campoPeso = useRef<HTMLInputElement>(null);

  const animais = useQuery({
    queryKey: ["animais-pesagem", fazenda?.id, fazenda?.atividades?.join(",")],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data: linhas, error } = await db
        .from("animais")
        .select("id, nome, brinco, peso_kg, lote, categoria, especie, status")
        .eq("fazenda_id", fazenda!.id);
      if (error) throw error;
      const permitidas = especiesDasAtividades(fazenda?.atividades);
      return ((linhas ?? []) as AnimalPesagem[]).filter(
        (a) =>
          a.status !== "vendido" && a.status !== "morto" && permitidas.includes(especieDoAnimal(a)),
      );
    },
  });

  // Última pesagem de cada animal — pra mostrar o ganho por dia na hora.
  const ultimas = useQuery({
    queryKey: ["pesagens-engorda-todas", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data: linhas, error } = await db
        .from("manejos")
        .select("animal_id, data, valor")
        .eq("fazenda_id", fazenda!.id)
        .eq("tipo", "pesagem")
        .order("data", { ascending: true });
      if (error) throw error;
      return linhas;
    },
  });

  const porBrinco = useMemo(() => {
    const mapa = new Map<string, AnimalPesagem[]>();
    for (const a of animais.data ?? []) {
      if (!a.brinco) continue;
      const chave = normalizarBrinco(a.brinco);
      mapa.set(chave, [...(mapa.get(chave) ?? []), a]);
    }
    return mapa;
  }, [animais.data]);

  const ultimaPesagem = useMemo(() => {
    const mapa = new Map<string, { data: string; valor: number }>();
    for (const p of ultimas.data ?? []) {
      if (!p.animal_id || p.valor === null) continue;
      const atual = mapa.get(p.animal_id);
      const d = dataISO(p.data);
      if (!atual || d >= atual.data) mapa.set(p.animal_id, { data: d, valor: Number(p.valor) });
    }
    return mapa;
  }, [ultimas.data]);

  // Sugestões enquanto digita, pra quem não lembra o brinco inteiro.
  const sugestoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo || animal) return [];
    return (animais.data ?? [])
      .filter(
        (a) =>
          (a.brinco ?? "").toLowerCase().startsWith(termo) || a.nome.toLowerCase().includes(termo),
      )
      .slice(0, 6);
  }, [busca, animal, animais.data]);

  function escolher(a: AnimalPesagem) {
    setAnimal(a);
    setBusca(a.brinco ?? a.nome);
    const jaPesado = pesados.find((p) => p.animalId === a.id);
    setAviso(
      jaPesado
        ? `Já pesado nesta sessão (${jaPesado.peso.toLocaleString("pt-BR")} kg). Salvar corrige essa pesagem, sem criar outra.`
        : null,
    );
    setTimeout(() => campoPeso.current?.focus(), 0);
  }

  function procurar() {
    const termo = busca.trim();
    if (!termo) return;
    const porNumero = porBrinco.get(normalizarBrinco(termo)) ?? [];
    const porNome = (animais.data ?? []).filter(
      (a) => a.nome.trim().toLowerCase() === termo.toLowerCase(),
    );
    const achados = porNumero.length > 0 ? porNumero : porNome;
    if (achados.length === 1) {
      escolher(achados[0]!);
    } else if (achados.length > 1) {
      setAviso("Mais de um animal com esse brinco — escolha na lista abaixo.");
    } else {
      setAnimal(null);
      setAviso(`Nenhum animal ativo com o brinco "${termo}".`);
    }
  }

  function recomecar() {
    setAnimal(null);
    setBusca("");
    setPeso("");
    setAviso(null);
    setTimeout(() => campoBrinco.current?.focus(), 0);
  }

  const salvar = useMutation({
    mutationFn: async (): Promise<Pesado> => {
      const valor = Number(peso.replace(",", "."));
      if (!animal || !fazenda) throw new Error("Escolha o animal.");
      if (!(valor > 0)) throw new Error("Informe um peso maior que zero.");
      const daSessao = pesados.find((p) => p.animalId === animal.id);

      // Mesmo animal de novo na sessão: corrige a pesagem já feita em vez
      // de criar outra (senão o histórico e o GMD ganham um registro falso).
      if (daSessao?.manejoId) {
        const { error } = await db
          .from("manejos")
          .update({ valor, data } as never)
          .eq("id", daSessao.manejoId);
        if (error) throw new Error(error.message);
        if (!daSessao.anterior || data >= daSessao.anterior.data) {
          const { error: erroAnimal } = await db
            .from("animais")
            .update({ peso_kg: valor } as never)
            .eq("id", animal.id);
          if (erroAnimal) throw new Error(erroAnimal.message);
        }
        return {
          ...daSessao,
          peso: valor,
          data,
          gmd: ganhoPorDia(valor, data, daSessao.anterior),
          corrigido: true,
        };
      }

      const { error } = await db.engorda.registrarPesagemLote({
        fazendaId: fazenda.id,
        data,
        pesagens: [{ animalId: animal.id, peso: valor }],
      });
      if (error) throw new Error(error.message);
      const { data: criadas } = await db
        .from("manejos")
        .select("id")
        .eq("animal_id", animal.id)
        .eq("tipo", "pesagem")
        .eq("data", data)
        .order("created_at", { ascending: false })
        .limit(1);
      const anterior = ultimaPesagem.get(animal.id) ?? null;
      return {
        animalId: animal.id,
        manejoId: (criadas?.[0]?.id as string | undefined) ?? null,
        nome: animal.nome,
        brinco: animal.brinco,
        peso: valor,
        data,
        anterior,
        gmd: ganhoPorDia(valor, data, anterior),
        corrigido: false,
      };
    },
    onSuccess: (registro) => {
      setPesados((lista) => [registro, ...lista.filter((p) => p.animalId !== registro.animalId)]);
      for (const chave of [
        "pesagens-engorda",
        "pesagens-engorda-todas",
        "animais-engorda",
        "animais-pesagem",
        "indices-engorda",
        "ficha-manejos",
        "animais",
      ]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
      recomecar();
    },
    onError: (erro: Error) => setAviso(erro.message || "Não conseguimos salvar agora."),
  });

  const pesadoNaSessao = animal ? pesados.find((p) => p.animalId === animal.id) : undefined;
  const anteriorDoAtual = animal
    ? pesadoNaSessao
      ? pesadoNaSessao.anterior
      : (ultimaPesagem.get(animal.id) ?? null)
    : null;
  const totalPesado = pesados.reduce((s, p) => s + p.peso, 0);

  return (
    <AppShell
      titulo="Pesagem rápida"
      descricao="Digite o brinco, aperte Enter, digite o peso e Enter de novo — já vai pro próximo."
      acao={
        <Button variant="outline" asChild>
          <Link to="/engorda">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Confinamento
          </Link>
        </Button>
      }
    >
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="space-y-1.5">
            <Label htmlFor="pesagem-data">Data da pesagem</Label>
            <Input
              id="pesagem-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="max-w-[200px]"
            />
          </div>

          <form
            className="mt-4 space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              procurar();
            }}
          >
            <Label htmlFor="pesagem-brinco">Brinco (ou nome)</Label>
            <Input
              id="pesagem-brinco"
              ref={campoBrinco}
              autoFocus
              autoComplete="off"
              inputMode="text"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setAnimal(null);
                setAviso(null);
              }}
              placeholder="Ex: 0231"
              className="h-14 text-2xl font-semibold tracking-wide md:text-2xl"
            />
            {sugestoes.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {sugestoes.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => escolher(a)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{a.brinco ?? "sem brinco"}</span> · {a.nome}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {pesoTexto(
                          a.peso_kg === null ? null : Number(a.peso_kg),
                          prefs.unidade_peso,
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>

          {aviso ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {aviso}
            </p>
          ) : null}

          {animal ? (
            <form
              className="mt-4 space-y-3 rounded-lg bg-accent/60 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                salvar.mutate();
              }}
            >
              <div>
                <p className="text-lg font-bold">{animal.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {animal.brinco ? `Brinco ${animal.brinco} · ` : ""}
                  {rotuloCategoria(animal.categoria)}
                  {animal.lote ? ` · ${textoLote(animal.lote)}` : ""}
                </p>
                <p className="mt-1 text-sm">
                  Última pesagem:{" "}
                  <span className="font-semibold">
                    {anteriorDoAtual
                      ? `${pesoTexto(anteriorDoAtual.valor, prefs.unidade_peso)} em ${dataCurta(anteriorDoAtual.data)}`
                      : "nenhuma"}
                  </span>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pesagem-peso">Peso (kg)</Label>
                <div className="flex gap-2">
                  <Input
                    id="pesagem-peso"
                    ref={campoPeso}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="Ex: 352"
                    className="h-14 text-2xl font-semibold md:text-2xl"
                  />
                  <Button type="submit" className="h-14 px-6" disabled={salvar.isPending}>
                    <Check className="size-5" aria-hidden="true" />
                    {pesadoNaSessao ? "Corrigir" : "Salvar"}
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={recomecar}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Pular este animal
              </button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {animais.isLoading
                ? "Carregando o rebanho..."
                : `${animais.data?.length ?? 0} animais ativos para pesar.`}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold">Pesados agora</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {pesados.length} {pesados.length === 1 ? "animal" : "animais"}
              {pesados.length > 0
                ? ` · média ${pesoTexto(totalPesado / pesados.length, prefs.unidade_peso)}`
                : ""}
            </span>
          </div>
          {pesados.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Scale className="size-4" aria-hidden="true" />
              As pesagens desta sessão aparecem aqui, a mais recente primeiro.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {pesados.map((p) => (
                <li
                  key={p.animalId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {p.brinco ? `${p.brinco} · ` : ""}
                      {p.nome}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {p.anterior !== null
                        ? `antes ${pesoTexto(p.anterior.valor, prefs.unidade_peso)}`
                        : "primeira pesagem"}
                      {p.corrigido ? " · corrigido" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">
                      {pesoTexto(p.peso, prefs.unidade_peso)}
                    </span>
                    {p.gmd !== null ? (
                      <span
                        className={cn(
                          "block text-xs font-semibold tabular-nums",
                          p.gmd < 0 ? "text-destructive" : "text-success",
                        )}
                      >
                        {p.gmd >= 0 ? "+" : ""}
                        {p.gmd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg/dia
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
