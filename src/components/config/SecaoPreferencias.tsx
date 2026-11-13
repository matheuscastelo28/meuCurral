import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePerfil, useSalvarPerfil, PREFERENCIAS_PADRAO } from "@/hooks/use-preferencias";
import { useFazenda } from "@/hooks/use-fazenda";
import { CartaoConfig } from "./CartaoConfig";

export function SecaoPreferencias() {
  const { data: perfil } = usePerfil();
  const { data: fazenda } = useFazenda();
  // Arroba é unidade de boi — some do seletor quando a fazenda é só de
  // ovinos (ali o peso é sempre em kg).
  const soOvino =
    !!fazenda?.atividades?.includes("ovino") && !fazenda.atividades.includes("bovino");
  const salvar = useSalvarPerfil();
  const [valores, setValores] = useState(PREFERENCIAS_PADRAO);

  useEffect(() => {
    if (!perfil) return;
    setValores({
      unidade_peso: soOvino ? "kg" : (perfil.unidade_peso ?? "kg"),
      moeda: perfil.moeda ?? "BRL",
      inicio_semana: perfil.inicio_semana ?? 0,
      alerta_vacina: perfil.alerta_vacina ?? true,
      alerta_pesagem: perfil.alerta_pesagem ?? true,
      alerta_parto: perfil.alerta_parto ?? true,
      estagio_automatico: perfil.estagio_automatico ?? true,
    });
  }, [perfil, soOvino]);

  const alertas = [
    { chave: "alerta_vacina", rotulo: "Vacinação e vermifugação" },
    { chave: "alerta_pesagem", rotulo: "Pesagem" },
    { chave: "alerta_parto", rotulo: "Previsão de parto e secagem" },
  ] as const;

  return (
    <CartaoConfig id="preferencias" titulo="Preferências">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate(valores, {
            onSuccess: () => toast.success("Preferências salvas."),
            onError: () => toast.error("Não conseguimos salvar as preferências agora."),
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="pref-peso">Unidade de peso</Label>
            <select
              id="pref-peso"
              value={valores.unidade_peso}
              onChange={(e) => setValores((v) => ({ ...v, unidade_peso: e.target.value }))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="kg">Quilos (kg)</option>
              {soOvino ? null : <option value="arroba">Arroba (@)</option>}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pref-moeda">Moeda</Label>
            <select
              id="pref-moeda"
              value={valores.moeda}
              onChange={(e) => setValores((v) => ({ ...v, moeda: e.target.value }))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="BRL">Real (R$)</option>
              <option value="USD">Dólar (US$)</option>
              <option value="EUR">Euro (€)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pref-semana">Semana começa em</Label>
            <select
              id="pref-semana"
              value={String(valores.inicio_semana)}
              onChange={(e) => setValores((v) => ({ ...v, inicio_semana: Number(e.target.value) }))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="0">Domingo</option>
              <option value="1">Segunda-feira</option>
            </select>
          </div>
        </div>

        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Avisos no início e no calendário</legend>
          <div className="space-y-3">
            {alertas.map((a) => (
              <div key={a.chave} className="flex items-center justify-between gap-3">
                <Label htmlFor={a.chave} className="font-normal">
                  {a.rotulo}
                </Label>
                <Switch
                  id={a.chave}
                  checked={valores[a.chave]}
                  onCheckedChange={(v) => setValores((atual) => ({ ...atual, [a.chave]: v }))}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
          <Label htmlFor="estagio_automatico" className="font-normal">
            Atualizar a categoria pela idade
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Bezerro → novilha/garrote → vaca/boi; cordeiro → borrega/borrego → ovelha.
            </span>
          </Label>
          <Switch
            id="estagio_automatico"
            checked={valores.estagio_automatico}
            onCheckedChange={(v) => setValores((atual) => ({ ...atual, estagio_automatico: v }))}
          />
        </div>

        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Salvar preferências
        </Button>
      </form>
    </CartaoConfig>
  );
}
