import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { useRegrasSanitarias } from "@/hooks/use-regras-sanitarias";
import { normalizar, REGRAS_PADRAO, textoIntervalo, type RegraSanitaria } from "@/lib/sanidade";

type Linha = RegraSanitaria & { id?: string };

const TIPOS = [
  { valor: "", rotulo: "Qualquer tipo" },
  { valor: "vacina", rotulo: "Vacina" },
  { valor: "vermifugo", rotulo: "Vermífugo" },
  { valor: "tratamento", rotulo: "Tratamento" },
  { valor: "outro", rotulo: "Outro manejo" },
];

/**
 * Intervalos de reforço e de manejo periódico. Mostra os padrões (raiva,
 * clostridioses, aftosa, vermífugo) e as regras da fazenda; mudar um padrão
 * cria uma regra da fazenda por cima, e "Voltar ao padrão" apaga ela.
 */
export function RegrasSanitarias() {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const regras = useRegrasSanitarias();
  const daFazenda = regras.data ?? [];

  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [unidade, setUnidade] = useState<"dias" | "meses">("dias");
  const [novoProduto, setNovoProduto] = useState("");
  const [novoTipo, setNovoTipo] = useState("");

  function paraDias() {
    const n = Math.floor(Number(valor));
    return unidade === "meses" ? n * 30 : n;
  }

  const salvar = useMutation({
    mutationFn: async (alvo: {
      chave: string;
      regra: Linha | null;
      produto: string;
      tipo: string | null;
    }) => {
      const dias = paraDias();
      if (!Number.isFinite(dias) || dias < 0) throw new Error("Informe um intervalo válido.");
      if (alvo.regra?.id) {
        const { error } = await db
          .from("regras_sanitarias")
          .update({ intervalo_dias: dias } as never)
          .eq("id", alvo.regra.id);
        if (error) throw new Error(error.message);
      } else {
        if (!alvo.produto.trim() && !alvo.tipo) throw new Error("Informe o produto ou o tipo.");
        const { error } = await db.from("regras_sanitarias").insert({
          fazenda_id: fazenda!.id,
          produto: alvo.produto.trim(),
          tipo: alvo.tipo,
          intervalo_dias: dias,
        } as never);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Intervalo salvo.");
      setEditando(null);
      setValor("");
      setNovoProduto("");
      setNovoTipo("");
      queryClient.invalidateQueries({ queryKey: ["regras-sanitarias"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não conseguimos salvar agora."),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("regras_sanitarias").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regras-sanitarias"] });
    },
    onError: () => toast.error("Não conseguimos remover agora."),
  });

  const chaveDe = (r: RegraSanitaria) => `${normalizar(r.produto)}|${r.tipo ?? ""}`;
  const padraoPorChave = new Map(REGRAS_PADRAO.map((r) => [chaveDe(r), r]));
  const sobrescritas = new Map(daFazenda.map((r) => [chaveDe(r), r]));

  const linhas: {
    chave: string;
    rotulo: string;
    regra: Linha | null;
    padrao: boolean;
    dias: number;
  }[] = [
    ...REGRAS_PADRAO.map((p) => {
      const o = sobrescritas.get(chaveDe(p)) ?? null;
      return {
        chave: chaveDe(p),
        rotulo: p.rotulo,
        regra: o,
        padrao: true,
        dias: o ? o.intervalo_dias : p.intervalo_dias,
      };
    }),
    ...daFazenda
      .filter((r) => !padraoPorChave.has(chaveDe(r)))
      .map((r) => ({
        chave: chaveDe(r),
        rotulo: r.produto
          ? `${r.produto}${r.tipo ? ` (${TIPOS.find((t) => t.valor === r.tipo)?.rotulo ?? r.tipo})` : ""}`
          : (TIPOS.find((t) => t.valor === r.tipo)?.rotulo ?? "Qualquer"),
        regra: r as Linha,
        padrao: false,
        dias: r.intervalo_dias,
      })),
  ];

  const campo = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {linhas.map((l) => (
          <li key={l.chave} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{l.rotulo}</p>
                <p className="text-xs text-muted-foreground">
                  {l.dias > 0
                    ? `Repetir a cada ${textoIntervalo(l.dias)}`
                    : "Sem lembrete automático"}
                  {l.padrao ? (l.regra ? " · alterado" : " · padrão") : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditando(l.chave);
                    setValor(
                      l.dias % 30 === 0 && l.dias >= 60 ? String(l.dias / 30) : String(l.dias),
                    );
                    setUnidade(l.dias % 30 === 0 && l.dias >= 60 ? "meses" : "dias");
                  }}
                >
                  Alterar
                </Button>
                {l.regra?.id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => apagar.mutate(l.regra!.id!)}
                  >
                    {l.padrao ? "Voltar ao padrão" : "Remover"}
                  </Button>
                ) : null}
              </div>
            </div>
            {editando === l.chave ? (
              <form
                className="mt-2 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = padraoPorChave.get(l.chave);
                  salvar.mutate({
                    chave: l.chave,
                    regra: l.regra,
                    produto: l.regra?.produto ?? p?.produto ?? "",
                    tipo: l.regra ? l.regra.tipo : (p?.tipo ?? null),
                  });
                }}
              >
                <div className="w-24 space-y-1">
                  <Label htmlFor={`int-${l.chave}`}>A cada</Label>
                  <Input
                    id={`int-${l.chave}`}
                    type="number"
                    min="0"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Unidade"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value as "dias" | "meses")}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="dias">dias</option>
                  <option value="meses">meses</option>
                </select>
                <Button type="submit" size="sm" disabled={salvar.isPending}>
                  Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  Use 0 para não criar lembrete.
                </p>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      <form
        className="space-y-3 rounded-lg border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate({
            chave: "novo",
            regra: null,
            produto: novoProduto,
            tipo: novoTipo || null,
          });
        }}
      >
        <p className="text-sm font-semibold">Nova regra</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reg-produto">Produto (parte do nome)</Label>
            <Input
              id="reg-produto"
              value={novoProduto}
              onChange={(e) => setNovoProduto(e.target.value)}
              placeholder="Ex: Leptospirose"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-tipo">Tipo</Label>
            <select
              id="reg-tipo"
              value={novoTipo}
              onChange={(e) => setNovoTipo(e.target.value)}
              className={campo}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24 space-y-1">
            <Label htmlFor="reg-valor">A cada</Label>
            <Input
              id="reg-valor"
              type="number"
              min="0"
              value={editando === null ? valor : ""}
              onChange={(e) => {
                setEditando(null);
                setValor(e.target.value);
              }}
              required
            />
          </div>
          <select
            aria-label="Unidade da nova regra"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value as "dias" | "meses")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="dias">dias</option>
            <option value="meses">meses</option>
          </select>
          <Button type="submit" disabled={salvar.isPending}>
            Adicionar regra
          </Button>
        </div>
      </form>
    </div>
  );
}
