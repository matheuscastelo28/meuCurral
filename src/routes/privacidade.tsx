import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de privacidade — Curral Online" },
      {
        name: "description",
        content:
          "Como o Curral Online trata e protege os dados do produtor rural e da fazenda, conforme a LGPD.",
      },
      { property: "og:title", content: "Política de privacidade — Curral Online" },
      {
        property: "og:description",
        content: "Quais dados tratamos, para quê, com quem e quais são os seus direitos.",
      },
    ],
  }),
  component: Privacidade,
});

const VERSAO = "2.0";
const ATUALIZACAO = "novembro de 2026";
const CONTATO = "contato@curralonline.com";

// Dados do controlador, conforme o Certificado de Inova Simples (emitido em
// 10/11/2026). Só dados públicos da empresa: não colocar CPF do titular.
const CONTROLADOR = {
  razaoSocial: "CURRAL ONLINE TECNOLOGIA E GESTÃO RURAL INOVA SIMPLES (I.S.)",
  cnpj: "69.195.116/0001-20",
  endereco: "Avenida Jesus Maria José, 2495, Jardim dos Monólitos, Quixadá/CE, CEP 63909-006",
};

function Titulo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-6 pt-4 text-base font-semibold text-foreground">
      {children}
    </h2>
  );
}

function Lista({ itens }: { itens: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Email() {
  return (
    <a href={`mailto:${CONTATO}`} className="text-primary underline underline-offset-4">
      {CONTATO}
    </a>
  );
}

const SECOES = [
  ["quem-somos", "1. Quem somos"],
  ["papeis", "2. Controlador e operador"],
  ["dados", "3. Dados que tratamos"],
  ["finalidades", "4. Finalidades e bases legais"],
  ["dados-fazenda", "5. O que não fazemos com os dados da fazenda"],
  ["compartilhamento", "6. Com quem compartilhamos"],
  ["internacional", "7. Transferência internacional"],
  ["retencao", "8. Por quanto tempo guardamos"],
  ["direitos", "9. Seus direitos"],
  ["seguranca", "10. Segurança e incidentes"],
  ["cookies", "11. Cookies e armazenamento no navegador"],
  ["menores", "12. Menores de idade"],
  ["encarregado", "13. Encarregado e contato"],
  ["alteracoes", "14. Alterações desta política"],
  ["lei", "15. Lei aplicável e foro"],
] as const;

const BASES: [string, string][] = [
  [
    "Criar e manter sua conta, autenticar o acesso e operar as funções do sistema (rebanho, manejo, reprodução, leite, confinamento, financeiro, agenda, relatórios)",
    "Execução de contrato (art. 7º, V)",
  ],
  [
    "Enviar e-mails do próprio serviço: código de confirmação, avisos de conta, segurança e assinatura",
    "Execução de contrato (art. 7º, V)",
  ],
  [
    "Processar a assinatura dos planos, cobranças e documentos fiscais",
    "Execução de contrato e cumprimento de obrigação legal (art. 7º, V e II)",
  ],
  [
    "Garantir a segurança, prevenir fraudes e acessos indevidos e manter registros de acesso",
    "Legítimo interesse e cumprimento de obrigação legal — Marco Civil da Internet (art. 7º, IX e II)",
  ],
  [
    "Atender pedidos de suporte e solicitações de titulares",
    "Execução de contrato e obrigação legal",
  ],
  [
    "Entender o uso do sistema para corrigir erros e melhorar o produto, de forma agregada e sem identificar você",
    "Legítimo interesse (art. 7º, IX)",
  ],
  [
    "Enviar novidades e conteúdos que não sejam do próprio serviço",
    "Consentimento, que pode ser retirado a qualquer momento (art. 7º, I)",
  ],
  [
    "Defender direitos em processo judicial, administrativo ou arbitral",
    "Exercício regular de direitos (art. 7º, VI)",
  ],
];

function Privacidade() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Voltar
      </Link>
      <h1 className="mt-6 text-3xl">Política de privacidade e proteção de dados</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Versão {VERSAO} · Última atualização: {ATUALIZACAO}.
      </p>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Esta política explica, em linguagem direta, como o Curral Online trata os dados pessoais
          de quem usa o sistema e os dados da fazenda, conforme a Lei Geral de Proteção de Dados
          Pessoais (Lei nº 13.709/2018 — LGPD) e o Marco Civil da Internet (Lei nº 12.965/2014). Ao
          criar uma conta ou usar o sistema, você declara que leu e entendeu este documento.
        </p>

        <nav aria-label="Índice" className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-foreground">Nesta página</p>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">
            {SECOES.map(([id, titulo]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  {titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Titulo id="quem-somos">1. Quem somos e a quem esta política se aplica</Titulo>
        <p>
          O Curral Online é um sistema de gestão de rebanho bovino e ovino, oferecido por{" "}
          {CONTROLADOR.razaoSocial}, CNPJ {CONTROLADOR.cnpj}, com sede em {CONTROLADOR.endereco}{" "}
          (“Curral Online”, “nós”). Esta política vale para o site curralonline.com, para o sistema
          web e para todas as pessoas que criam conta ou visitam o site.
        </p>

        <Titulo id="papeis">2. Quem é o controlador e quem é o operador</Titulo>
        <p>
          A LGPD separa quem decide sobre os dados (controlador) de quem os trata em nome de outro
          (operador). No Curral Online:
        </p>
        <Lista
          itens={[
            <>
              <strong className="text-foreground">Dados da sua conta</strong> (cadastro, acesso,
              assinatura e pagamento): o Curral Online é o <strong>controlador</strong>.
            </>,
            <>
              <strong className="text-foreground">
                Dados de outras pessoas que você registra no sistema
              </strong>{" "}
              — por exemplo, nome de comprador, fornecedor, funcionário, veterinário ou pessoa
              ligada a uma conta a pagar ou a receber: você (ou a fazenda) é o{" "}
              <strong>controlador</strong> e o Curral Online atua como <strong>operador</strong>,
              tratando esses dados apenas para prestar o serviço e conforme as suas instruções. Cabe
              a você ter base legal para registrá-los e informar essas pessoas quando a lei exigir.
            </>,
            <>
              <strong className="text-foreground">Dados da atividade</strong> (animais, manejo,
              produção, reprodução, finanças da fazenda): em si não são dados pessoais, mas, por
              poderem identificar você, recebem a mesma proteção dos dados pessoais.
            </>,
          ]}
        />

        <Titulo id="dados">3. Dados que tratamos</Titulo>
        <Lista
          itens={[
            <>
              <strong className="text-foreground">Cadastro:</strong> nome, e-mail, senha (guardada
              apenas em forma de hash, um código que não permite recuperar a senha original), como
              você usa o sistema e nome, município e estado da fazenda.
            </>,
            <>
              <strong className="text-foreground">Dados que você cadastra:</strong> animais
              (identificação, brinco, raça, categoria, sexo, nascimento, peso, lote e genealogia),
              manejos e vacinas, reprodução, produção de leite e derivados, confinamento, pesagens,
              agenda e financeiro (lançamentos, contas, parcelas, vendas, compras e as pessoas que
              você informar nelas).
            </>,
            <>
              <strong className="text-foreground">Assinatura e pagamento:</strong> plano, valor,
              situação da assinatura, o identificador dela no Mercado Pago e o e-mail informado para
              o pagamento. Não recebemos nem guardamos número de cartão: o pagamento é feito no
              ambiente do Mercado Pago.
            </>,
            <>
              <strong className="text-foreground">Dados técnicos:</strong> identificador da sessão
              (que mantém você conectado), endereço IP, data e hora de acesso, navegador e
              dispositivo, registrados pelo sistema e pelos provedores de hospedagem; e códigos de
              confirmação de e-mail, que são temporários.
            </>,
            <>
              <strong className="text-foreground">Dados que ficam só no seu aparelho:</strong> os
              dados de identificação que você preenche para o relatório (CPF ou CNPJ, CAF/DAP,
              inscrição estadual) e preferências de tela ficam no armazenamento do seu navegador e
              não são enviados aos nossos servidores. O relatório em PDF ou Excel é gerado no
              próprio aparelho.
            </>,
          ]}
        />
        <p>
          Não tratamos dados pessoais sensíveis (como saúde, religião ou biometria) nem a
          localização do seu aparelho.
        </p>

        <Titulo id="finalidades">4. Para que usamos e com qual base legal</Titulo>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Finalidade</th>
                <th className="px-3 py-2 font-semibold">Base legal (LGPD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {BASES.map(([fim, base]) => (
                <tr key={fim} className="align-top">
                  <td className="px-3 py-2">{fim}</td>
                  <td className="px-3 py-2">{base}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Titulo id="dados-fazenda">5. O que não fazemos com os dados da sua fazenda</Titulo>
        <Lista
          itens={[
            "Não vendemos nem alugamos dados pessoais ou dados da fazenda.",
            "Não usamos os dados da fazenda para publicidade, nossa ou de terceiros.",
            "Não repassamos dados a frigoríficos, compradores, bancos, cooperativas, revendas ou órgãos públicos. Quando você quiser, você mesmo baixa e envia o relatório ou a planilha.",
            "Não usamos os dados da sua fazenda para estatísticas de mercado ou comparativos. Se um dia oferecermos isso, será só com dados anonimizados e agregados, com aviso prévio e com a opção de não participar.",
            "Não tomamos decisões automatizadas que afetem seus direitos. Índices e alertas do sistema são cálculos de apoio, e a decisão é sempre sua.",
          ]}
        />

        <Titulo id="compartilhamento">6. Com quem compartilhamos</Titulo>
        <p>
          Só compartilhamos dados com quem nos ajuda a operar o serviço, na medida do necessário e
          com obrigação de sigilo e segurança:
        </p>
        <Lista
          itens={[
            "Vercel Inc. — hospedagem do site e do sistema.",
            "Amazon Web Services (AWS) — banco de dados e cópias de segurança.",
            "Resend — envio dos e-mails do serviço, como o código de confirmação.",
            "Mercado Pago — processamento da assinatura e dos pagamentos dos planos.",
          ]}
        />
        <p>
          Também podemos fornecer dados quando houver obrigação legal, ordem judicial ou requisição
          de autoridade competente, ou para proteger direitos do Curral Online e dos usuários. Se
          houver venda, fusão ou reorganização da empresa, os dados poderão ser transferidos ao
          sucessor, que fica obrigado a respeitar esta política.
        </p>

        <Titulo id="internacional">7. Transferência internacional</Titulo>
        <p>
          Parte dos nossos provedores mantém servidores fora do Brasil, principalmente nos Estados
          Unidos (por exemplo, o banco de dados na AWS e a hospedagem na Vercel). Essas
          transferências seguem o art. 33 da LGPD, com garantias contratuais de proteção de dados
          oferecidas por esses provedores e com as medidas de segurança descritas no item 10.
        </p>

        <Titulo id="retencao">8. Por quanto tempo guardamos</Titulo>
        <Lista
          itens={[
            "Enquanto sua conta existir, guardamos os dados para prestar o serviço.",
            "Em Configurações você pode apagar os registros da fazenda ou excluir a conta. A exclusão apaga na hora, do banco de dados principal, a conta, a fazenda e todos os registros ligados a ela.",
            "Cópias de segurança automáticas do banco são eliminadas no ciclo do provedor, em até 35 dias.",
            "Cadastros não confirmados e códigos de confirmação expiram e são descartados.",
            "Dados que a lei obriga a guardar (por exemplo, registros de acesso por 6 meses pelo Marco Civil e documentos fiscais da assinatura pelo prazo da legislação tributária) são mantidos só por esse prazo e só para essa finalidade.",
          ]}
        />

        <Titulo id="direitos">9. Seus direitos (art. 18 da LGPD)</Titulo>
        <p>Você pode, a qualquer momento:</p>
        <Lista
          itens={[
            "confirmar se tratamos seus dados e ter acesso a eles;",
            "corrigir dados incompletos, inexatos ou desatualizados;",
            "pedir anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;",
            "levar seus dados para outro serviço (portabilidade): em Configurações, “Exportar meus dados” gera um arquivo com planilhas de rebanho, manejo, leite, reprodução, financeiro e calendário;",
            "pedir a eliminação dos dados, o que você mesmo faz em Configurações → Excluir minha conta;",
            "saber com quem compartilhamos seus dados (item 6);",
            "ser informado sobre a possibilidade de não dar consentimento e revogá-lo quando ele for a base legal;",
            "opor-se a tratamento feito com base em legítimo interesse, quando ele estiver em desacordo com a lei.",
          ]}
        />
        <p>
          Para o que não estiver disponível em Configurações, escreva para <Email /> com o assunto
          “Privacidade”. Podemos pedir uma confirmação de identidade para proteger a sua conta e
          respondemos em até 15 dias. Você também pode apresentar reclamação à Autoridade Nacional
          de Proteção de Dados (ANPD).
        </p>

        <Titulo id="seguranca">10. Segurança e incidentes</Titulo>
        <Lista
          itens={[
            "Toda comunicação com o sistema usa conexão criptografada (HTTPS).",
            "Cada fazenda só acessa os próprios dados. Essa regra é aplicada no servidor, não apenas na tela.",
            "Senhas são guardadas apenas em forma de hash, nunca em texto.",
            "Credenciais do sistema ficam em ambiente protegido do provedor, com acesso restrito a quem precisa.",
            "O banco de dados tem cópias de segurança automáticas.",
          ]}
        />
        <p>
          Nenhum sistema é totalmente imune a falhas. Se ocorrer um incidente de segurança que possa
          trazer risco ou dano relevante, comunicaremos você e a ANPD, como determina o art. 48 da
          LGPD. Proteja também a sua conta: use senha forte e não a compartilhe.
        </p>

        <Titulo id="cookies">11. Cookies e armazenamento no navegador</Titulo>
        <p>
          Não usamos cookies de publicidade nem ferramentas de rastreamento de terceiros. Usamos o
          armazenamento local do navegador só para o que é necessário: manter você conectado
          (identificador de sessão, apagado ao sair), lembrar preferências de tela e guardar os
          dados de identificação do relatório no seu aparelho. Se você bloquear esse armazenamento,
          não será possível entrar no sistema.
        </p>

        <Titulo id="menores">12. Menores de idade</Titulo>
        <p>
          O Curral Online é destinado a maiores de 18 anos ou a pessoas legalmente capazes de
          contratar. Não coletamos intencionalmente dados de crianças e adolescentes. Se
          identificarmos um cadastro assim, ele será excluído.
        </p>

        <Titulo id="encarregado">13. Encarregado pelo tratamento de dados e contato</Titulo>
        <p>
          O canal de comunicação com o encarregado e para qualquer assunto de privacidade é{" "}
          <Email />, com o assunto “Privacidade”.
        </p>

        <Titulo id="alteracoes">14. Alterações desta política</Titulo>
        <p>
          Podemos atualizar esta política para refletir mudanças no sistema ou na legislação. A
          versão e a data ficam no topo desta página. Mudanças relevantes, como novas finalidades,
          novos tipos de dados ou novos parceiros, serão avisadas por e-mail ou dentro do sistema
          antes de valerem. Quando a base legal for o consentimento, pediremos novamente a sua
          concordância.
        </p>

        <Titulo id="lei">15. Lei aplicável e foro</Titulo>
        <p>
          Esta política segue as leis brasileiras, em especial a LGPD, o Marco Civil da Internet e o
          Código de Defesa do Consumidor. Fica eleito o foro do domicílio do titular para resolver
          questões relacionadas a ela. Veja também os{" "}
          <Link to="/termos" className="text-primary underline underline-offset-4">
            Termos de uso
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
