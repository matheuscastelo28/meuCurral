import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { dataCurta, hojeISO, moeda as formatarMoeda } from "@/lib/formato";
import { usePreferencias } from "@/hooks/use-preferencias";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Meu Curral Digital" },
      { name: "description", content: "Receitas e despesas da fazenda em um só lugar." },
      { property: "og:title", content: "Financeiro — Meu Curral Digital" },
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
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento registrado.");
      setDescricao("");
      setValor("");
      setFormaPagamento("dinheiro");
      setParcelas("1");
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["inicio-resumo"] });
    },
    onError: () => toast.error("Não conseguimos salvar agora. Tente novamente."),
  });

  const receitas = (lancamentos.data ?? [])
    .filter((l) => l.tipo === "receita")
    .reduce((s, l) => s + Number(l.valor), 0);
  const despesas = (lancamentos.data ?? [])
    .filter((l) => l.tipo === "despesa")
    .reduce((s, l) => s + Number(l.valor), 0);

  return (
    <AppShell titulo="Financeiro" descricao="Entradas e saídas da fazenda, sem planilha.">
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Resumo rotulo="Receitas" valor={moeda(receitas)} classe="text-success" />
        <Resumo rotulo="Despesas" valor={moeda(despesas)} classe="text-destructive" />
        <Resumo rotulo="Saldo" valor={moeda(receitas - despesas)} classe="" />
      </div>

      <form
        className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-5 lg:grid-cols-7"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <div className="space-y-1.5">
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Input
            id="descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Compra de ração"
            required
          />
        </div>
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
          <Label htmlFor="data-lanc">Data</Label>
          <Input
            id="data-lanc"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <Label htmlFor="parcelas">Parcelas</Label>
            <Input
              id="parcelas"
              type="number"
              min="1"
              step="1"
              value={parcelas}
              onChange={(e) => setParcelas(e.target.value)}
            />
          </div>
        ) : null}
        <div className="sm:col-span-5 lg:col-span-7">
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
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {lancamentos.data?.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="block font-medium">{l.descricao}</span>
                <span className="block text-xs text-muted-foreground">
                  {dataCurta(l.data)} · {FORMAS_PAGAMENTO[l.forma_pagamento] ?? l.forma_pagamento}
                  {l.forma_pagamento === "cartao" && l.parcelas && l.parcelas > 1
                    ? ` em ${l.parcelas}x`
                    : ""}
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
    </AppShell>
  );
}

function Resumo({ rotulo, valor, classe }: { rotulo: string; valor: string; classe: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`font-display text-2xl font-extrabold ${classe}`}>{valor}</p>
    </div>
  );
}
