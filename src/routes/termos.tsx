import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de uso — Meu Curral Digital" },
      { name: "description", content: "Condições de uso da plataforma Meu Curral Digital." },
      { property: "og:title", content: "Termos de uso — Meu Curral Digital" },
      { property: "og:description", content: "Condições de uso da plataforma Meu Curral Digital." },
    ],
  }),
  component: Termos,
});

function Termos() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Voltar
      </Link>
      <h1 className="mt-6 text-3xl">Termos de uso</h1>
      <div className="mt-6 space-y-4 text-sm text-muted-foreground">
        <p>
          O Meu Curral Digital é um sistema de gestão de rebanho. Ao criar uma conta, você concorda
          em usar a plataforma apenas para registrar informações da sua atividade rural.
        </p>
        <h2 className="text-base font-semibold text-foreground">Conta e responsabilidade</h2>
        <p>
          Você é responsável por manter a senha em sigilo e pelas informações cadastradas. Cada
          fazenda acessa somente os próprios dados.
        </p>
        <h2 className="text-base font-semibold text-foreground">Planos e cancelamento</h2>
        <p>
          O plano grátis não expira. Nos planos pagos, o cancelamento pode ser feito a qualquer
          momento, sem multa, e o acesso permanece até o fim do período já pago.
        </p>
        <h2 className="text-base font-semibold text-foreground">Disponibilidade</h2>
        <p>
          Trabalhamos para manter o serviço no ar, mas ele pode passar por manutenções. Recomendamos
          exportar seus dados periodicamente em Configurações.
        </p>
      </div>
    </div>
  );
}
