import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Share2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda, useLimitePlano } from "@/hooks/use-fazenda";
import { RecursoBloqueado } from "@/components/RecursoBloqueado";
import { usePerfil } from "@/hooks/use-preferencias";
import { dataCurta, hojeISO, moeda } from "@/lib/formato";
import { especiesDasAtividades } from "@/lib/especies";
import {
  montarRelatorio,
  type AnimalRelatorio,
  type LancamentoRelatorio,
  type ManejoRelatorio,
  type ParcelaPagaRelatorio,
} from "@/lib/relatorio";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Curral Online" },
      {
        name: "description",
        content: "Relatório em PDF do rebanho e da atividade para banco e cooperativa.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Relatorios,
});

type Preset = "12meses" | "ano" | "anoPassado" | "personalizado";

function periodoDoPreset(preset: Exclude<Preset, "personalizado">) {
  const hoje = hojeISO();
  const ano = Number(hoje.slice(0, 4));
  if (preset === "ano") return { inicio: `${ano}-01-01`, fim: hoje };
  if (preset === "anoPassado") return { inicio: `${ano - 1}-01-01`, fim: `${ano - 1}-12-31` };
  const [a = 0, m = 1, d = 1] = hoje.split("-").map(Number);
  const inicio = new Date(Date.UTC(a - 1, m - 1, d + 1)).toISOString().slice(0, 10);
  return { inicio, fim: hoje };
}

type Identificacao = { produtor: string; documento: string; caf: string; inscricao: string };
const IDENT_VAZIA: Identificacao = { produtor: "", documento: "", caf: "", inscricao: "" };

// Dados de identificação ficam só neste aparelho (conveniência pra não
// redigitar) — não vão pro banco.
function lerIdentificacao(chave: string): Identificacao | null {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? { ...IDENT_VAZIA, ...JSON.parse(bruto) } : null;
  } catch {
    return null;
  }
}

