import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/local-db";

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function paraBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

type Estado = "carregando" | "sem-suporte" | "ios-instalar" | "bloqueado" | "inativo" | "ativo";

/** Avisos fora do sistema: e-mail das 6h (switch, salvo junto das preferências) e notificação no celular. */
export function AvisosForaDoSistema({
  avisoEmail,
  onAvisoEmail,
}: {
  avisoEmail: boolean;
  onAvisoEmail: (v: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [liberado, setLiberado] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  async function atualizar() {
    if (typeof window === "undefined") return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalado =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado(ios && !instalado ? "ios-instalar" : "sem-suporte");
      return;
    }
    let endpoint: string | null = null;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      endpoint = (await reg?.pushManager.getSubscription())?.endpoint ?? null;
    } catch {
      // segue sem aparelho ativo
    }
    const { data } = await db.push.status(endpoint);
    if (data) setLiberado(data.liberado);
    if (Notification.permission === "denied") setEstado("bloqueado");
    else setEstado(data?.ativo ? "ativo" : "inativo");
  }

  useEffect(() => {
    void atualizar();
  }, []);

  async function ativar() {
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "inativo");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { data: st } = await db.push.status(null);
      if (!st) throw new Error("sem chave");
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chaveParaBytes(st.chave),
        }));
      const { error } = await db.push.salvar({
        endpoint: sub.endpoint,
        p256dh: paraBase64(sub.getKey("p256dh")),
        auth: paraBase64(sub.getKey("auth")),
        userAgent: navigator.userAgent,
      });
      if (error) {
        await sub.unsubscribe().catch(() => {});
        toast.error(error.message);
        return;
      }
      setEstado("ativo");
      toast.success("Notificações ativadas neste aparelho.");
    } catch {
      toast.error("Não conseguimos ativar as notificações neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await db.push.remover(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inativo");
      toast.success("Notificações desativadas neste aparelho.");
    } catch {
      toast.error("Não conseguimos desativar agora.");
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setOcupado(true);
    const { data, error } = await db.push.testar();
    setOcupado(false);
    if (error) toast.error(error.message);
    else if ((data?.entregues ?? 0) > 0)
      toast.success("Teste enviado. Olhe as notificações do aparelho.");
    else {
      // Confere de novo: se o aparelho saiu da lista (permissão revogada,
      // app desinstalado), a tela volta a oferecer "Ativar neste aparelho".
      await atualizar();
      toast.error(
        "O teste não chegou. Toque em “Desativar neste aparelho” e ative de novo; se continuar, confira se as notificações do site estão liberadas.",
        { duration: 8000 },
      );
    }
  }

  const mensagem: Partial<Record<Estado, string>> = {
    "sem-suporte":
      "Este navegador não recebe notificações. Use o Chrome (Android) ou o Safari 16.4+.",
    "ios-instalar":
      "No iPhone, primeiro adicione o Curral Online à tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá.",
    bloqueado: "As notificações estão bloqueadas neste navegador. Libere nas permissões do site.",
  };

  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Avisos fora do sistema</legend>
      {!liberado ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Os avisos por e-mail e no celular fazem parte do plano Caderno ou superior.
        </p>
      ) : null}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="aviso_email" className="font-normal">
            E-mail diário às 6h
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Compromissos, vencimentos e partos do dia seguinte, mais os avisos oficiais do seu
              estado.
            </span>
          </Label>
          <Switch
            id="aviso_email"
            checked={avisoEmail}
            disabled={!liberado}
            onCheckedChange={onAvisoEmail}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm">
            Notificação no celular
            <span className="mt-0.5 block text-xs text-muted-foreground">
              O mesmo resumo, às 6h, direto na tela do aparelho.
            </span>
          </p>
          {mensagem[estado] ? (
            <p className="text-xs text-muted-foreground">{mensagem[estado]}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {estado === "inativo" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={ocupado || !liberado}
                onClick={ativar}
              >
                {ocupado ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Bell className="size-4" aria-hidden="true" />
                )}
                Ativar neste aparelho
              </Button>
            ) : null}
            {estado === "ativo" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={testar}
                >
                  Enviar teste
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={ocupado}
                  onClick={desativar}
                >
                  <BellOff className="size-4" aria-hidden="true" />
                  Desativar neste aparelho
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
