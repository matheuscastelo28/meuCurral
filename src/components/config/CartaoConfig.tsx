import { useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CartoesRecolhiveis } from "./cartoes-recolhiveis";

export function CartaoConfig({
  id,
  titulo,
  children,
  tom = "normal",
}: {
  id: string;
  titulo: string;
  children: ReactNode;
  tom?: "normal" | "atencao";
}) {
  const recolhivel = useContext(CartoesRecolhiveis);
  const [aberto, setAberto] = useState(false);

  // Link direto para a seção (ex.: /config#plano) já abre ela.
  useEffect(() => {
    if (!recolhivel) return;
    const abrirSeHash = () => {
      if (window.location.hash === `#${id}`) setAberto(true);
    };
    abrirSeHash();
    window.addEventListener("hashchange", abrirSeHash);
    return () => window.removeEventListener("hashchange", abrirSeHash);
  }, [recolhivel, id]);

  const borda = tom === "atencao" ? "border-destructive/30" : "border-border";

  if (!recolhivel) {
    return (
      <section id={id} className={cn("scroll-mt-24 rounded-xl border bg-card p-5", borda)}>
        <h2 className="text-base font-semibold">{titulo}</h2>
        <div className="mt-4">{children}</div>
      </section>
    );
  }

  return (
    <section id={id} className={cn("scroll-mt-24 rounded-xl border bg-card", borda)}>
      <h2>
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={`${id}-conteudo`}
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left text-base font-semibold transicao-suave hover:bg-accent/50"
        >
          {titulo}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              aberto && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </h2>
      {/* Fica montado mesmo fechado: seções como Plano conferem a assinatura sozinhas. */}
      <div id={`${id}-conteudo`} hidden={!aberto} className="px-5 pb-5">
        {children}
      </div>
    </section>
  );
}