function Relatorios() {
  const { data: fazenda } = useFazenda();
  const { plano, carregando: carregandoPlano } = useLimitePlano();
  const { data: perfil } = usePerfil();
  const especies = especiesDasAtividades(fazenda?.atividades);
  const temLeite = especies.includes("bovino");

  const [preset, setPreset] = useState<Preset>("12meses");
  const [periodo, setPeriodo] = useState(() => periodoDoPreset("12meses"));
  const [ident, setIdent] = useState<Identificacao>(IDENT_VAZIA);
  const [gerando, setGerando] = useState(false);
  const [podeCompartilhar, setPodeCompartilhar] = useState(false);

  const chaveIdent = fazenda?.id ? `relatorio-identificacao-${fazenda.id}` : null;
  useEffect(() => {
    if (!chaveIdent) return;
    const salva = lerIdentificacao(chaveIdent);
    setIdent(salva ?? { ...IDENT_VAZIA, produtor: perfil?.nome ?? "" });
  }, [chaveIdent, perfil?.nome]);

  useEffect(() => {
    void import("@/lib/relatorio-pdf").then((m) =>
      setPodeCompartilhar(m.podeCompartilharArquivo()),
    );
  }, []);

  function alterarIdent(campo: keyof Identificacao, valor: string) {
    const nova = { ...ident, [campo]: valor };
    setIdent(nova);
    if (!chaveIdent) return;
    try {
      localStorage.setItem(chaveIdent, JSON.stringify(nova));
    } catch {
      // sem armazenamento local: só não lembra na próxima vez
    }
  }

  function escolherPreset(p: Preset) {
    setPreset(p);
    if (p !== "personalizado") setPeriodo(periodoDoPreset(p));
  }

  const periodoValido = !!periodo.inicio && !!periodo.fim && periodo.inicio <= periodo.fim;

  const dados = useQuery({
    queryKey: ["relatorio", fazenda?.id, periodo.inicio, periodo.fim, temLeite],
    enabled: !!fazenda?.id && periodoValido && plano.relatorios,
    queryFn: async () => {
      const id = fazenda!.id;
      const [animais, lancamentos, parcelas, contas, manejos, leite] = await Promise.all([
        db
          .from("animais")
          .select(
            "id, nome, brinco, especie, categoria, sexo, status, nascimento, mae, created_at, updated_at",
          )
          .eq("fazenda_id", id),
        db
          .from("financeiro_lancamentos")
          .select("tipo, categoria, valor, status")
          .eq("fazenda_id", id)
          .gte("data", periodo.inicio)
          .lte("data", periodo.fim),
        db
          .from("parcelas")
          .select("conta_id, valor")
          .eq("fazenda_id", id)
          .eq("status", "pago")
          .gte("pago_em", periodo.inicio)
          .lte("pago_em", periodo.fim),
        db.from("contas").select("id, tipo, categoria").eq("fazenda_id", id),
        db
          .from("manejos")
          .select("animal_id, tipo, descricao, data")
          .eq("fazenda_id", id)
          .in("tipo", ["vacina", "vermifugo", "tratamento"])
          .gte("data", periodo.inicio)
          .lte("data", periodo.fim),
        temLeite
          ? db
              .from("producao_leite")
              .select("litros")
              .eq("fazenda_id", id)
              .eq("produto", "leite")
              .gte("data", periodo.inicio)
              .lte("data", periodo.fim)
          : Promise.resolve({ data: null, error: null }),
      ]);
      for (const r of [animais, lancamentos, parcelas, contas, manejos, leite]) {
        if (r.error) throw r.error;
      }
      const contaPorId = new Map(
        ((contas.data ?? []) as { id: string; tipo: string; categoria: string | null }[]).map(
          (c) => [c.id, c],
        ),
      );
      const parcelasPagas: ParcelaPagaRelatorio[] = [];
      for (const p of (parcelas.data ?? []) as { conta_id: string; valor: string | number }[]) {
        const conta = contaPorId.get(p.conta_id);
        if (conta && (conta.tipo === "a_receber" || conta.tipo === "a_pagar")) {
          parcelasPagas.push({ valor: p.valor, tipo: conta.tipo, categoria: conta.categoria });
        }
      }
      const linhasLeite = (leite.data ?? null) as { litros: string | number }[] | null;
      return {
        animais: (animais.data ?? []) as AnimalRelatorio[],
        lancamentos: (lancamentos.data ?? []) as LancamentoRelatorio[],
        parcelasPagas,
        manejos: (manejos.data ?? []) as ManejoRelatorio[],
        litrosLeite: linhasLeite ? linhasLeite.reduce((s, l) => s + Number(l.litros), 0) : null,
      };
    },
  });

  const relatorio = useMemo(
    () => (dados.data ? montarRelatorio(dados.data, periodo.inicio, periodo.fim, especies) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados.data, periodo.inicio, periodo.fim, especies.join(",")],
  );

  async function gerar(compartilhar: boolean) {
    if (!relatorio || !fazenda) return;
    setGerando(true);
    try {
      const { gerarRelatorioPDF, entregarPDF } = await import("@/lib/relatorio-pdf");
      const blob = await gerarRelatorioPDF(relatorio, {
        fazenda: fazenda.nome,
        municipio: [fazenda.cidade, fazenda.estado].filter(Boolean).join("/"),
        produtor: ident.produtor.trim(),
        documento: ident.documento.trim(),
        caf: ident.caf.trim(),
        inscricao: ident.inscricao.trim(),
      });
      const nome = `relatorio-${fazenda.nome
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .toLowerCase()}-${periodo.inicio}-a-${periodo.fim}.pdf`;
      await entregarPDF(blob, nome, compartilhar);
    } catch {
      toast.error("Não conseguimos gerar o PDF agora. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  const soma = (campo: "inicial" | "nascimentos" | "entradas" | "vendas" | "mortes" | "final") =>
    (relatorio?.evolucao ?? []).reduce((s, l) => s + l[campo], 0);
  const resultado = (relatorio?.totalReceitas ?? 0) - (relatorio?.totalDespesas ?? 0);

  // Plano sem relatórios (grátis de conta nova): mostra o que é e como liberar.
  if (!carregandoPlano && !plano.relatorios) {
    return (
      <AppShell titulo="Relatórios">
        <div className="max-w-xl space-y-4">
          <RecursoBloqueado recurso="O relatório em PDF" planoNecessario="Essencial" />
          <Button asChild>
            <Link to="/config" hash="plano">
              Ver planos
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Relatórios">
      {/* No celular a prévia (com o botão de baixar) vem logo depois do
          período; no desktop ela ocupa a coluna da direita. */}
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr] lg:grid-rows-[auto_1fr] lg:items-start">
        <section className="rounded-xl lg:col-start-1 lg:row-start-1 border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Período</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                ["12meses", "Últimos 12 meses"],
                ["ano", "Este ano"],
                ["anoPassado", "Ano passado"],
                ["personalizado", "Outro período"],
              ] as const
            ).map(([valor, rotulo]) => (
              <Button
                key={valor}
                type="button"
                size="sm"
                variant={preset === valor ? "default" : "outline"}
                onClick={() => escolherPreset(valor)}
              >
                {rotulo}
              </Button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rel-inicio">De</Label>
              <Input
                id="rel-inicio"
                type="date"
                value={periodo.inicio}
                max={periodo.fim}
                onChange={(e) => {
                  setPreset("personalizado");
                  setPeriodo((p) => ({ ...p, inicio: e.target.value }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-fim">Até</Label>
              <Input
                id="rel-fim"
                type="date"
                value={periodo.fim}
                min={periodo.inicio}
                max={hojeISO()}
                onChange={(e) => {
                  setPreset("personalizado");
                  setPeriodo((p) => ({ ...p, fim: e.target.value }));
                }}
              />
            </div>
          </div>
          {!periodoValido ? (
            <p className="mt-2 text-xs text-destructive">
              A data inicial precisa ser antes da final.
            </p>
          ) : null}
        </section>
        <section className="rounded-xl lg:col-start-2 lg:row-span-2 lg:row-start-1 border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Prévia</h2>
              <p className="text-xs text-muted-foreground">
                {periodoValido
                  ? `${dataCurta(periodo.inicio)} a ${dataCurta(periodo.fim)}`
                  : "Escolha um período válido"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {podeCompartilhar ? (
                <Button
                  variant="outline"
                  onClick={() => gerar(true)}
                  disabled={!relatorio || gerando}
                >
                  <Share2 className="size-4" aria-hidden="true" />
                  Compartilhar
                </Button>
              ) : null}
              <Button onClick={() => gerar(false)} disabled={!relatorio || gerando}>
                <Download className="size-4" aria-hidden="true" />
                {gerando ? "Gerando..." : "Baixar PDF"}
              </Button>
            </div>
          </div>

          {dados.isLoading ? (
            <p className="mt-6 text-sm text-muted-foreground">Carregando dados do período...</p>
          ) : dados.isError ? (
            <p className="mt-6 text-sm text-destructive">
              Não conseguimos carregar os dados agora. Tente novamente.
            </p>
          ) : relatorio ? (
            <div className="mt-5 space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Indicador rotulo="Rebanho no início" valor={`${soma("inicial")} cab.`} />
                <Indicador rotulo="Rebanho no fim" valor={`${soma("final")} cab.`} />
                <Indicador rotulo="Nascimentos" valor={String(soma("nascimentos"))} />
                <Indicador rotulo="Outras entradas" valor={String(soma("entradas"))} />
                <Indicador rotulo="Vendas de animais" valor={String(soma("vendas"))} />
                <Indicador
                  rotulo="Mortes"
                  valor={String(soma("mortes"))}
                  classe={soma("mortes") > 0 ? "text-destructive" : ""}
                />
                <Indicador
                  rotulo="Receitas"
                  valor={moeda(relatorio.totalReceitas)}
                  classe="text-success"
                />
                <Indicador
                  rotulo="Custos"
                  valor={moeda(relatorio.totalDespesas)}
                  classe="text-destructive"
                />
                <Indicador
                  rotulo="Resultado"
                  valor={moeda(resultado)}
                  classe={resultado < 0 ? "text-destructive" : "text-success"}
                />
                {relatorio.litrosLeite ? (
                  <Indicador
                    rotulo="Leite produzido"
                    valor={`${Math.round(relatorio.litrosLeite).toLocaleString("pt-BR")} L`}
                  />
                ) : null}
                <Indicador
                  rotulo="Aplicações sanitárias"
                  valor={String(relatorio.sanidade.length)}
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold">Inventário em {dataCurta(relatorio.fim)}</h3>
                {relatorio.inventario.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nenhum animal no rebanho nessa data.
                  </p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Categoria</th>
                          <th className="py-2 pr-3 text-right font-medium">Machos</th>
                          <th className="py-2 pr-3 text-right font-medium">Fêmeas</th>
                          <th className="py-2 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relatorio.inventario.map((l) => (
                          <tr
                            key={`${l.especie}-${l.categoria}`}
                            className="border-b border-border/60"
                          >
                            <td className="py-2 pr-3">
                              {l.categoria}
                              {especies.length > 1 ? (
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  · {l.especie === "bovino" ? "bovino" : "ovino"}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{l.machos}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{l.femeas}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">
                              {l.total}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  <FileText className="size-4" aria-hidden="true" />O PDF traz também
                </p>
                <p className="mt-1">
                  Evolução do rebanho por espécie, lista de nascimentos (
                  {relatorio.nascimentos.length}), vendas e mortes ({relatorio.saidas.length}),
                  receitas e custos por categoria, vacinas e tratamentos aplicados, e espaço para
                  assinatura.
                </p>
              </div>
            </div>
          ) : null}
        </section>
        <section className="rounded-xl lg:col-start-1 lg:row-start-2 border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Identificação no relatório</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O banco costuma pedir. Fica salvo só neste aparelho.
          </p>
          <div className="mt-3 space-y-3">
            {(
              [
                ["produtor", "Produtor(a)", "Nome completo"],
                ["documento", "CPF ou CNPJ", "000.000.000-00"],
                ["caf", "CAF / DAP (opcional)", "Número do CAF ou DAP"],
                ["inscricao", "Inscrição estadual (opcional)", "Inscrição de produtor rural"],
              ] as const
            ).map(([campo, rotulo, exemplo]) => (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={`rel-${campo}`}>{rotulo}</Label>
                <Input
                  id={`rel-${campo}`}
                  value={ident[campo]}
                  placeholder={exemplo}
                  onChange={(e) => alterarIdent(campo, e.target.value)}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Indicador({
  rotulo,
  valor,
  classe = "",
}: {
  rotulo: string;
  valor: string;
  classe?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-1 font-display text-lg font-extrabold tabular-nums", classe)}>{valor}</p>
    </div>
  );
}
