import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSouAdmin } from "@/hooks/use-avisos-oficiais";
import { db } from "@/lib/local-db";
import { dataCurta } from "@/lib/formato";
import { UFS } from "@/lib/ufs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Administração — Curral Online" }, { name: "robots", content: "noindex" }],
  }),
  component: Admin,
});

function Admin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: admin, isLoading } = useSouAdmin();
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [link, setLink] = useState("");
  const [estados, setEstados] = useState<string[]>([]);
  const [email, setEmail] = useState(false);
  const [expiraEm, setExpiraEm] = useState("");

  // Quem não é administrador volta para o Início (o servidor também recusa).
  useEffect(() => {
    if (!isLoading && admin === false) navigate({ to: "/inicio", replace: true });
  }, [admin, isLoading, navigate]);

  const lista = useQuery({
    queryKey: ["avisos-admin"],
    enabled: admin === true,
    queryFn: async () => {
      const { data, error } = await db.avisosOficiais.listar();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const publicar = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.avisosOficiais.publicar({
        titulo,
        texto,
        link: link || null,
        estados,
        enviarEmail: email,
        expiraEm: expiraEm || null,
      });
      if (error) throw new Error(error.message);
      return data!;
    },
    onSuccess: (r) => {
      toast.success(
        email
          ? `Aviso publicado. ${r.emails} e-mail(s) enviados${r.restantes ? `; ${r.restantes} saem na tarefa das 6h` : ""}.`
          : "Aviso publicado.",
      );
      setTitulo("");
      setTexto("");
      setLink("");
      setEstados([]);
      setEmail(false);
      setExpiraEm("");
      queryClient.invalidateQueries({ queryKey: ["avisos-admin"] });
      queryClient.invalidateQueries({ queryKey: ["avisos-oficiais"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const encerrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.avisosOficiais.encerrar(id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Aviso encerrado.");
      queryClient.invalidateQueries({ queryKey: ["avisos-admin"] });
      queryClient.invalidateQueries({ queryKey: ["avisos-oficiais"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!admin) return <AppShell titulo="Administração">{null}</AppShell>;

  function alternar(uf: string) {
    setEstados((atual) => (atual.includes(uf) ? atual.filter((e) => e !== uf) : [...atual, uf]));
  }

  return (
    <AppShell titulo="Administração">
      <div className="mx-auto max-w-2xl space-y-6">
        <form
          className="space-y-4 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            publicar.mutate();
          }}
        >
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Megaphone className="size-4 text-primary" aria-hidden="true" />
            Publicar aviso
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="av-titulo">Título</Label>
            <Input
              id="av-titulo"
              value={titulo}
              maxLength={120}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Campanha de vacinação contra a febre aftosa"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="av-texto">Texto</Label>
            <Textarea
              id="av-texto"
              value={texto}
              maxLength={1000}
              rows={4}
              onChange={(e) => setTexto(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="av-link">Link (opcional)</Label>
            <Input
              id="av-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Estados{" "}
              <span className="font-normal text-muted-foreground">
                ({estados.length === 0 ? "todos" : estados.join(", ")})
              </span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {UFS.map((uf) => (
                <button
                  key={uf}
                  type="button"
                  aria-pressed={estados.includes(uf)}
                  onClick={() => alternar(uf)}
                  className={cn(
                    "h-8 min-w-10 rounded-md border px-2 text-xs font-medium",
                    estados.includes(uf)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background",
                  )}
                >
                  {uf}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Sem nenhum marcado, o aviso vai para todos os estados. Só vê quem informou o estado da
              fazenda.
            </p>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="av-expira">Some do Início em (opcional)</Label>
            <Input
              id="av-expira"
              type="date"
              value={expiraEm}
              onChange={(e) => setExpiraEm(e.target.value)}
              className="max-w-48"
            />
          </div>
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <Label htmlFor="av-email" className="font-normal">
              Enviar também por e-mail
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Aos donos das fazendas dos estados escolhidos que não desligaram os e-mails.
              </span>
            </Label>
            <Switch id="av-email" checked={email} onCheckedChange={setEmail} />
          </div>
          <Button type="submit" disabled={publicar.isPending}>
            {publicar.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Publicar
          </Button>
        </form>

        <section aria-label="Avisos publicados" className="space-y-2">
          <h2 className="text-sm font-semibold">Publicados</h2>
          {(lista.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aviso ainda.</p>
          ) : null}
          {(lista.data ?? []).map((a) => {
            const emVigor = a.ativo && !a.expirado;
            return (
              <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.titulo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.estados.length ? a.estados.join(", ") : "Todos os estados"} ·{" "}
                      {dataCurta(a.created_at.slice(0, 10))}
                      {a.expira_em ? ` · até ${dataCurta(a.expira_em)}` : ""}
                      {a.enviar_email ? ` · ${a.emails_enviados} e-mail(s) enviados` : ""}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-xs font-medium",
                        emVigor ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {emVigor ? "No ar" : a.ativo ? "Expirado" : "Encerrado"}
                    </p>
                  </div>
                  {a.ativo ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={encerrar.isPending}
                      onClick={() => encerrar.mutate(a.id)}
                    >
                      Encerrar
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link to="/config" className="underline underline-offset-4">
          Voltar às configurações
        </Link>
      </p>
    </AppShell>
  );
}
