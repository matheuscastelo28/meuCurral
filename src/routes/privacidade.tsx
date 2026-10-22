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
      <p className="mt-2 text-xs text-muted-foreground">Última atualização: outubro de 2026.</p>
      <div className="mt-6 space-y-4 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Dados que coletamos</h2>
        <p>
          Coletamos nome e e-mail para identificar sua conta, e as informações que você cadastra
          sobre a fazenda, os animais, o manejo, a produção e o financeiro. Não coletamos CPF nem
          outros documentos pessoais. Se isso mudar, atualizaremos esta política informando quais
          dados passam a ser coletados, para qual finalidade e com quem são compartilhados.
        </p>

        <h2 className="text-base font-semibold text-foreground">Para que usamos</h2>
        <p>
          Usamos seus dados para criar e manter sua conta, operar as funções do sistema (cadastro de
          animais, manejo, produção, financeiro, agenda), enviar e-mails do próprio serviço
          (verificação de conta, avisos) e dar suporte quando você entra em contato. A base legal é
          a execução do contrato de uso da plataforma.
        </p>

        <h2 className="text-base font-semibold text-foreground">Com quem compartilhamos</h2>
        <p>
          Não vendemos nem compartilhamos informações da sua fazenda com terceiros para publicidade.
          Compartilhamos dados apenas com prestadores que ajudam a operar o serviço — como
          hospedagem e envio de e-mail — e somente na medida necessária para isso.
        </p>

        <h2 className="text-base font-semibold text-foreground">Por quanto tempo guardamos</h2>
        <p>
          Seus dados ficam armazenados enquanto sua conta existir. Ao excluir a conta, os registros
          vinculados à sua fazenda são removidos em um prazo razoável, exceto o que formos obrigados
          a manter por lei.
        </p>

        <h2 className="text-base font-semibold text-foreground">Segurança</h2>
        <p>
          O acesso é feito por conexão segura e as regras de isolamento por fazenda são aplicadas no
          próprio banco de dados, não apenas na tela.
        </p>

        <h2 className="text-base font-semibold text-foreground">Cookies</h2>
        <p>
          Usamos apenas cookies técnicos, necessários para manter você conectado. Não usamos cookies
          de rastreamento publicitário.
        </p>

        <h2 className="text-base font-semibold text-foreground">Seus direitos (LGPD)</h2>
        <p>
          Você pode acessar, corrigir, exportar ou excluir seus dados a qualquer momento, em
          Configurações. A exclusão remove os registros vinculados à sua fazenda. Para qualquer
          outra solicitação sobre seus dados, fale com a gente pelo contato abaixo.
        </p>

        <h2 className="text-base font-semibold text-foreground">Alterações nesta política</h2>
        <p>
          Podemos atualizar esta política para refletir mudanças no produto ou na legislação.
          Alterações relevantes são avisadas por e-mail ou dentro do próprio sistema.
        </p>

        <h2 className="text-base font-semibold text-foreground">Contato</h2>
        <p>
          Dúvidas sobre esta política ou sobre seus dados:{" "}
          <a
            href="mailto:contato@curralonline.com"
            className="text-primary underline underline-offset-4"
          >
            contato@curralonline.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
