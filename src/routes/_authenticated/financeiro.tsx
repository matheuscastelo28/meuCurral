import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, dataISO, hojeISO, moeda as formatarMoeda } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Curral Online" },
      { name: "description", content: "Receitas e despesas da fazenda em um só lugar." },
      { property: "og:title", content: "Financeiro — Curral Online" },
      { property: "og:description", content: "Receitas e despesas da fazenda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Financeiro,
});

const FORMAS_PAGAMENTO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  boleto: "Boleto",
  transferencia: "Transferência",
};

function Financeiro() {
  const prefs = usePreferencias();
  const moeda = (v: number | null | undefined) => formatarMoeda(v, prefs.moeda);
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState("despesa");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [formaPagamento, setFormaPagamento] = useState("dinheiro");
  const [parcelas, setParcelas] = useState("1");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "despesa" | "receita">("todos");
  const [filtroData, setFiltroData] = useState("");
  // Só se aplica a receita — despesa lançada na mão ainda não distingue
  // "a pagar" de "paga" (ver comentário no cálculo do Saldo, mais abaixo).
  const [receitaRecebida, setReceitaRecebida] = useState(true);

  const lancamentos = useQuery({
    queryKey: ["financeiro", fazenda?.id],
    enabled: !!fazenda?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("financeiro_lancamentos")
        .select("*")
        .eq("fazenda_id", fazenda!.id)
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("financeiro_lancamentos").insert({
        fazenda_id: fazenda!.id,
        tipo,
        descricao: descricao.trim(),
        valor: Number(valor),
        data,
        forma_pagamento: formaPagamento,
        parcelas: formaPagamento === "cartao" ? Number(parcelas) || 1 : null,
        // Despesa lançada na mão não tem como marcar "a pagar" ainda — só
        // receita usa o status pra distinguir do que já entrou no caixa.
        ...(tipo === "receita" ? { status: receitaRecebida ? "recebido" : "a_receber" } : {}),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento registrado.");
      setDescricao("");
      setValor("");
      setFormaPagamento("dinheiro");
      setParcelas("1");
      setReceitaRecebida(true);
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  const marcarRecebido = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await db.leite.marcarRecebido(ids);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lançamentos marcados como recebidos.");
      setSelecionados(new Set());
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    },
    onError: () => toast.error("Não conseguimos confirmar o recebimento agora."),
  });

  // Receita do período: tudo que foi faturado (vendido/lançado), inclusive o
  // que ainda não entrou no caixa — é o faturamento, não o saldo em caixa.
  const receitaPeriodo = (lancamentos.data ?? [])
    .filter((l) => l.tipo === "receita")
    .reduce((s, l) => s + Number(l.valor), 0);
  // Despesas: o app ainda não distingue "a pagar" de "paga" (todo lançamento
  // manual de despesa nasce com status "confirmado", sem opção de escolher)
  // — então toda despesa lançada já é tratada como dinheiro que saiu.
  const despesas = (lancamentos.data ?? [])
    .filter((l) => l.tipo === "despesa")
    .reduce((s, l) => s + Number(l.valor), 0);
  const aReceber = (lancamentos.data ?? [])
    .filter((l) => l.tipo === "receita" && l.status === "a_receber")
    .reduce((s, l) => s + Number(l.valor), 0);
  const recebido = (lancamentos.data ?? [])
    .filter((l) => l.tipo === "receita" && l.status === "recebido")
    .reduce((s, l) => s + Number(l.valor), 0);
  // Saldo realizado: dinheiro que efetivamente entrou e saiu — não é
  // "receita faturada menos despesa", que mistura o que ainda não foi
  // recebido com o caixa de verdade.
  const saldoRealizado = recebido - despesas;

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function aoMudarParcelas(valorDigitado: string) {
    if (valorDigitado === "") {
      setParcelas(valorDigitado);
      return;
    }
    const numero = Math.max(1, Math.min(12, Number(valorDigitado) || 1));
    setParcelas(String(numero));
  }

  const filtroAtivo = filtroTipo !== "todos" || filtroData !== "";
  const lancamentosFiltrados = (lancamentos.data ?? []).filter(
    (l) =>
      (filtroTipo === "todos" || l.tipo === filtroTipo) &&
      (!filtroData || dataISO(l.data) === filtroData),
  );

  return (
    <AppShell titulo="Financeiro" descricao="Entradas e saídas da fazenda, sem planilha.">
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Resumo
          rotulo="Receita do período"
          valor={moeda(receitaPeriodo)}
          classe="text-success"
          nota="Faturado, inclusive o que ainda não caiu na conta"
        />
        <Resumo rotulo="Recebido" valor={moeda(recebido)} classe="text-success" />
        <Resumo rotulo="A receber" valor={moeda(aReceber)} classe="text-warning" />
        <Resumo rotulo="Despesas" valor={moeda(despesas)} classe="text-destructive" />
        <Resumo
          rotulo="Saldo realizado"
          valor={moeda(saldoRealizado)}
          classe=""
          nota="Recebido menos despesas — dinheiro de verdade"
        />
      </div>

      {selecionados.size > 0 ? (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-accent/40 px-4 py-2.5 text-sm">
          <span>{selecionados.size} selecionado(s)</span>
          <Button
            type="button"
            size="sm"
            disabled={marcarRecebido.isPending}
            onClick={() => marcarRecebido.mutate(Array.from(selecionados))}
          >
            <CircleCheck className="size-4" aria-hidden="true" />
            Marcar como recebido
          </Button>
        </div>
      ) : null}

      <form
        className="mb-5 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <h2 className="text-base font-semibold">Novo lançamento</h2>
        <p className="mt-1 text-sm text-muted-foreground">Registre uma despesa ou receita da fazenda.</p>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <div className="min-w-[140px] flex-1 space-y-1.5">
            <Label htmlFor="tipo-lanc">Tipo</Label>
            <select
              id="tipo-lanc"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </div>
          <div className="min-w-[220px] flex-[2] space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Input
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Compra de ração"
              required
            />
          </div>
          <div className="min-w-[140px] flex-1 space-y-1.5">
            <Label htmlFor="valor">Valor (R$)</Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
            />
          </div>
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <Label htmlFor="data-lanc">Data</Label>
            <Input
              id="data-lanc"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </div>
          {tipo === "receita" ? (
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <Label>Situação</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={receitaRecebida ? "default" : "outline"}
                  onClick={() => setReceitaRecebida(true)}
                >
                  Recebido
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={receitaRecebida ? "outline" : "default"}
                  onClick={() => setReceitaRecebida(false)}
                >
                  A receber
                </Button>
              </div>
            </div>
          ) : null}
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <Label htmlFor="forma-pagamento">Forma de pagamento</Label>
            <select
              id="forma-pagamento"
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="cartao">Cartão</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
            </select>
          </div>
          {formaPagamento === "cartao" ? (
            <div className="min-w-[110px] space-y-1.5">
              <Label htmlFor="parcelas">Parcelas</Label>
              <Input
                id="parcelas"
                type="number"
                min="1"
                max="12"
                step="1"
                value={parcelas}
                onChange={(e) => aoMudarParcelas(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <Button type="submit" disabled={salvar.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            Lançar
          </Button>
        </div>
      </form>

      {(lancamentos.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Wallet}
          titulo="Nenhum lançamento"
          descricao="Registre a primeira despesa ou receita para acompanhar o resultado da fazenda."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <h2 className="text-base font-semibold">Lançamentos</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filtrar por tipo"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="todos">Todos os tipos</option>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
              <Input
                type="date"
                aria-label="Filtrar por data"
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
                className="h-9 w-auto"
              />
              {filtroAtivo ? (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroTipo("todos");
                    setFiltroData("");
                  }}
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          </div>

          {lancamentosFiltrados.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum lançamento encontrado com esse filtro.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lancamentosFiltrados.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    {l.status === "a_receber" ? (
                      <input
                        type="checkbox"
                        checked={selecionados.has(l.id)}
                        onChange={() => alternarSelecao(l.id)}
                        aria-label={`Selecionar ${l.descricao}`}
                        className="size-4 accent-[var(--primary)]"
                      />
                    ) : null}
                    <span>
                      <span className="block font-medium">{l.descricao}</span>
                      <span className="block text-xs text-muted-foreground">
                        {dataCurta(l.data)} · {FORMAS_PAGAMENTO[l.forma_pagamento] ?? l.forma_pagamento}
                        {l.forma_pagamento === "cartao" && l.parcelas && l.parcelas > 1
                          ? ` em ${l.parcelas}x`
                          : ""}
                        {l.status === "a_receber" ? (
                          <span className="ml-1.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-warning">
                            a receber
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                  <span
                    className={
                      l.tipo === "receita"
                        ? "font-semibold text-success"
                        : "font-semibold text-destructive"
                    }
                  >
                    {l.tipo === "receita" ? "+" : "−"} {moeda(Number(l.valor))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Resumo({
  rotulo,
  valor,
  classe,
  nota,
}: {
  rotulo: string;
  valor: string;
  classe: string;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`font-display text-2xl font-extrabold ${classe}`}>{valor}</p>
      {nota ? <p className="mt-1 text-[11px] text-muted-foreground">{nota}</p> : null}
    </div>
  );
}
