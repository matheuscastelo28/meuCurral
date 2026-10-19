import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFazenda } from "@/hooks/use-fazenda";
import {
  apagarRegistrosDaFazenda,
  exportarDadosDaFazenda,
  exportarReceitasExcel,
} from "@/lib/exportar";
import { excluirContaAtual } from "@/lib/local-db";
import { CartaoConfig } from "./CartaoConfig";

type Acao = "limpar" | "excluir" | null;

export function SecaoDados() {
  const { data: fazenda } = useFazenda();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [exportando, setExportando] = useState(false);
  const [exportandoReceitas, setExportandoReceitas] = useState(false);
  const [acao, setAcao] = useState<Acao>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [processando, setProcessando] = useState(false);

  const nomeFazenda = fazenda?.nome ?? "";
  const confirmado = confirmacao.trim().toLowerCase() === nomeFazenda.trim().toLowerCase();

  async function exportar() {
    if (!fazenda) return;
    setExportando(true);
    try {
      await exportarDadosDaFazenda(fazenda.id, fazenda.nome);
      toast.success("Download iniciado: uma planilha por módulo.");
    } catch {
      toast.error("Não conseguimos gerar o arquivo agora.");
    } finally {
      setExportando(false);
    }
  }

  async function exportarReceitas() {
    if (!fazenda) return;
    setExportandoReceitas(true);
    try {
      await exportarReceitasExcel(fazenda.id, fazenda.nome);
      toast.success("Download iniciado: planilha de receitas em Excel.");
    } catch {
      toast.error("Não conseguimos gerar o arquivo agora.");
    } finally {
      setExportandoReceitas(false);
    }
  }

  async function confirmar() {
    if (!fazenda || !confirmado) return;
    setProcessando(true);
    try {
      if (acao === "limpar") {
        await apagarRegistrosDaFazenda(fazenda.id);
        await queryClient.invalidateQueries();
        toast.success("Todos os registros foram apagados.");
        fechar();
      } else {
        await excluirContaAtual();
        queryClient.clear();
        await db.auth.signOut();
        navigate({ to: "/", replace: true });
      }
    } catch {
      toast.error("Não conseguimos concluir agora. Tente novamente em instantes.");
    } finally {
      setProcessando(false);
    }
  }

  function fechar() {
    setAcao(null);
    setConfirmacao("");
  }

  return (
    <CartaoConfig
      id="dados"
      titulo="Dados da conta"
      descricao="Leve seus dados embora ou apague tudo quando quiser."
      tom="atencao"
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportar} disabled={exportando || !fazenda}>
          {exportando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          Exportar meus dados
        </Button>
        <Button
          variant="outline"
          onClick={exportarReceitas}
          disabled={exportandoReceitas || !fazenda}
        >
          {exportandoReceitas ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="size-4" aria-hidden="true" />
          )}
          Exportar receitas (Excel)
        </Button>
        <Button variant="outline" onClick={() => setAcao("limpar")} disabled={!fazenda}>
          <Trash2 className="size-4" aria-hidden="true" />
          Apagar todos os registros
        </Button>
        <Button variant="destructive" onClick={() => setAcao("excluir")} disabled={!fazenda}>
          Excluir minha conta
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        A exportação gera um arquivo .zip com uma planilha para rebanho, manejo, leite, reprodução,
        financeiro e calendário.
      </p>

      <Dialog open={acao !== null} onOpenChange={(v) => (!v ? fechar() : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-left">
              {acao === "limpar" ? "Apagar todos os registros?" : "Excluir sua conta?"}
            </DialogTitle>
            <DialogDescription className="text-left">
              {acao === "limpar"
                ? "Rebanho, manejo, leite, reprodução, financeiro e calendário serão apagados. A fazenda e a sua conta continuam."
                : "Sua conta e as fazendas em que você é dono serão apagadas para sempre. Não dá para desfazer."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="confirmar-nome">
              Digite <span className="font-semibold">{nomeFazenda}</span> para confirmar
            </Label>
            <Input
              id="confirmar-nome"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={processando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmar} disabled={!confirmado || processando}>
              {processando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {acao === "limpar" ? "Apagar tudo" : "Excluir conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CartaoConfig>
  );
}
