import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataCurta, hojeISO } from "@/lib/formato";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  head: () => ({
    meta: [
      { title: "Relatório do veterinário — Curral Online" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Atendimentos,
});

const TIPO: Record<string, string> = {
  vacina: "Vacina",
  vermifugo: "Vermífugo",
  tratamento: "Tratamento",
  outro: "Outro manejo",
  cobertura: "Cobertura",
  inseminacao: "Inseminação",
  diagnostico: "Diagnóstico",
  parto: "Parto",
  secagem: "Secagem",
  primeiro_cio: "Primeiro cio",
};

function nomeMes(mes: string) {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Relatório mensal de quem atende como veterinário: em cada fazenda
 * compartilhada, os dias de atendimento (registros lançados pela pessoa),
 * a sanidade e a reprodução do mês. Sai também em Excel.
 */
function Atendimentos() {
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const rel = useQuery({
    queryKey: ["relatorio-veterinario", mes],
    enabled: /^\d{4}-\d{2}$/.test(mes),
    queryFn: async () => {
      const { data, error } = await db.equipe.relatorioVeterinario(mes);
      if (error) throw new Error(error.message);
      return data!;
    },
  });

  async function baixar() {
    const r = rel.data;
    if (!r) return;
    try {
      const { construirXLSXAbas, baixarBytesXLSX } = await import("@/lib/xlsx");
      const titulo = `Relatório do veterinário · ${nomeMes(r.mes)}`;
      const sub = `${r.veterinario ?? ""} · ${dataCurta(r.inicio)} a ${dataCurta(r.fim)}`;
      const bytes = construirXLSXAbas([
        {
          nome: "Resumo",
          titulo,
          subtitulo: sub,
          colunas: [
            "Fazenda",
            "Local",
            "Proprietário",
            "Dias de atendimento",
            "Vacinas",
            "Vermífugos",
            "Tratamentos",
            "Serviços (cobertura/IA)",
            "Diagnósticos +",
            "Diagnósticos −",
            "Partos",
          ],
          linhas: r.fazendas.map((f) => [
            f.nome,
            f.local || "—",
            f.dono || "—",
            f.atendimentos.length,
            f.sanidade.vacinas,
            f.sanidade.vermifugos,
            f.sanidade.tratamentos,
            f.reproducao.servicos,
            f.reproducao.diagnosticosPositivos,
            f.reproducao.diagnosticosNegativos,
            f.reproducao.partos,
          ]),
        },
        {
          nome: "Registros",
          titulo,
          subtitulo: sub,
          colunas: ["Data", "Fazenda", "Área", "Tipo", "Animal", "Detalhe", "Lançado por você"],
          linhas: r.fazendas.flatMap((f) =>
            f.registros.map((x) => [
              dataCurta(x.data),
              f.nome,
              x.area,
              TIPO[x.tipo] ?? x.tipo,
              x.animal || "—",
              x.detalhe || "",
              x.seu ? "sim" : "",
            ]),
          ),
        },
      ]);
      baixarBytesXLSX(`relatorio-veterinario-${r.mes}.xlsx`, bytes);
    } catch {
      toast.error("Não conseguimos gerar a planilha agora.");
    }
  }

  const r = rel.data;
  return (
    <AppShell
      titulo="Relatório do veterinário"
      acao={
        <Button onClick={baixar} disabled={!r || r.fazendas.length === 0}>
          <FileSpreadsheet className="size-4" aria-hidden="true" />
          Baixar Excel
        </Button>
      }
    >
      <div className="mb-4 max-w-[220px] space-y-1.5">
        <Label htmlFor="mes-relatorio">Mês</Label>
        <Input
          id="mes-relatorio"
          type="month"
          value={mes}
          max={hojeISO().slice(0, 7)}
          onChange={(e) => setMes(e.target.value)}
        />
      </div>

      {rel.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : rel.isError ? (
        <p className="text-sm text-destructive">Não conseguimos carregar o relatório agora.</p>
      ) : !r || r.fazendas.length === 0 ? (
        <div className="max-w-xl rounded-xl border border-border bg-card p-5 text-sm">
          <Stethoscope className="mb-2 size-5 text-primary" aria-hidden="true" />
          Você ainda não atende nenhuma fazenda como veterinário. Peça ao produtor para convidar
          você em Configurações → Equipe e veterinário.
        </div>
      ) : (
        <div className="space-y-4">
          {r.fazendas.map((f) => (
            <section key={f.id} className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-base font-semibold">{f.nome}</h2>
                <p className="text-xs text-muted-foreground">
                  {[f.local, f.dono ? `proprietário: ${f.dono}` : ""].filter(Boolean).join(" · ") ||
                    "—"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:grid-cols-4 lg:grid-cols-7">
                {[
                  ["Dias de atendimento", f.atendimentos.length],
                  ["Vacinas", f.sanidade.vacinas],
                  ["Vermífugos", f.sanidade.vermifugos],
                  ["Tratamentos", f.sanidade.tratamentos],
                  ["Serviços", f.reproducao.servicos],
                  [
                    "Diagnósticos",
                    `${f.reproducao.diagnosticosPositivos}+ / ${f.reproducao.diagnosticosNegativos}−`,
                  ],
                  ["Partos", f.reproducao.partos],
                ].map(([rotulo, valor]) => (
                  <div key={String(rotulo)}>
                    <p className="text-[11px] text-muted-foreground">{rotulo}</p>
                    <p className="font-display text-lg font-extrabold">{valor}</p>
                  </div>
                ))}
              </div>
              {f.registros.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">
                  Nenhum registro de sanidade ou reprodução neste mês.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {f.registros.map((x, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                      <span>
                        <span className="font-medium">{TIPO[x.tipo] ?? x.tipo}</span>
                        {x.animal ? ` · ${x.animal}` : ""}
                        {x.detalhe ? (
                          <span className="text-muted-foreground"> · {x.detalhe}</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dataCurta(x.data)}
                        {x.seu ? " · lançado por você" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
