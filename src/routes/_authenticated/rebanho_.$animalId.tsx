import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Baby,
  BadgeDollarSign,
  Coins,
  Milk,
  Pencil,
  Scale,
  Syringe,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { DialogManejoSanitario } from "@/components/DialogManejoSanitario";
import { DialogVenderAnimal, type AnimalParaVenda } from "@/components/DialogVenderAnimal";
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useFazenda } from "@/hooks/use-fazenda";
import {
  dataCurta,
  dataISO,
  diasAtrasISO,
  idadeTexto,
  moeda as formatarMoeda,
  pesoTexto,
} from "@/lib/formato";
import { rotuloCategoria, rotuloStatus } from "@/lib/rotulos";
import { usePreferencias } from "@/hooks/use-preferencias";

export const Route = createFileRoute("/_authenticated/rebanho_/$animalId")({
  head: () => ({
    meta: [
      { title: "Ficha do animal — Curral Online" },
      {
        name: "description",
        content: "Histórico completo de um animal: leite, peso, reprodução e vendas.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Ficha,
});

type TipoEntrada = "leite" | "peso" | "manejo" | "reproducao" | "venda";
type Periodo = "7" | "30" | "90" | "tudo";
type TipoFiltro = "todos" | TipoEntrada;

interface EntradaHistorico {
  id: string;
  tipo: TipoEntrada;
  data: string;
  titulo: string;
  descricao: string;
  valorTexto: string | null;
  editavel: boolean;
  bruta: any;
}

const TITULO_MANEJO: Record<string, string> = {
  vacina: "Vacina",
  vermifugo: "Vermífugo",
  tratamento: "Tratamento",
  outro: "Manejo",
};

const ROTULO_TIPO: Record<TipoEntrada, string> = {
  leite: "Leite",
  peso: "Peso",
  manejo: "Manejo",
  reproducao: "Reprodução",
  venda: "Venda",
};

const ICONE_TIPO: Record<TipoEntrada, typeof Milk> = {
  leite: Milk,
  peso: Scale,
  manejo: Wrench,
  reproducao: Baby,
  venda: Coins,
};

function Ficha() {
  const { animalId } = Route.useParams();
  const prefs = usePreferencias();
  const queryClient = useQueryClient();
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);

  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [editando, setEditando] = useState<EntradaHistorico | null>(null);
  const [excluindo, setExcluindo] = useState<EntradaHistorico | null>(null);
  const [sanidadeAberto, setSanidadeAberto] = useState(false);
  const [vendendo, setVendendo] = useState<AnimalParaVenda | null>(null);
  const [estornando, setEstornando] = useState<EntradaHistorico | null>(null);
  const { data: fazenda } = useFazenda();

  const animal = useQuery({
    queryKey: ["animal-ficha", animalId],
    queryFn: async () => {
      const { data, error } = await db.from("animais").select("*").eq("id", animalId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const leite = useQuery({
    queryKey: ["ficha-leite", animalId],
    queryFn: async () => {
      const { data, error } = await db
        .from("producao_leite")
        .select("*")
        .eq("animal_id", animalId)
        .order("data", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const manejos = useQuery({
    queryKey: ["ficha-manejos", animalId],
    queryFn: async () => {
      const { data, error } = await db
        .from("manejos")
        .select("*")
        .eq("animal_id", animalId)
        .order("data", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const reproducao = useQuery({
    queryKey: ["ficha-reproducao", animalId],
    queryFn: async () => {
      const { data, error } = await db
        .from("reproducao")
        .select("*")
        .eq("animal_id", animalId)
        .order("data", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const vendas = useQuery({
    queryKey: ["ficha-vendas", animalId],
    queryFn: async () => {
      const { data, error } = await db
        .from("vendas")
        .select("*")
        .eq("animal_id", animalId)
        .order("data", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  function invalidarTudo() {
    queryClient.invalidateQueries({ queryKey: ["ficha-leite", animalId] });
    queryClient.invalidateQueries({ queryKey: ["ficha-manejos", animalId] });
    queryClient.invalidateQueries({ queryKey: ["ficha-reproducao", animalId] });
    queryClient.invalidateQueries({ queryKey: ["leite"] });
    queryClient.invalidateQueries({ queryKey: ["pesagens-engorda"] });
    queryClient.invalidateQueries({ queryKey: ["animais-engorda"] });
    queryClient.invalidateQueries({ queryKey: ["indices-rebanho"] });
    queryClient.invalidateQueries({ queryKey: ["indices-engorda"] });
    queryClient.invalidateQueries({ queryKey: ["reproducao"] });
    queryClient.invalidateQueries({ queryKey: ["animais-lactantes"] });
    queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
  }

  // Estorno: apaga a venda e a receita dela, e o animal volta pro rebanho.
  const estornar = useMutation({
    mutationFn: async (entrada: EntradaHistorico) => {
      const { error } = await db.financeiro.estornarVenda({
        fazendaId: fazenda!.id,
        vendaId: entrada.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Venda estornada. O animal voltou para o rebanho.");
      setEstornando(null);
      for (const chave of [
        "animal-ficha",
        "ficha-vendas",
        "animais",
        "animais-contagem",
        "financeiro",
      ]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
      invalidarTudo();
    },
    onError: (e: Error) => toast.error(e.message || "Não conseguimos estornar agora."),
  });

  const excluir = useMutation({
    mutationFn: async (entrada: EntradaHistorico) => {
      const tabela =
        entrada.tipo === "leite"
          ? "producao_leite"
          : entrada.tipo === "reproducao"
            ? "reproducao"
            : "manejos";
      const { error } = await db.from(tabela).delete().eq("id", entrada.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro excluído.");
      setExcluindo(null);
      invalidarTudo();
    },
    onError: () => toast.error("Não conseguimos excluir agora. Tente de novo."),
  });

  // ---- linha do tempo unificada -------------------------------------------
  const linha = useMemo<EntradaHistorico[]>(() => {
    const itens: EntradaHistorico[] = [];
    for (const r of leite.data ?? []) {
      const turnoTexto = r.turno === "manha" ? "Manhã" : r.turno === "tarde" ? "Tarde" : "Noite";
      itens.push({
        id: r.id,
        tipo: "leite",
        data: dataISO(r.data),
        titulo: "Leite",
        descricao: `${turnoTexto} · ${r.produto}`,
        valorTexto: `${Number(r.litros).toLocaleString("pt-BR")} L`,
        editavel: true,
        bruta: r,
      });
    }
    for (const r of manejos.data ?? []) {
      const ehPesagem = r.tipo === "pesagem";
      itens.push({
        id: r.id,
        tipo: ehPesagem ? "peso" : "manejo",
        data: dataISO(r.data),
        titulo: ehPesagem
          ? "Pesagem"
          : (TITULO_MANEJO[r.tipo ?? ""] ??
            (r.tipo ? r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1) : "Manejo")),
        descricao: r.descricao || (ehPesagem ? "Pesagem de rotina" : "Manejo registrado"),
        valorTexto: ehPesagem
          ? r.valor !== null
            ? pesoTexto(Number(r.valor), prefs.unidade_peso)
            : null
          : r.valor !== null
            ? moeda(Number(r.valor))
            : null,
        editavel: true,
        bruta: r,
      });
    }
    for (const r of reproducao.data ?? []) {
      itens.push({
        id: r.id,
        tipo: "reproducao",
        data: dataISO(r.data),
        titulo: r.tipo ? r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1) : "Reprodução",
        descricao:
          r.observacoes ||
          (r.touro ? `Touro/sêmen: ${r.touro}` : null) ||
          (r.previsao_parto
            ? `Previsão estimada de parto: ${dataCurta(r.previsao_parto)}`
            : "Registro de reprodução"),
        valorTexto: null,
        editavel: true,
        bruta: r,
      });
    }
    for (const r of vendas.data ?? []) {
      itens.push({
        id: r.id,
        tipo: "venda",
        data: dataISO(r.data),
        titulo: "Venda",
        descricao: r.comprador ? `Vendido para ${r.comprador}` : "Venda registrada",
        valorTexto: moeda(Number(r.valor_total)),
        editavel: false,
        bruta: r,
      });
    }
    itens.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    return itens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leite.data, manejos.data, reproducao.data, vendas.data, prefs.unidade_peso]);

  const linhaFiltrada = useMemo(() => {
    const limite = periodo === "tudo" ? null : diasAtrasISO(Number(periodo));
    return linha.filter((e) => {
      if (limite && e.data < limite) return false;
      if (tipoFiltro !== "todos" && e.tipo !== tipoFiltro) return false;
      return true;
    });
  }, [linha, periodo, tipoFiltro]);

  // ---- gráfico de produção de leite (últimos 30 dias) ---------------------
  const dadosGrafico = useMemo(() => {
    const limite30 = diasAtrasISO(30);
    const porDia = new Map<string, number>();
    for (const r of leite.data ?? []) {
      const d = dataISO(r.data);
      if (d < limite30 || r.produto !== "leite") continue;
      porDia.set(d, (porDia.get(d) ?? 0) + Number(r.litros));
    }
    return Array.from(porDia.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([data, litros]) => ({ data: dataCurta(data), litros: Math.round(litros * 10) / 10 }));
  }, [leite.data]);

  const mediaLitrosDia =
    dadosGrafico.length > 0
      ? dadosGrafico.reduce((s, d) => s + d.litros, 0) / dadosGrafico.length
      : 0;

  const a = animal.data;

  if (animal.isLoading) {
    return (
      <AppShell titulo="Ficha do animal">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </AppShell>
    );
  }

  if (!a) {
    return (
      <AppShell titulo="Ficha do animal">
        <p className="text-sm text-muted-foreground">Animal não encontrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/rebanho">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar ao rebanho
          </Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo={a.nome}
      acao={
        <div className="flex flex-wrap gap-2">
          {a.status !== "vendido" && a.status !== "morto" ? (
            <>
              <Button variant="outline" onClick={() => setSanidadeAberto(true)}>
                <Syringe className="size-4" aria-hidden="true" />
                Vacinas e manejo
              </Button>
              <Button variant="outline" onClick={() => setVendendo(a)}>
                <BadgeDollarSign className="size-4" aria-hidden="true" />
                Vender
              </Button>
            </>
          ) : null}
          <Button variant="outline" asChild>
            <Link to="/rebanho">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Voltar
            </Link>
          </Button>
        </div>
      }
    >
      <DialogVenderAnimal
        animal={vendendo}
        fazendaId={fazenda?.id}
        onFechar={() => setVendendo(null)}
        moeda={moeda}
      />
      <DialogManejoSanitario
        aberto={sanidadeAberto}
        onFechar={() => setSanidadeAberto(false)}
        animalIdInicial={a.id}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-accent text-xl font-extrabold text-primary">
              {a.nome.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">
                {a.nome}
                {a.brinco ? ` · Nº ${a.brinco}` : ""}
              </h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {rotuloCategoria(a.categoria)}
                </span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {rotuloStatus(a.status)}
                </span>
              </div>
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <LinhaResumo rotulo="Idade" valor={idadeTexto(a.nascimento)} />
            <LinhaResumo rotulo="Peso atual" valor={pesoTexto(a.peso_kg, prefs.unidade_peso)} />
            <LinhaResumo rotulo="Lote" valor={a.lote || "—"} />
            <LinhaResumo rotulo="Mãe" valor={a.mae || "—"} />
            <LinhaResumo rotulo="Entrada no rebanho" valor={dataCurta(a.created_at)} />
          </dl>
          <Button variant="outline" className="mt-4 w-full" asChild>
            <Link to="/rebanho" search={{ editar: a.id }}>
              Editar dados do animal
            </Link>
          </Button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Período</p>
            <div className="flex flex-wrap gap-2">
              {(["7", "30", "90", "tudo"] as Periodo[]).map((p) => (
                <Chip key={p} ativo={periodo === p} onClick={() => setPeriodo(p)}>
                  {p === "tudo" ? "Tudo" : `${p} dias`}
                </Chip>
              ))}
            </div>
            <p className="mt-3 mb-2 text-xs font-semibold text-muted-foreground">Tipo</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["todos", "Todos"],
                  ["leite", "Leite"],
                  ["peso", "Peso"],
                  ["manejo", "Manejo"],
                  ["reproducao", "Reprodução"],
                  ["venda", "Venda"],
                ] as [TipoFiltro, string][]
              ).map(([v, l]) => (
                <Chip key={v} ativo={tipoFiltro === v} onClick={() => setTipoFiltro(v)}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>

          {dadosGrafico.length > 0 ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Produção de leite — últimos 30 dias</p>
                <p className="text-sm font-bold text-primary">
                  {mediaLitrosDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L média/dia
                </p>
              </div>
              <ChartContainer
                config={{ litros: { label: "Litros", color: "var(--primary)" } }}
                className="mt-3 h-40 w-full"
              >
                <AreaChart data={dadosGrafico}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="data" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="litros"
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">Histórico</div>
            {linhaFiltrada.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Nenhum registro nesse período/filtro.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {linhaFiltrada.map((e) => {
                  const Icone = ICONE_TIPO[e.tipo];
                  return (
                    <li
                      key={`${e.tipo}-${e.id}`}
                      className="flex items-center gap-3 px-4 py-3 text-sm"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                        <Icone className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{e.titulo}</span>
                          <span className="text-xs text-muted-foreground">{dataCurta(e.data)}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{e.descricao}</p>
                      </div>
                      {e.valorTexto ? (
                        <span className="font-semibold whitespace-nowrap">{e.valorTexto}</span>
                      ) : null}
                      {e.tipo === "venda" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => setEstornando(e)}
                          aria-label="Estornar venda"
                        >
                          <Undo2 className="size-3.5" aria-hidden="true" />
                          Estornar
                        </Button>
                      ) : null}
                      {e.editavel ? (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setEditando(e)}
                            aria-label="Editar registro"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => setExcluindo(e)}
                            aria-label="Excluir registro"
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <DialogoEdicao
        entrada={editando}
        onFechar={() => setEditando(null)}
        onSalvo={invalidarTudo}
      />

      <AlertDialog open={estornando !== null} onOpenChange={(v) => !v && setEstornando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar venda?</AlertDialogTitle>
            <AlertDialogDescription>
              {estornando
                ? `A venda de ${dataCurta(estornando.data)} (${estornando.valorTexto ?? ""}) sai do Financeiro e o animal volta para o rebanho na situação que estava antes. Use quando a venda foi registrada por engano.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={estornar.isPending}
              onClick={() => estornando && estornar.mutate(estornando)}
            >
              Estornar venda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={excluindo !== null} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo
                ? `${excluindo.titulo} de ${dataCurta(excluindo.data)}. Essa ação não pode ser desfeita.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={excluir.isPending}
              onClick={() => excluindo && excluir.mutate(excluindo)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-semibold">{valor}</dd>
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        ativo
          ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          : "rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transicao-suave hover:bg-accent"
      }
    >
      {children}
    </button>
  );
}

/** Edita a entrada do histórico — campos variam conforme o tipo do registro. */
function DialogoEdicao({
  entrada,
  onFechar,
  onSalvo,
}: {
  entrada: EntradaHistorico | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const salvar = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!entrada) return;
      const tabela =
        entrada.tipo === "leite"
          ? "producao_leite"
          : entrada.tipo === "reproducao"
            ? "reproducao"
            : "manejos";
      const { error } = await db
        .from(tabela)
        .update(payload as never)
        .eq("id", entrada.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro atualizado.");
      onSalvo();
      onFechar();
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente de novo."),
  });

  return (
    <Dialog open={entrada !== null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent key={entrada ? `${entrada.tipo}-${entrada.id}` : "vazio"}>
        <DialogHeader>
          <DialogTitle>Editar {entrada ? ROTULO_TIPO[entrada.tipo].toLowerCase() : ""}</DialogTitle>
          <DialogDescription>Corrija os dados desse registro do histórico.</DialogDescription>
        </DialogHeader>
        {entrada ? (
          <>
            <form
              id="form-editar-historico"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                if (entrada.tipo === "leite") {
                  salvar.mutate({
                    data: String(form.get("data")),
                    litros: Number(form.get("litros")),
                    turno: String(form.get("turno")),
                  });
                } else if (entrada.tipo === "peso") {
                  salvar.mutate({
                    data: String(form.get("data")),
                    valor: Number(form.get("valor")),
                  });
                } else if (entrada.tipo === "manejo") {
                  salvar.mutate({
                    data: String(form.get("data")),
                    tipo: String(form.get("tipo") ?? "").trim() || "manejo",
                    descricao: String(form.get("descricao") ?? "").trim() || null,
                    valor: form.get("valor") ? Number(form.get("valor")) : null,
                  });
                } else if (entrada.tipo === "reproducao") {
                  salvar.mutate({
                    data: String(form.get("data")),
                    touro: String(form.get("touro") ?? "").trim() || null,
                    previsao_parto: String(form.get("previsao_parto") ?? "") || null,
                    observacoes: String(form.get("observacoes") ?? "").trim() || null,
                  });
                }
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="ed-data">Data</Label>
                <Input id="ed-data" name="data" type="date" defaultValue={entrada.data} required />
              </div>

              {entrada.tipo === "leite" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-litros">Quantidade</Label>
                    <Input
                      id="ed-litros"
                      name="litros"
                      type="number"
                      step="0.1"
                      min="0"
                      defaultValue={entrada.bruta.litros}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-turno">Turno</Label>
                    <select
                      id="ed-turno"
                      name="turno"
                      defaultValue={entrada.bruta.turno}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="manha">Manhã</option>
                      <option value="tarde">Tarde</option>
                      <option value="noite">Noite</option>
                    </select>
                  </div>
                </>
              ) : null}

              {entrada.tipo === "peso" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ed-valor-peso">Peso (kg)</Label>
                  <Input
                    id="ed-valor-peso"
                    name="valor"
                    type="number"
                    step="0.1"
                    min="0"
                    defaultValue={entrada.bruta.valor ?? ""}
                    required
                  />
                </div>
              ) : null}

              {entrada.tipo === "manejo" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-tipo-manejo">Tipo</Label>
                    <Input
                      id="ed-tipo-manejo"
                      name="tipo"
                      defaultValue={entrada.bruta.tipo ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-descricao">Descrição</Label>
                    <Input
                      id="ed-descricao"
                      name="descricao"
                      defaultValue={entrada.bruta.descricao ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-valor-manejo">Valor (R$, opcional)</Label>
                    <Input
                      id="ed-valor-manejo"
                      name="valor"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={entrada.bruta.valor ?? ""}
                    />
                  </div>
                </>
              ) : null}

              {entrada.tipo === "reproducao" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-touro">Touro / sêmen</Label>
                    <Input id="ed-touro" name="touro" defaultValue={entrada.bruta.touro ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-previsao">Previsão estimada de parto</Label>
                    <Input
                      id="ed-previsao"
                      name="previsao_parto"
                      type="date"
                      defaultValue={
                        entrada.bruta.previsao_parto ? dataISO(entrada.bruta.previsao_parto) : ""
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-obs">Observações</Label>
                    <Input
                      id="ed-obs"
                      name="observacoes"
                      defaultValue={entrada.bruta.observacoes ?? ""}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O tipo do registro (cobertura, inseminação, parto...) não pode ser alterado aqui
                    — cadastre um novo registro em Reprodução se precisar mudar o tipo.
                  </p>
                </>
              ) : null}
            </form>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onFechar}>
                Cancelar
              </Button>
              <Button type="submit" form="form-editar-historico" disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
