import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
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
import { hojeISO } from "@/lib/formato";
import { especieDoAnimal } from "@/lib/especies";

const FORMAS_PAGAMENTO = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "transferencia", rotulo: "Transferência" },
] as const;

export type AnimalParaVenda = {
  id: string;
  nome: string;
  brinco?: string | null;
  categoria?: string | null;
  especie?: string | null;
  peso_kg?: string | number | null;
};

/**
 * Venda de um animal de qualquer situação: entra como receita no Financeiro
 * ("Venda de bovinos/ovinos") e o animal vai pra Saídas como vendido.
 */
export function DialogVenderAnimal({
  animal,
  fazendaId,
  onFechar,
  moeda,
}: {
  animal: AnimalParaVenda | null;
  fazendaId: string | undefined;
  onFechar: () => void;
  moeda: (v: number | null | undefined) => string;
}) {
  const queryClient = useQueryClient();
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [peso, setPeso] = useState("");
  const [comprador, setComprador] = useState("");
  const [pago, setPago] = useState(true);
  const [forma, setForma] = useState("dinheiro");
  const [parcelas, setParcelas] = useState("1");

  useEffect(() => {
    if (!animal) return;
    setValor("");
    setData(hojeISO());
    setPeso(animal.peso_kg ? String(animal.peso_kg) : "");
    setComprador("");
    setPago(true);
    setForma("dinheiro");
    setParcelas("1");
  }, [animal]);

  const especie = animal ? especieDoAnimal(animal) : "bovino";

  const vender = useMutation({
    mutationFn: async () => {
      if (!animal || !fazendaId) return;
      const { error } = await db.rebanho.venderAnimal({
        fazendaId,
        animalId: animal.id,
        valorTotal: Number(valor),
        data,
        comprador: comprador.trim() || null,
        pago,
        formaPagamento: forma,
        parcelas: pago && forma === "cartao" ? Number(parcelas) || 1 : null,
        pesoKg: peso ? Number(peso) : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`Venda de ${animal?.nome ?? "animal"} registrada.`);
      for (const chave of [
        "animais",
        "animais-contagem",
        "animal-ficha",
        "ficha-vendas",
        "ficha-manejos",
        "financeiro",
        "inicio-resumo",
        "animais-engorda",
        "indices-rebanho",
        "relatorio",
      ]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message || "Não conseguimos registrar a venda."),
  });

  const campoSelect = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <Dialog open={!!animal} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Vender {animal?.nome}
            {animal?.brinco ? ` (${animal.brinco})` : ""}
          </DialogTitle>
          <DialogDescription>
            Entra no Financeiro como "Venda de {especie === "ovino" ? "ovinos" : "bovinos"}" e o
            animal vai para Saídas.
          </DialogDescription>
        </DialogHeader>
        <form
          id="form-vender-animal"
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            vender.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="venda-valor">Valor da venda (R$)</Label>
            <Input
              id="venda-valor"
              type="number"
              step="0.01"
              min="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="venda-data">Data</Label>
            <Input
              id="venda-data"
              type="date"
              value={data}
              max={hojeISO()}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="venda-peso">Peso na venda (kg)</Label>
            <Input
              id="venda-peso"
              type="number"
              step="0.1"
              min="0"
              value={peso}
              placeholder="Opcional"
              onChange={(e) => setPeso(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="venda-comprador">Comprador</Label>
            <Input
              id="venda-comprador"
              value={comprador}
              placeholder="Opcional"
              onChange={(e) => setComprador(e.target.value)}
            />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pago}
              onChange={(e) => setPago(e.target.checked)}
              className="size-4"
            />
            Já recebi o pagamento
          </label>
          {pago ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="venda-forma">Forma de pagamento</Label>
                <select
                  id="venda-forma"
                  value={forma}
                  onChange={(e) => setForma(e.target.value)}
                  className={campoSelect}
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              {forma === "cartao" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="venda-parcelas">Parcelas</Label>
                  <Input
                    id="venda-parcelas"
                    type="number"
                    min="1"
                    max="12"
                    value={parcelas}
                    onChange={(e) => setParcelas(e.target.value)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <p className="col-span-2 text-xs text-muted-foreground">
              Fica como "a receber" no Financeiro até você marcar como recebido.
            </p>
          )}
          {Number(valor) > 0 && Number(peso) > 0 ? (
            <p className="col-span-2 text-xs text-muted-foreground">
              {moeda(Number(valor) / Number(peso))} por kg vivo
              {especie === "bovino" ? ` · ${moeda(Number(valor) / (Number(peso) / 15))} por @` : ""}
              .
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-vender-animal" disabled={vender.isPending}>
            {vender.isPending ? "Registrando..." : "Registrar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
