import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, MailCheck, Sprout } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";

const DURACAO_PADRAO_S = 10 * 60;
const COOLDOWN_S = 60;

interface ErroVerificacao {
  message: string;
  code?: string;
  tentativasRestantes?: number;
}

interface ErroReenvio {
  message: string;
  code?: string;
  aguardarSegundos?: number;
}

export const Route = createFileRoute("/verificar-email")({
  validateSearch: (
    busca: Record<string, unknown>,
  ): { email: string; expira?: string | undefined } => ({
    email: typeof busca["email"] === "string" ? busca["email"] : "",
    expira: typeof busca["expira"] === "string" ? busca["expira"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Confirme seu e-mail — Meu Curral Digital" },
      {
        name: "description",
        content: "Digite o código de 6 dígitos que enviamos para o seu e-mail.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerificarEmail,
});

function formatarTempo(segundos: number) {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}

function VerificarEmail() {
  const { email, expira } = Route.useSearch();
  const navigate = useNavigate();

  const [digitos, setDigitos] = useState<string[]>(Array(6).fill(""));
  const [verificando, setVerificando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [expiraEm, setExpiraEm] = useState<number>(() =>
    expira ? new Date(expira).getTime() : Date.now() + DURACAO_PADRAO_S * 1000,
  );
  const [bloqueadoAte, setBloqueadoAte] = useState<number>(() => Date.now() + COOLDOWN_S * 1000);
  const [agora, setAgora] = useState(() => Date.now());
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!email) navigate({ to: "/cadastro", replace: true });
  }, [email, navigate]);

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const segundosRestantes = Math.max(0, Math.ceil((expiraEm - agora) / 1000));
  const expirado = segundosRestantes <= 0;
  const cooldownRestante = Math.max(0, Math.ceil((bloqueadoAte - agora) / 1000));

  function focarPrimeiro() {
    requestAnimationFrame(() => refs.current[0]?.focus());
  }

  function limpar() {
    setDigitos(Array(6).fill(""));
    focarPrimeiro();
  }

  async function confirmar(codigo: string) {
    if (verificando || expirado) return;
    setVerificando(true);
    setErro(null);
    const { error } = await db.auth.verificarCodigo({ email, codigo });
    setVerificando(false);
    if (error) {
      const err = error as ErroVerificacao;
      if (err.code === "ja_verificado") {
        toast.success("Esse e-mail já foi confirmado. Você já pode entrar.");
        navigate({ to: "/auth", replace: true });
        return;
      }
      if (err.code === "codigo_incorreto") {
        setErro(
          err.tentativasRestantes !== undefined
            ? `Código incorreto. Você ainda tem ${err.tentativasRestantes} tentativa${
                err.tentativasRestantes === 1 ? "" : "s"
              }.`
            : "Código incorreto.",
        );
      } else if (err.code === "codigo_expirado") {
        setErro("Esse código expirou. Peça um novo abaixo.");
        setExpiraEm(Date.now());
      } else if (err.code === "muitas_tentativas") {
        setErro("Muitas tentativas erradas. Peça um novo código abaixo.");
        setExpiraEm(Date.now());
      } else {
        setErro("Não conseguimos confirmar agora. Tente de novo.");
      }
      limpar();
      return;
    }
    toast.success("E-mail confirmado! Bem-vindo(a).");
    navigate({ to: "/inicio", replace: true });
  }

  async function reenviar() {
    if (reenviando || cooldownRestante > 0) return;
    setReenviando(true);
    setErro(null);
    const { data, error } = await db.auth.reenviarCodigo({ email });
    setReenviando(false);
    if (error) {
      const err = error as ErroReenvio;
      if (err.code === "aguardar" && err.aguardarSegundos) {
        setBloqueadoAte(Date.now() + err.aguardarSegundos * 1000);
        setErro(`Aguarde ${err.aguardarSegundos}s para pedir outro código.`);
      } else {
        setErro("Não conseguimos reenviar agora. Tente de novo em instantes.");
      }
      return;
    }
    setBloqueadoAte(Date.now() + COOLDOWN_S * 1000);
    if (data?.expiraEm) setExpiraEm(new Date(data.expiraEm).getTime());
    else setExpiraEm(Date.now() + DURACAO_PADRAO_S * 1000);
    limpar();
    toast.success("Enviamos um novo código para o seu e-mail.");
  }

  function atualizarDigito(indice: number, textoDigitado: string) {
    const somenteNumeros = textoDigitado.replace(/\D/g, "");
    const novo = [...digitos];
    if (!somenteNumeros) {
      novo[indice] = "";
      setDigitos(novo);
      return;
    }
    let pos = indice;
    for (const digito of somenteNumeros) {
      if (pos > 5) break;
      novo[pos] = digito;
      pos++;
    }
    setDigitos(novo);
    const proximo = Math.min(pos, 5);
    refs.current[proximo]?.focus();
    if (novo.every((d) => d !== "")) confirmar(novo.join(""));
  }

  function aoColar(e: React.ClipboardEvent<HTMLInputElement>, indice: number) {
    const texto = e.clipboardData.getData("text");
    if (!/\d/.test(texto)) return;
    e.preventDefault();
    atualizarDigito(indice, texto);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>, indice: number) {
    if (e.key === "Backspace" && !digitos[indice] && indice > 0) {
      refs.current[indice - 1]?.focus();
    } else if (e.key === "ArrowLeft" && indice > 0) {
      refs.current[indice - 1]?.focus();
    } else if (e.key === "ArrowRight" && indice < 5) {
      refs.current[indice + 1]?.focus();
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
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">
        <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
          <MailCheck className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-3xl">Confirme seu e-mail</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enviamos um código de 6 dígitos para <strong className="text-foreground">{email}</strong>.
          Digite abaixo para liberar o acesso à sua fazenda.
        </p>

        <div className="mt-8">
          <div
            className="flex justify-center gap-2"
            role="group"
            aria-label="Código de verificação"
          >
            {digitos.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={d}
                onChange={(e) => atualizarDigito(i, e.target.value)}
                onKeyDown={(e) => aoTeclar(e, i)}
                onPaste={(e) => aoColar(e, i)}
                disabled={verificando || expirado}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                aria-label={`Dígito ${i + 1} do código`}
                className="size-11 rounded-lg border border-input bg-background text-center text-xl font-semibold text-foreground transicao-suave focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:size-14"
              />
            ))}
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            {expirado ? (
              <span className="font-medium text-destructive">
                Código expirado — peça um novo abaixo.
              </span>
            ) : (
              <>O código expira em {formatarTempo(segundosRestantes)}</>
            )}
          </p>
        </div>

        {verificando ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Confirmando...
          </p>
        ) : null}

        {erro ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
          >
            {erro}
          </p>
        ) : null}

        <div className="mt-6 text-center">
          <Button
            type="button"
            variant="outline"
            onClick={reenviar}
            disabled={reenviando || cooldownRestante > 0}
          >
            {reenviando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {cooldownRestante > 0 ? `Reenviar código (${cooldownRestante}s)` : "Reenviar código"}
          </Button>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Errou o e-mail?{" "}
          <Link
            to="/cadastro"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Voltar ao cadastro
          </Link>
        </p>
      </main>
    </div>
  );
}
