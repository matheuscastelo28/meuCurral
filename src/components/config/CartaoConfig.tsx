import type { ReactNode } from "react";

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
  return (
    <section
      id={id}
      className={
        tom === "atencao"
          ? "scroll-mt-24 rounded-xl border border-destructive/30 bg-card p-5"
          : "scroll-mt-24 rounded-xl border border-border bg-card p-5"
      }
    >
      <h2 className="text-base font-semibold">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
