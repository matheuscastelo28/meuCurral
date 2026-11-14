import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import {
  lerFazendaAtual,
  CHAVE_FAZENDA_ATUAL,
  useFazenda,
  useMinhasFazendas,
} from "@/hooks/use-fazenda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataCurta } from "@/lib/formato";
import { CartaoConfig } from "./CartaoConfig";

const PAPEL: Record<string, string> = { veterinario: "Veterinário", colaborador: "Colaborador" };

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Link copiado.");
  } catch {
    toast.message(texto);
  }
}

/** Dono: convida veterinário/colaborador e gerencia quem acessa a fazenda. */
export function SecaoEquipe() {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("veterinario");

  const equipe = useQuery({
    queryKey: ["equipe", fazenda?.id],
    enabled: !!fazenda?.id && fazenda.souDono,
    queryFn: async () => {
      const { data, error } = await db.equipe.listar(fazenda!.id);
      if (error) throw new Error(error.message);
      return data!;
    },
  });

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["equipe"] });

  const convidar = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.equipe.convidar({
        fazendaId: fazenda!.id,
        email,
        papel,
      });
      if (error) throw new Error(error.message);
      return data!;
    },
    onSuccess: (r) => {
      toast.success(
        r.emailEnviado
          ? "Convite enviado por e-mail."
          : "Convite criado. Copie o link abaixo e mande para a pessoa.",
      );
      setEmail("");
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async (conviteId: string) => {
      const { error } = await db.equipe.cancelarConvite({ fazendaId: fazenda!.id, conviteId });
      if (error) throw new Error(error.message);
    },
    onSuccess: atualizar,
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (membroId: string) => {
      const { error } = await db.equipe.remover({ fazendaId: fazenda!.id, membroId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Acesso removido.");
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!fazenda?.souDono) return null;
  const d = equipe.data;
  const lim = d?.limites;

  return (
    <CartaoConfig id="equipe" titulo="Equipe e veterinário">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          convidar.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="convite-email">E-mail de quem vai acessar</Label>
          <Input
            id="convite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="convite-papel">Como</Label>
          <select
            id="convite-papel"
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="veterinario">Veterinário</option>
            <option value="colaborador">Colaborador</option>
          </select>
        </div>
        <Button type="submit" disabled={convidar.isPending}>
          <UserPlus className="size-4" aria-hidden="true" />
          {convidar.isPending ? "Convidando..." : "Convidar"}
        </Button>
      </form>
      {lim ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Veterinários: {lim.veterinarios.usados} de {lim.veterinarios.max} · Colaboradores:{" "}
          {lim.colaboradores.usados} de{" "}
          {lim.colaboradores.max === null ? "sem limite" : lim.colaboradores.max} (plano {d?.plano})
        </p>
      ) : null}

      {d && (d.membros.length > 0 || d.convites.length > 0) ? (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {d.membros.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{m.nome || m.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {PAPEL[m.papel] ?? m.papel} · {m.email} · desde {dataCurta(m.desde)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={remover.isPending}
                onClick={() => remover.mutate(m.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Remover
              </Button>
            </li>
          ))}
          {d.convites.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {c.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {PAPEL[c.papel] ?? c.papel} · convite pendente desde {dataCurta(c.criado)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => copiar(c.link)}>
                  <Copy className="size-4" aria-hidden="true" />
                  Copiar link
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={cancelar.isPending}
                  onClick={() => cancelar.mutate(c.id)}
                >
                  Cancelar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </CartaoConfig>
  );
}

/** Membro: mostra com que papel acessa a fazenda e permite sair dela. */
export function SecaoAcessoCompartilhado() {
  const { data: fazenda } = useFazenda();
  const { data: lista } = useMinhasFazendas();
  const sair = useMutation({
    mutationFn: async () => {
      const { error } = await db.equipe.remover({ fazendaId: fazenda!.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Você saiu da fazenda.");
      try {
        if (lerFazendaAtual() === fazenda?.id) localStorage.removeItem(CHAVE_FAZENDA_ATUAL);
      } catch {
        // nada a limpar
      }
      window.location.assign("/inicio");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!fazenda || fazenda.souDono) return null;
  const minha = lista?.find((f) => f.id === fazenda.id);
  return (
    <CartaoConfig id="fazenda" titulo="Fazenda compartilhada">
      <p className="text-sm">
        Você acessa <strong>{fazenda.nome}</strong> como{" "}
        {minha?.papel === "veterinario" ? "veterinário" : "colaborador"}
        {minha?.dono_nome ? `, a convite de ${minha.dono_nome}` : ""}. Os dados, o plano e as
        configurações da fazenda são do dono.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3"
        disabled={sair.isPending}
        onClick={() => sair.mutate()}
      >
        Sair desta fazenda
      </Button>
    </CartaoConfig>
  );
}
