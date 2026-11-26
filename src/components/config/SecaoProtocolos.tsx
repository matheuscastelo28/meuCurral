import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/local-db";
import { useFazenda } from "@/hooks/use-fazenda";
import { useValidacoesProtocolos } from "@/hooks/use-validacoes-protocolos";
import { PROTOCOLOS, situacaoDaValidacao, textoValidacao } from "@/lib/protocolos-sanitarios";
import { CartaoConfig } from "./CartaoConfig";

export function SecaoProtocolos() {
  const queryClient = useQueryClient();
  const { data: fazenda } = useFazenda();
  const { data } = useValidacoesProtocolos();
  const ehVet = data?.papel === "veterinario";
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  async function enviar(protocoloId: string, status: "validado" | "ajustar" | "limpar") {
    if (!fazenda) return;
    setSalvando(protocoloId);
    const { error } = await db.protocolos.validar({
      fazendaId: fazenda.id,
      protocoloId,
      status,
      nota: status === "ajustar" ? nota : null,
    });
    setSalvando(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAjustando(null);
    setNota("");
    toast.success(status === "limpar" ? "Revisão removida." : "Revisão salva.");
    queryClient.invalidateQueries({ queryKey: ["validacoes-protocolos"] });
  }

  const validacoes = data?.validacoes ?? [];
  const validados = PROTOCOLOS.filter(
    (p) => situacaoDaValidacao(p, validacoes).tipo === "validado",
  ).length;

  return (
    <CartaoConfig id="protocolos" titulo="Protocolos de vacinação">
      <p className="mb-3 text-sm text-muted-foreground">
        A tabela que sugere as vacinas é um rascunho técnico: não é receita. O veterinário vinculado
        à fazenda revisa cada protocolo aqui.{" "}
        <strong className="text-foreground">
          {validados} de {PROTOCOLOS.length} validados.
        </strong>
        {ehVet
          ? null
          : " Convide o seu veterinário em Equipe e veterinário (a partir do plano Caderno) para revisar."}
      </p>
      <ul className="space-y-2">
        {PROTOCOLOS.map((p) => {
          const s = situacaoDaValidacao(p, validacoes);
          return (
            <li key={p.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">
                {p.vacina}{" "}
                <span className="font-normal text-muted-foreground">
                  · {p.especie === "bovino" ? "bovinos" : "ovinos"}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.nota}</p>
              <p
                className={
                  s.tipo === "validado"
                    ? "mt-1 flex items-center gap-1 text-xs font-medium text-primary"
                    : s.tipo === "ajustar"
                      ? "mt-1 flex items-center gap-1 text-xs font-medium text-warning"
                      : "mt-1 text-xs text-muted-foreground"
                }
              >
                {s.tipo === "validado" ? <Check className="size-3.5" aria-hidden="true" /> : null}
                {s.tipo === "ajustar" ? (
                  <MessageSquareWarning className="size-3.5" aria-hidden="true" />
                ) : null}
                {textoValidacao(s)}
              </p>
              {s.tipo === "ajustar" && s.nota ? (
                <p className="mt-1 text-xs text-muted-foreground">“{s.nota}”</p>
              ) : null}
              {ehVet ? (
                ajustando === p.id ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      placeholder="O que ajustar (idade, dose, intervalo…)"
                      rows={2}
                      aria-label="O que ajustar"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={salvando === p.id}
                        onClick={() => enviar(p.id, "ajustar")}
                      >
                        Enviar pedido
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAjustando(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={salvando === p.id || s.tipo === "validado"}
                      onClick={() => enviar(p.id, "validado")}
                    >
                      {salvando === p.id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Validar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAjustando(p.id);
                        setNota(s.tipo === "ajustar" ? (s.nota ?? "") : "");
                      }}
                    >
                      Pedir ajuste
                    </Button>
                    {s.tipo !== "pendente" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => enviar(p.id, "limpar")}
                      >
                        Limpar revisão
                      </Button>
                    ) : null}
                  </div>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </CartaoConfig>
  );
}
