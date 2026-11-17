import { useEffect, useState } from "react";
import { ExternalLink, Megaphone, X } from "lucide-react";
import { useAvisosOficiais } from "@/hooks/use-avisos-oficiais";

const CHAVE = "mcd:avisos-dispensados";

function lerDispensados(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Faixa com os avisos oficiais do estado, no topo do Início. Dá para dispensar cada um. */
export function FaixaAvisos() {
  const { data } = useAvisosOficiais();
  const [dispensados, setDispensados] = useState<string[]>([]);
  useEffect(() => setDispensados(lerDispensados()), []);

  const visiveis = (data ?? []).filter((a) => !dispensados.includes(a.id));
  if (visiveis.length === 0) return null;

  function dispensar(id: string) {
    const novos = [...dispensados, id];
    setDispensados(novos);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(novos.slice(-50)));
    } catch {
      // sem armazenamento: some só até recarregar
    }
  }

  return (
    <div className="mb-5 space-y-2" role="region" aria-label="Avisos oficiais">
      {visiveis.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3"
        >
          <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{a.titulo}</p>
            <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{a.texto}</p>
            {a.link ? (
              <a
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
              >
                Saiba mais
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dispensar(a.id)}
            aria-label={`Dispensar aviso: ${a.titulo}`}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
