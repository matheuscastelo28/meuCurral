import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de uso — Curral Online" },
      { name: "description", content: "Condições de uso da plataforma Curral Online." },
      { property: "og:title", content: "Termos de uso — Curral Online" },
      { property: "og:description", content: "Condições de uso da plataforma Curral Online." },
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
      <p className="mt-2 text-xs text-muted-foreground">Última atualização: outubro de 2026.</p>
      <div className="mt-6 space-y-4 text-sm text-muted-foreground">
        <p>
          O Curral Online é um sistema de gestão de rebanho: cadastro de animais, manejo, vacinação,
          pesagem, leite, confinamento, reprodução, financeiro e agenda da fazenda. Ao criar uma
          conta, você concorda com estes termos e se compromete a usar a plataforma apenas para
          registrar informações da sua atividade rural.
        </p>

        <h2 className="text-base font-semibold text-foreground">Cadastro e conta</h2>
        <p>
          Para usar o sistema você cria uma conta com nome, e-mail e senha. Você é responsável por
          manter a senha em sigilo, por tudo que acontece na sua conta e pela veracidade das
          informações cadastradas. Cada fazenda acessa somente os próprios dados — nunca os de outra
          conta.
        </p>

        <h2 className="text-base font-semibold text-foreground">Fase de testes</h2>
        <p>
          O Curral Online está em fase de validação. Isso significa que o produto pode mudar,
          apresentar instabilidades e que não garantimos resultado ou desempenho específico — como
          qualquer sistema em avaliação, use-o como apoio à sua gestão, não como fonte única de
          decisão. Quando essa fase terminar, avisaremos com antecedência sobre qualquer mudança nas
          condições de uso ou de cobrança.
        </p>

        <h2 className="text-base font-semibold text-foreground">Planos, cobrança e cancelamento</h2>
        <p>
          O plano grátis não expira e tem limite de cabeças cadastradas. Contas criadas antes de
          05/11/2026 mantêm acesso total, sem limite de cabeças. Nos planos pagos, a cobrança é
          recorrente conforme o período contratado (mensal ou anual) e o cancelamento pode ser feito
          a qualquer momento, sem multa — o acesso aos recursos do plano permanece até o fim do
          período já pago.
        </p>

        <h2 className="text-base font-semibold text-foreground">Uso aceitável</h2>
        <p>
          Não é permitido usar o sistema para fins ilegais, tentar acessar dados de outra fazenda,
          sobrecarregar a plataforma deliberadamente, nem copiar, descompilar ou tentar extrair o
          código-fonte do sistema.
        </p>

        <h2 className="text-base font-semibold text-foreground">Seus dados são seus</h2>
        <p>
          As informações que você cadastra sobre a sua fazenda — animais, manejo, produção e
          financeiro — pertencem a você. Pode exportá-las ou excluir sua conta a qualquer momento,
          em Configurações.
        </p>

        <h2 className="text-base font-semibold text-foreground">Propriedade intelectual</h2>
        <p>
          O software, a marca Curral Online e o design da plataforma são de nossa propriedade. Isso
          não inclui os dados que você cadastra, cobertos pelo item acima.
        </p>

        <h2 className="text-base font-semibold text-foreground">Disponibilidade e limites</h2>
        <p>
          Trabalhamos para manter o serviço no ar, mas ele pode passar por manutenções e, por estar
          em fase de testes, por instabilidades fora do previsto. Recomendamos exportar seus dados
          periodicamente em Configurações. O Curral Online é uma ferramenta de apoio à gestão; as
          decisões sobre o manejo e os negócios da fazenda continuam sendo suas.
        </p>

        <h2 className="text-base font-semibold text-foreground">Alterações nestes termos</h2>
        <p>
          Podemos atualizar estes termos para refletir mudanças no produto ou na legislação.
          Alterações relevantes são avisadas por e-mail ou dentro do próprio sistema.
        </p>

        <h2 className="text-base font-semibold text-foreground">Contato</h2>
        <p>
          Dúvidas sobre estes termos:{" "}
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
