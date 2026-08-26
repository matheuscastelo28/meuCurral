import { createFileRoute, redirect } from "@tanstack/react-router";

// A comparação de planos com preços agora vive só na página inicial pública.
export const Route = createFileRoute("/_authenticated/planos")({
  beforeLoad: () => {
    throw redirect({ to: "/config" });
  },
});
