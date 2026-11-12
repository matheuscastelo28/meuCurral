import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/local-db";
import { dataCurta, pesoTexto } from "@/lib/formato";
import { intervaloMedio, montarNascimentos, type AnimalNascimento } from "@/lib/nascimentos";
import type { RegistroRepro } from "@/lib/reproducao";

type Femea = { id: string; nome: string | null; brinco?: string | null };

/**
 * Bloco "Partos" da ficha de uma vaca ou ovelha: cada parto com data, sexo e
 * peso da cria, e o intervalo desde o parto anterior. Usa a mesma base da
 * aba de Nascimentos (lib/nascimentos).
 */
export function BlocoPartos({
  femea,
  fazendaId,
  unidadePeso,
}: {
  femea: Femea;
  fazendaId: string | undefined;
  unidadePeso: string;
}) {
  const partos = useQuery({
    queryKey: ["ficha-partos", femea.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("reproducao")
        .select("id, animal_id, tipo, data, created_at")
        .eq("animal_id", femea.id)
        .eq("tipo", "parto")
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RegistroRepro[];
    },
  });

  const crias = useQuery({
    queryKey: ["ficha-crias", femea.id, (partos.data ?? []).map((p) => p.id).join(",")],
    enabled: !!fazendaId && partos.isSuccess && (partos.data?.length ?? 0) > 0,
    queryFn: async () => {
      const colunas = "id, nome, brinco, sexo, raca, mae, nascimento, peso_nascimento, parto_id";
      const ids = (partos.data ?? []).map((p) => p.id).filter(Boolean) as string[];
      const [porVinculo, porMae] = await Promise.all([
        db.from("animais").select(colunas).eq("fazenda_id", fazendaId!).in("parto_id", ids),
        femea.nome
          ? db.from("animais").select(colunas).eq("fazenda_id", fazendaId!).eq("mae", femea.nome)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (porVinculo.error) throw porVinculo.error;
      if (porMae.error) throw porMae.error;
      const mapa = new Map<string, AnimalNascimento>();
      for (const a of [...(porVinculo.data ?? []), ...(porMae.data ?? [])]) {
        mapa.set(String(a.id), a as unknown as AnimalNascimento);
      }
      return [...mapa.values()];
    },
  });

  const nascimentos = montarNascimentos(partos.data ?? [], [femea], crias.data ?? []);
  const medio = intervaloMedio(nascimentos);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Partos</h2>
        {nascimentos.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {nascimentos.length} {nascimentos.length === 1 ? "parto" : "partos"}
            {medio ? ` · intervalo médio ${medio} dias` : ""}
          </p>
        ) : null}
      </div>

      {partos.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Carregando...</p>
      ) : nascimentos.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum parto registrado.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {nascimentos.map((n) => (
            <li key={n.partoId ?? n.data} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{dataCurta(n.data)}</span>
                <span className="text-xs text-muted-foreground">
                  {n.intervaloDias != null
                    ? `${n.intervaloDias} dias desde o parto anterior`
                    : "Primeiro parto"}
                </span>
              </div>
              {n.crias.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Cria não cadastrada no rebanho.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {n.crias.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                      <Link
                        to="/rebanho/$animalId"
                        params={{ animalId: c.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.nome}
                      </Link>
                      <span className="text-muted-foreground">
                        {c.sexo === "macho"
                          ? "Macho"
                          : c.sexo === "femea"
                            ? "Fêmea"
                            : "Sexo não informado"}
                        {" · "}
                        {c.pesoKg != null ? pesoTexto(c.pesoKg, unidadePeso) : "sem peso ao nascer"}
                        {c.raca ? ` · ${c.raca}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
