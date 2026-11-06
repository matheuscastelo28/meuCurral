import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, ExternalLink, Minus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { useLimitePlano } from "@/hooks/use-fazenda";
import { getPlano, PLANOS, usoCabecasTexto } from "@/lib/planos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CartaoConfig } from "./CartaoConfig";

const PLANOS_ASSINAVEIS = PLANOS.filter((p) => p.valorMensal);

const MENSAGEM_STATUS: Record<string, string> = {
  ativa: "Assinatura confirmada! Seu plano já está liberado.",
  pendente: "O Mercado Pago ainda não confirmou o pagamento. Pode levar alguns minutos.",
  pausada: "A assinatura está pausada no Mercado Pago (pagamento não aprovado).",
  cancelada: "A assinatura foi cancelada.",
};

export function SecaoPlano() {
  const queryClient = useQueryClient();
  const { plano, usados, limite } = useLimitePlano();
  const pct = Number.isFinite(limite) ? Math.min(100, Math.round((usados / limite) * 100)) : 0;
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);

  const info = useQuery({
    queryKey: ["assinatura"],
    queryFn: async () => {
      const { data, error } = await db.assinatura.minha();
      if (error) throw new Error(error.message);
      return data!;
    },
  });

  function atualizarTudo() {
    queryClient.invalidateQueries({ queryKey: ["assinatura"] });
    queryClient.invalidateQueries({ queryKey: ["fazenda"] });
  }

  const sincronizar = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.assinatura.sincronizar();
      if (error) throw new Error(error.message);
      return data?.status ?? null;
    },
    onSuccess: (status) => {
      if (status) toast.message(MENSAGEM_STATUS[status] ?? `Status: ${status}`);
      atualizarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Volta do checkout do Mercado Pago (?assinatura=retorno): confere na hora.
  const conferiuRetorno = useRef(false);
  useEffect(() => {
    if (conferiuRetorno.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("assinatura") !== "retorno") return;
    conferiuRetorno.current = true;
    for (const p of ["assinatura", "preapproval_id", "collection_id", "status"]) params.delete(p);
    const resto = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${resto ? `?${resto}` : ""}#plano`,
    );
    document.getElementById("plano")?.scrollIntoView({ behavior: "smooth" });
    sincronizar.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Assinatura pendente (pagou pelo app, fechou a aba, aviso atrasado...):
  // ao abrir a tela, confere uma vez no Mercado Pago, sem alarde.
  const conferiuPendente = useRef(false);
  const statusAtual = info.data?.assinatura?.status;
  useEffect(() => {
    if (statusAtual !== "pendente" || conferiuPendente.current) return;
    conferiuPendente.current = true;
    void db.assinatura.sincronizar().then(({ data }) => {
      if (data?.status && data.status !== "pendente") {
        if (data.status === "ativa") toast.success(MENSAGEM_STATUS["ativa"] ?? "Plano liberado.");
        atualizarTudo();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusAtual]);

  const iniciar = useMutation({
    mutationFn: async (planoId: string) => {
      const { data, error } = await db.assinatura.iniciar({ plano: planoId, email });
      if (error) throw new Error(error.message);
      return data!.initPoint;
    },
    onSuccess: (initPoint) => {
      toast.message("Levando você para o Mercado Pago…");
      window.location.assign(initPoint);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const { error } = await db.assinatura.cancelar();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Assinatura cancelada. Seu plano voltou para o Grátis.");
      setConfirmarCancelamento(false);
      atualizarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recursos = [
    { rotulo: "Cadastro de rebanho, manejo e calendário", tem: true },
    { rotulo: "Relatórios", tem: plano.relatorios },
    { rotulo: "Exportação de dados", tem: plano.exportacao },
    { rotulo: "Vários usuários na mesma fazenda", tem: plano.multiUsuario },
    { rotulo: "Acesso via API", tem: plano.api },
  ];

  const assinatura = info.data?.assinatura ?? null;
  const planoAssinatura = assinatura ? getPlano(assinatura.plano) : null;
  const valorTexto = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <CartaoConfig id="plano" titulo="Plano e uso">
      <p className="text-sm font-semibold">Plano {plano.nome}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {usoCabecasTexto(usados, limite)} no rebanho.
      </p>
      {Number.isFinite(limite) ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={pct >= 100 ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <ul className="mt-4 space-y-2">
        {recursos.map((r) => (
          <li key={r.rotulo} className="flex gap-2 text-sm">
            {r.tem ? (
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={r.tem ? "" : "text-muted-foreground"}>{r.rotulo}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-border pt-4">
        {info.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando assinatura…</p>
        ) : info.data?.acessoTotal ? (
          <p className="rounded-lg bg-accent px-3 py-2 text-sm">
            Sua conta tem <strong>acesso total</strong>, sem limite de cabeças, por ter sido criada
            antes dos planos. Não precisa assinar.
          </p>
        ) : assinatura && (assinatura.status === "ativa" || assinatura.status === "pausada") ? (
          <div
            className={cn(
              "rounded-lg border p-3 text-sm",
              assinatura.status === "ativa"
                ? "border-primary/30 bg-accent"
                : "border-warning/40 bg-warning/10",
            )}
          >
            <p className="font-semibold">
              {assinatura.status === "ativa" ? "Assinatura ativa" : "Assinatura pausada"} · Plano{" "}
              {planoAssinatura?.nome} · {valorTexto(assinatura.valor)}/mês
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {assinatura.status === "ativa"
                ? "Cobrança mensal pelo Mercado Pago. Você pode cancelar quando quiser."
                : "O Mercado Pago não conseguiu cobrar. Atualize o meio de pagamento na sua conta do Mercado Pago."}
            </p>
            {confirmarCancelamento ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs">Cancelar a assinatura? O plano volta para o Grátis.</span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={cancelar.isPending}
                  onClick={() => cancelar.mutate()}
                >
                  {cancelar.isPending ? "Cancelando…" : "Sim, cancelar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmarCancelamento(false)}>
                  Voltar
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmarCancelamento(true)}>
                  Cancelar assinatura
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={sincronizar.isPending}
                  onClick={() => sincronizar.mutate()}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Conferir status
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {assinatura?.status === "pendente" ? (
              <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="font-semibold">
                  Aguardando o Mercado Pago confirmar o Plano {planoAssinatura?.nome}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Se você não terminou o pagamento, continue de onde parou. Se já pagou, confira o
                  status. Pagamento recusado? Tente outro cartão ou pague pelo app do Mercado Pago,
                  entrando com a sua conta.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {assinatura.initPoint ? (
                    <Button size="sm" asChild>
                      <a href={assinatura.initPoint}>
                        <ExternalLink className="size-4" aria-hidden="true" />
                        Continuar pagamento
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sincronizar.isPending}
                    onClick={() => sincronizar.mutate()}
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {sincronizar.isPending ? "Conferindo…" : "Já paguei, conferir"}
                  </Button>
                </div>
              </div>
            ) : null}

            <p className="text-sm font-semibold">Assinar um plano</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {PLANOS_ASSINAVEIS.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col rounded-xl border p-4",
                    escolhido === p.id ? "border-primary bg-accent/50" : "border-border",
                  )}
                >
                  <p className="text-sm font-semibold">{p.nome}</p>
                  <p className="font-display text-2xl font-extrabold">
                    {valorTexto(p.valorMensal!)}
                    <span className="text-xs font-normal text-muted-foreground">/mês</span>
                  </p>
                  <ul className="mt-2 flex-1 space-y-1">
                    {p.beneficios.map((b) => (
                      <li key={b} className="flex gap-1.5 text-xs text-muted-foreground">
                        <Check
                          className="mt-0.5 size-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {b}
                      </li>
                    ))}
                  </ul>
                  {escolhido === p.id ? (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        iniciar.mutate(p.id);
                      }}
                    >
                      <Label htmlFor={`email-mp-${p.id}`} className="text-xs">
                        E-mail da sua conta no Mercado Pago
                      </Label>
                      <Input
                        id={`email-mp-${p.id}`}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                      <Button type="submit" className="w-full" disabled={iniciar.isPending}>
                        <CreditCard className="size-4" aria-hidden="true" />
                        {iniciar.isPending ? "Abrindo…" : "Ir para o pagamento"}
                      </Button>
                    </form>
                  ) : (
                    <Button
                      className="mt-3"
                      variant={plano.id === p.id ? "outline" : "default"}
                      disabled={!info.data?.configurado || plano.id === p.id}
                      onClick={() => {
                        setEscolhido(p.id);
                        setEmail(info.data?.email ?? "");
                      }}
                    >
                      {plano.id === p.id ? "Plano atual" : `Assinar ${p.nome}`}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {!info.data?.configurado ? (
              <p className="mt-3 text-xs text-muted-foreground">
                O pagamento online está sendo configurado. Enquanto isso, fale com a gente para
                mudar de plano.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Pagamento mensal pelo Mercado Pago (cartão de crédito ou saldo). Cancele quando
                quiser.
              </p>
            )}
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Dúvidas sobre planos? Fale com a gente em{" "}
        <a
          className="text-primary underline underline-offset-4"
          href="mailto:contato@curralonline.com"
        >
          contato@curralonline.com
        </a>
        .
      </p>
    </CartaoConfig>
  );
}
