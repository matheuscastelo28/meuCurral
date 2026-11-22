import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EMPRESA } from "@/lib/empresa";

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

const VERSAO = "2.0";
const ATUALIZACAO = "novembro de 2026";

function Titulo({ children }: { children: ReactNode }) {
  return <h2 className="pt-2 text-base font-semibold text-foreground">{children}</h2>;
}

function Email() {
  return (
    <a href={`mailto:${EMPRESA.contato}`} className="text-primary underline underline-offset-4">
      {EMPRESA.contato}
    </a>
  );
}

function LinkPolitica() {
  return (
    <Link to="/privacidade" className="text-primary underline underline-offset-4">
      Política de privacidade
    </Link>
  );
}

function Termos() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Voltar
      </Link>
      <h1 className="mt-6 text-3xl">Termos de uso</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Versão {VERSAO} · atualizada em {ATUALIZACAO}
      </p>
      <div className="mt-6 space-y-4 text-sm text-muted-foreground">
        <p>
          O Curral Online é um sistema de gestão de rebanho: cadastro de animais, manejo, vacinação,
          pesagem, leite, confinamento, reprodução, financeiro e agenda da fazenda. Ele é oferecido
          por {EMPRESA.razaoSocial}, CNPJ {EMPRESA.cnpj}, com sede em {EMPRESA.endereco}. Ao criar
          uma conta, você concorda com estes termos e com a <LinkPolitica />, que explica como
          tratamos os seus dados.
        </p>

        <Titulo>1. Cadastro e conta</Titulo>
        <p>
          A conta é para maiores de 18 anos ou pessoas legalmente capazes de contratar. Você cria a
          conta com nome, e-mail e senha e confirma o e-mail com um código. Você é responsável por
          manter a senha em sigilo, por tudo o que acontece na sua conta e pela veracidade das
          informações cadastradas. Se suspeitar de uso indevido, troque a senha e use “Sair de todos
          os aparelhos” em Configurações → Segurança.
        </p>

        <Titulo>2. Acesso compartilhado</Titulo>
        <p>
          O dono da fazenda pode convidar um veterinário ou colaboradores, dentro do limite do
          plano. Quem aceita o convite passa a ver e lançar dados da fazenda, e o sistema mostra
          quem lançou cada manejo e registro de reprodução. O dono escolhe quem convida, responde
          pelo uso que essas pessoas fazem da conta e pode remover o acesso a qualquer momento em
          Configurações → Equipe e veterinário. Cada fazenda acessa só os próprios dados, nunca os
          de outra conta.
        </p>

        <Titulo>3. Fase de testes</Titulo>
        <p>
          O Curral Online está em fase de validação. O produto pode mudar e apresentar
          instabilidades, e não garantimos resultado ou desempenho específico: use-o como apoio à
          sua gestão, não como fonte única de decisão. Quando essa fase terminar, avisaremos com
          antecedência sobre qualquer mudança nas condições de uso ou de cobrança.
        </p>

        <Titulo>4. Planos, cobrança e cancelamento</Titulo>
        <p>
          O plano Grátis não expira e tem limite de cabeças cadastradas. Contas criadas até
          13/11/2026 mantêm acesso total, sem os limites dos planos. Os planos pagos são contratados
          em Configurações → Plano e uso e cobrados pelo Mercado Pago, no cartão de crédito, de
          forma recorrente: todo mês no plano mensal ou uma vez por ano no plano anual, até você
          cancelar. Não recebemos nem guardamos o número do seu cartão.
        </p>
        <p>
          Você pode cancelar a qualquer momento em Configurações → Plano e uso, sem multa. O
          cancelamento interrompe as próximas cobranças, e você continua usando o plano até o fim do
          período já pago (o mês ou o ano). Depois disso a conta volta ao plano Grátis, com todos os
          seus dados preservados.
        </p>
        <p>
          Nas contratações pela internet você pode desistir em até 7 dias da contratação, com a
          devolução do valor pago, como prevê o art. 49 do Código de Defesa do Consumidor.
        </p>

        <Titulo>5. Sugestões, alertas e avisos</Titulo>
        <p>
          Vacinas sugeridas, protocolos, índices, alertas e avisos do sistema são cálculos e
          informações de apoio, não receita, prescrição ou laudo. Produtos, doses e datas devem ser
          confirmados com o seu médico-veterinário. Os avisos oficiais publicados no sistema são
          informativos: confirme sempre com o órgão responsável. Os avisos por e-mail e no celular
          dependem de serviços externos e podem atrasar ou não chegar; a Agenda e as notificações
          dentro do sistema continuam sendo a referência.
        </p>

        <Titulo>6. Uso aceitável</Titulo>
        <p>
          Não é permitido usar o sistema para fins ilegais, tentar acessar dados de outra fazenda,
          compartilhar a sua senha, sobrecarregar a plataforma deliberadamente, nem copiar,
          descompilar ou tentar extrair o código-fonte do sistema. Podemos suspender a conta que
          descumprir estes termos, avisando o motivo.
        </p>

        <Titulo>7. Seus dados são seus</Titulo>
        <p>
          As informações que você cadastra sobre a sua fazenda (animais, manejo, produção e
          financeiro) pertencem a você. Você pode exportá-las ou excluir a conta a qualquer momento
          em Configurações. Como tratamos e protegemos esses dados, inclusive os registros de acesso
          que a lei nos obriga a guardar por 6 meses, está na <LinkPolitica />.
        </p>

        <Titulo>8. Propriedade intelectual</Titulo>
        <p>
          O software, a marca Curral Online e o design da plataforma são de nossa propriedade. Isso
          não inclui os dados que você cadastra, cobertos pelo item anterior.
        </p>

        <Titulo>9. Disponibilidade e limites</Titulo>
        <p>
          Trabalhamos para manter o serviço no ar, mas ele pode passar por manutenções e, por estar
          em fase de testes, por instabilidades fora do previsto. Recomendamos exportar seus dados
          periodicamente em Configurações. O Curral Online é uma ferramenta de apoio à gestão; as
          decisões sobre o manejo e os negócios da fazenda continuam sendo suas.
        </p>

        <Titulo>10. Alterações nestes termos</Titulo>
        <p>
          Podemos atualizar estes termos para refletir mudanças no produto ou na legislação. A
          versão e a data ficam no topo desta página. Alterações relevantes são avisadas por e-mail
          ou dentro do sistema antes de valerem.
        </p>

        <Titulo>11. Lei aplicável e foro</Titulo>
        <p>
          Estes termos seguem as leis brasileiras, em especial o Código de Defesa do Consumidor, o
          Marco Civil da Internet e a Lei Geral de Proteção de Dados. Fica eleito o foro do
          domicílio do usuário.
        </p>

        <Titulo>12. Contato</Titulo>
        <p>
          Dúvidas sobre estes termos: <Email />.
        </p>
      </div>
    </div>
  );
}
