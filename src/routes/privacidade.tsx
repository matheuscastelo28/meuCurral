import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de privacidade — Curral Online" },
      {
        name: "description",
        content: "Como o Curral Online trata os dados do produtor rural, conforme a LGPD.",
      },
      { property: "og:title", content: "Política de privacidade — Curral Online" },
      {
        property: "og:description",
        content: "Como tratamos e protegemos os dados da sua fazenda.",
      },
    ],
  }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Voltar
      </Link>
      <h1 className="mt-6 text-3xl">Política de privacidade</h1>
      <div className="mt-6 space-y-4 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Dados que coletamos</h2>
        <p>
          Coletamos nome, e-mail e as informações que você cadastra sobre a fazenda, os animais, o
          manejo, a produção e o financeiro.
        </p>
        <h2 className="text-base font-semibold text-foreground">Como usamos</h2>
        <p>
          Os dados são usados apenas para operar o sistema para você. Não vendemos nem compartilhamos
          informações da sua fazenda com terceiros para publicidade.
        </p>
        <h2 className="text-base font-semibold text-foreground">Segurança</h2>
        <p>
          O acesso é feito por conexão segura e as regras de isolamento por fazenda são aplicadas no
          próprio banco de dados, não apenas na tela.
        </p>
        <h2 className="text-base font-semibold text-foreground">Seus direitos (LGPD)</h2>
        <p>
          Você pode exportar seus dados ou excluir sua conta a qualquer momento, em Configurações. A
          exclusão remove os registros vinculados à sua fazenda.
        </p>
      </div>
    </div>
  );
}
