import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFazenda } from "@/hooks/use-fazenda";
import { PRODUTOS_LEITE } from "@/lib/produtos-leite";
import { CartaoConfig } from "./CartaoConfig";

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

export function SecaoFazenda() {
  const { data: fazenda, isLoading } = useFazenda();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [produtos, setProdutos] = useState<string[]>(["leite"]);

  useEffect(() => {
    if (!fazenda) return;
    setNome(fazenda.nome ?? "");
    setCidade(fazenda.cidade ?? "");
    setEstado(fazenda.estado ?? "");
    setProdutos(fazenda.produtos_leite?.length ? fazenda.produtos_leite : ["leite"]);
  }, [fazenda]);

  function alternarProduto(valor: string) {
    if (valor === "leite") return;
    setProdutos((atual) =>
      atual.includes(valor) ? atual.filter((p) => p !== valor) : [...atual, valor],
    );
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("fazendas")
        .update({
          nome: nome.trim(),
          cidade: cidade.trim() || null,
          estado: estado || null,
          produtos_leite: produtos,
        } as never)
        .eq("id", fazenda!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados da fazenda salvos.");
      queryClient.invalidateQueries({ queryKey: ["fazenda"] });
    },
    onError: () =>
      toast.error("Não conseguimos salvar. Confira se você tem permissão para editar a fazenda."),
  });

  return (
    <CartaoConfig
      id="fazenda"
      titulo="Fazenda"
      descricao="O nome e o local aparecem no topo do sistema e nos relatórios."
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fazenda-nome">Nome da fazenda</Label>
          <Input
            id="fazenda-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fazenda-cidade">Cidade</Label>
          <Input
            id="fazenda-cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fazenda-estado">Estado</Label>
          <select
            id="fazenda-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Não informado</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="rounded-lg border border-border p-3 sm:col-span-2">
          <legend className="px-1 text-sm font-medium">Atividades de leite e derivados</legend>
          <p className="mb-3 text-xs text-muted-foreground">
            Escolha o que a fazenda produz. Só esses produtos aparecem para seleção na tela de
            Leite.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRODUTOS_LEITE.map((p) => (
              <label key={p.valor} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={produtos.includes(p.valor)}
                  onChange={() => alternarProduto(p.valor)}
                  disabled={p.valor === "leite"}
                  className="size-4 rounded border-input"
                />
                {p.rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={salvar.isPending || !fazenda}>
            {salvar.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Salvar fazenda
          </Button>
        </div>
      </form>
    </CartaoConfig>
  );
}
