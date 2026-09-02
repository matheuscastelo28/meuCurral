import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Sprout, User, Users } from "lucide-react";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forcaSenha } from "@/lib/formato";
import { PLANOS } from "@/lib/planos";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta grátis — Meu Curral Digital" },
      {
        name: "description",
        content:
          "Crie sua conta em 4 passos e comece a controlar o rebanho com até 10 cabeças grátis.",
      },
      { property: "og:title", content: "Criar conta grátis — Meu Curral Digital" },
      {
        property: "og:description",
        content: "Cadastro guiado em 4 passos para começar a usar o Meu Curral Digital.",
      },
    ],
  }),
  component: Cadastro,
});

const PASSOS = ["Objetivo", "Fazenda", "Acesso", "Resumo"];

function Cadastro() {
  const navigate = useNavigate();
  const [passo, setPasso] = useState(0);
  const [objetivo, setObjetivo] = useState<"produtor" | "consultor" | null>(null);
  const [nomeFazenda, setNomeFazenda] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const forca = forcaSenha(senha);
  const planoGratis = PLANOS[0]!;

  const podeAvancar =
    (passo === 0 && objetivo !== null) ||
    (passo === 1 && nomeFazenda.trim().length >= 2) ||
    (passo === 2 && email.includes("@") && senha.length >= 8 && nome.trim().length >= 2) ||
    passo === 3;

  async function criarConta() {
    if (!aceite) {
      setErro("Para continuar, aceite os termos de uso e a política de privacidade.");
      return;
    }
    setErro(null);
    setEnviando(true);
    const timeout = setTimeout(() => {
      setErro(
        "Está demorando mais que o normal. Verifique sua internet — vamos continuar tentando.",
      );
    }, 12000);
    try {
      const { data, error } = await db.auth.signUp({
        email: email.trim(),
        password: senha,
        nomeFazenda: nomeFazenda.trim(),
        cidade: cidade.trim() || null,
        estado: estado.trim() || null,
        options: {
          emailRedirectTo: window.location.origin,
          data: { nome: nome.trim(), objetivo },
        },
      });
      if (error) throw error;

      navigate({
        to: "/verificar-email",
        search: {
          email: data.email ?? email.trim(),
          expira: data.expiraEm ?? undefined,
          aviso: data.avisoEmail ? "1" : undefined,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("already") || msg.includes("registered")) {
        setErro("Já existe uma conta com esse e-mail. Tente entrar em vez de criar uma nova.");
      } else if (msg.includes("password")) {
        setErro(
          "Essa senha não é segura o bastante. Use pelo menos 8 caracteres e evite senhas óbvias.",
        );
      } else {
        setErro("Não conseguimos criar sua conta agora. Tente novamente em instantes.");
      }
    } finally {
      clearTimeout(timeout);
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sprout className="size-4" aria-hidden="true" />
          </span>
          <span className="font-display text-sm font-extrabold">Meu Curral Digital</span>
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/auth">Já tenho conta</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-16">
        <ol className="flex items-center gap-2" aria-label="Etapas do cadastro">
          {PASSOS.map((rotulo, i) => (
            <li key={rotulo} className="flex flex-1 flex-col gap-1.5">
              <span
                className={
                  i <= passo ? "h-1.5 rounded-full bg-primary" : "h-1.5 rounded-full bg-muted"
                }
              />
              <span
                className={
                  i <= passo
                    ? "text-[11px] font-semibold text-primary"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {i + 1}. {rotulo}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          {passo === 0 ? (
            <section>
              <h1 className="text-2xl">Boas-vindas! O que você vai fazer aqui?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Isso ajuda a deixar as próximas telas com a sua cara.
              </p>
              <div className="mt-6 grid gap-3">
                <OpcaoObjetivo
                  ativo={objetivo === "produtor"}
                  onClick={() => setObjetivo("produtor")}
                  icon={<User className="size-5" aria-hidden="true" />}
                  titulo="Vou gerenciar meu próprio rebanho"
                  texto="Você cadastra sua fazenda e controla os animais no dia a dia."
                />
                <OpcaoObjetivo
                  ativo={objetivo === "consultor"}
                  onClick={() => setObjetivo("consultor")}
                  icon={<Users className="size-5" aria-hidden="true" />}
                  titulo="Sou consultor e gerencio para outros"
                  texto="Você começa com uma fazenda e pode adicionar outras depois."
                />
              </div>
            </section>
          ) : null}

          {passo === 1 ? (
            <section>
              <h1 className="text-2xl">Como se chama a fazenda?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                A localização é opcional e ajuda em relatórios no futuro.
              </p>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fazenda">Nome da fazenda</Label>
                  <Input
                    id="fazenda"
                    value={nomeFazenda}
                    onChange={(e) => setNomeFazenda(e.target.value)}
                    placeholder="Ex: Sítio Boa Vista"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="cidade">Cidade (opcional)</Label>
                    <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="estado">UF (opcional)</Label>
                    <Input
                      id="estado"
                      maxLength={2}
                      value={estado}
                      onChange={(e) => setEstado(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {passo === 2 ? (
            <section>
              <h1 className="text-2xl">Seus dados de acesso</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                A senha precisa ter no mínimo 8 caracteres.
              </p>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Seu nome</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex flex-1 gap-1" aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={
                            i < forca.nivel
                              ? forca.nivel >= 3
                                ? "h-1.5 flex-1 rounded-full bg-success"
                                : "h-1.5 flex-1 rounded-full bg-warning"
                              : "h-1.5 flex-1 rounded-full bg-muted"
                          }
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">{forca.rotulo}</span>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {passo === 3 ? (
            <section>
              <h1 className="text-2xl">Tudo certo para começar</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Confira os dados antes de criar a conta.
              </p>
              <dl className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
                <Linha rotulo="Fazenda" valor={nomeFazenda} />
                <Linha
                  rotulo="Localização"
                  valor={[cidade, estado].filter(Boolean).join(" / ") || "Não informada"}
                />
                <Linha rotulo="Seu nome" valor={nome} />
                <Linha rotulo="E-mail" valor={email} />
              </dl>

              <div className="mt-4 rounded-xl border border-primary/30 bg-accent/60 p-4">
                <p className="text-sm font-semibold">Plano {planoGratis.nome} selecionado</p>
                <ul className="mt-2 space-y-1.5">
                  {planoGratis.beneficios.map((b) => (
                    <li key={b} className="flex gap-2 text-xs text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      {b}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Você pode mudar de plano depois, dentro de Configurações.
                </p>
              </div>

              <label className="mt-4 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={aceite}
                  onChange={(e) => setAceite(e.target.checked)}
                  className="mt-1 size-4 accent-[var(--primary)]"
                />
                <span className="text-muted-foreground">
                  Li e aceito os{" "}
                  <Link to="/termos" className="text-primary underline underline-offset-4">
                    termos de uso
                  </Link>{" "}
                  e a{" "}
                  <Link to="/privacidade" className="text-primary underline underline-offset-4">
                    política de privacidade
                  </Link>
                  .
                </span>
              </label>
            </section>
          ) : null}
        </div>

        {erro ? (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {erro}
          </p>
        ) : null}

        <div className="mt-8 flex gap-3">
          {passo > 0 ? (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setPasso(passo - 1)}
              disabled={enviando}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Voltar
            </Button>
          ) : null}
          {passo < 3 ? (
            <Button
              size="lg"
              className="flex-1"
              disabled={!podeAvancar}
              onClick={() => setPasso(passo + 1)}
            >
              Continuar
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button size="lg" className="flex-1" onClick={criarConta} disabled={enviando}>
              {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {enviando ? "Criando conta..." : "Criar conta"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{valor || "—"}</dd>
    </div>
  );
}

function OpcaoObjetivo({
  ativo,
  onClick,
  icon,
  titulo,
  texto,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={
        ativo
          ? "flex items-start gap-3 rounded-xl border-2 border-primary bg-accent/60 p-4 text-left transicao-suave"
          : "flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transicao-suave hover:border-primary/40"
      }
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{texto}</span>
      </span>
    </button>
  );
}
