import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { RecommendationCard } from "@/components/recommendation-card";
import { NextBestActionCard } from "@/components/next-best-action";
import { AlertTriangle, Building2, Database, FileText } from "lucide-react";
import { RequireProfile } from "@/components/require-profile";
import { PersonaV2RiskPanel } from "@/components/persona-v2-risk-panel";
import { getStoredSessionToken } from "@/lib/auth";
import { getConsultorDashboard } from "@/lib/api/consultor-dashboard.functions";
import type { ConsultorDashboardSnapshot } from "@/lib/consultor-dashboard-types";

export const Route = createFileRoute("/consultor")({
  head: () => ({ meta: [{ title: "AgroRisk · Consultor" }] }),
  component: () => (
    <RequireProfile path="/consultor">
      <ConsultorPage />
    </RequireProfile>
  ),
});

function ConsultorPage() {
  const [snapshot, setSnapshot] = useState<ConsultorDashboardSnapshot | null>(null);
  const [clientId, setClientId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const token = getStoredSessionToken();
    if (!token) return;
    void getConsultorDashboard({ data: { token } })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setLoadError(result.error);
        setSnapshot(result.snapshot);
        setClientId((current) => current || result.snapshot.clients[0]?.client.id || "");
      })
      .catch(() => {
        if (!cancelled) setLoadError("Não foi possível carregar a carteira.");
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const clients = snapshot?.clients ?? [];
  const selected = clients.find((item) => item.client.id === clientId) ?? clients[0];
  const client = selected?.client;
  const cs = selected?.summary;
  const clientMachines = selected?.machines ?? [];
  const clientAreas = selected?.areas ?? [];
  const recommendations = selected ? [selected.recommendation] : [];
  const topMachine = clientMachines[0];

  if (loadError) {
    return (
      <AppLayout title="Visão do Consultor" subtitle="Análise consolidada por cliente e recomendações preventivas">
        <Card>
          <SectionTitle title="Não foi possível carregar a carteira" description={loadError} />
          <button
            onClick={() => setAttempt((value) => value + 1)}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Tentar novamente
          </button>
        </Card>
      </AppLayout>
    );
  }

  if (!snapshot) {
    return (
      <AppLayout title="Visão do Consultor" subtitle="Análise consolidada por cliente e recomendações preventivas">
        <Card>
          <SectionTitle title="Carregando carteira" description="Consultando clientes e riscos calculados…" />
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        </Card>
      </AppLayout>
    );
  }

  if (!selected || !client || !cs) {
    return (
      <AppLayout title="Visão do Consultor" subtitle="Análise consolidada por cliente e recomendações preventivas">
        <Card>
          <SectionTitle title="Carteira sem clientes" description="Nenhum cliente está associado ao escopo demonstrativo atual." />
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Visão do Consultor" subtitle="Análise consolidada por cliente e recomendações preventivas">
      <div id="clientes" className="mb-5 flex scroll-mt-20 flex-wrap gap-2">
        {clients.map(({ client: c }) => {
          const active = c.id === clientId;
          return (
            <button
              key={c.id}
              onClick={() => setClientId(c.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        {`${snapshot.source === "postgres" ? "PostgreSQL" : "Dados demonstrativos"} · ${snapshot.scopeRule} · alertas demo`}
      </div>

      <PersonaV2RiskPanel persona="consultor" />

      <div id="analise" className="mt-6 grid scroll-mt-20 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="Resumo do cliente" />
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10 text-info">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-foreground">{client?.name ?? "Carregando…"}</div>
              <div className="text-sm text-muted-foreground">{client ? `${client.location} · ID ${client.id}` : "Aguarde um instante"}</div>
              <div className="mt-3 grid grid-cols-4 gap-4">
                <Stat label="Máquinas" value={client ? String(client.machines) : "…"} />
                <Stat label="Score médio" value={cs ? String(cs.score) : "…"} />
                <Stat label="Máq. risco alto" value={cs ? String(cs.machinesHigh) : "…"} />
                <Stat label="Área crítica" value={cs?.topAreaName ?? "…"} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Status geral" />
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="text-5xl font-semibold tabular-nums text-foreground">{cs?.score ?? "…"}</div>
            {cs && <RiskBadge score={cs.score} />}
            <p className="text-center text-xs text-muted-foreground">
               Fator consolidado: <span className="font-medium text-foreground">{cs?.mainFactor ?? "…"}</span>
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section id="equipamentos-risco" className="scroll-mt-20">
        <Card>
          <SectionTitle
            title="Top 3 equipamentos com maior risco"
            description="Ordenado por score calculado"
          />
          <div className="space-y-2">
            {clientMachines.slice(0, 3).map((row, i) => (
              <div key={row.machine.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${
                  i === 0 ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground"
                }`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{row.machine.name}</div>
                  <div className="text-xs text-muted-foreground">{row.machine.id} · {row.machine.area} · {row.mainFactor}</div>
                </div>
                <ScoreBar score={row.score} />
                <RiskBadge score={row.score} />
              </div>
            ))}
          </div>
        </Card>
        </section>

        <section id="areas-criticas" className="scroll-mt-20">
        <Card>
          <SectionTitle
            title="Top 3 áreas mais críticas"
            description="Score médio por área do cliente"
          />
          <ul className="space-y-2">
            {clientAreas.slice(0, 3).map((row, i) => (
              <li key={row.area.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${
                  i === 0 ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground"
                }`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{row.area.name}</div>
                  <div className="text-xs text-muted-foreground">{row.area.condition} · fator: {row.mainFactor}</div>
                </div>
                <ScoreBar score={row.score} />
                <RiskBadge score={row.score} />
              </li>
            ))}
          </ul>
        </Card>
        </section>
      </div>


      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle
            title="Composição do score do cliente"
             description="Fatores internos consolidados pelo Risk Engine"
          />
           {selected ? (
             <div className="space-y-3">
               <CompositionRow label="Modelo ML" score={selected.composition.mlScore} contribution={selected.composition.mlContribution} weight={snapshot!.weights.ml} />
               <CompositionRow label="Regras operacionais" score={selected.composition.operationalRulesScore} contribution={selected.composition.operationalRulesContribution} weight={snapshot!.weights.operationalRules} />
               <div className="text-xs text-muted-foreground">
                 Componente dominante: <span className="font-medium text-foreground">{componentLabel(selected.composition.dominantComponent)}</span>
               </div>
               <div className="text-xs text-muted-foreground">
                 Fatores recorrentes: <span className="font-medium text-foreground">{selected.recurringFactors.slice(0, 3).map((item) => `${item.factor} (${item.count})`).join(", ") || "nenhum"}</span>
               </div>
             </div>
           ) : (
             <p className="text-sm text-muted-foreground">Sem dados suficientes para compor o score.</p>
           )}
        </Card>

        <Card>
          <SectionTitle
            title="Origem do risco"
            description="Explicação preventiva baseada no resultado central"
          />
          {selected ? (
            <ConsultorExplanation selected={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados suficientes para explicar o risco.</p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section id="recomendacoes" className="scroll-mt-20">
        <Card>
          <SectionTitle
            title="Recomendações preventivas"
            description="Geradas a partir do score, ranking e fatores do cliente"
          />
          <div className="space-y-3">
            {recommendations.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem recomendações ativas no momento.</p>
            )}
            {recommendations.map((r) => (
              <RecommendationCard key={r.id} rec={r} />
            ))}
          </div>
        </Card>
        </section>

        <section id="explicacao" className="scroll-mt-20">
        <Card className="border-secondary/30 bg-secondary/5">
          <SectionTitle
            title="Explicação para o cliente"
            description="Texto sugerido em linguagem acessível"
            action={
              <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted">
                <FileText className="h-3.5 w-3.5" /> Exportar
              </button>
            }
          />
          {selected ? (
            <p className="text-sm leading-relaxed text-foreground">{selected.explanation}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados suficientes para explicar o risco.</p>
          )}
          {topMachine && (
            <p className="mt-3 text-sm text-muted-foreground">
              Destaque operacional: <strong>{topMachine.machine.name}</strong> (score {topMachine.score}).
            </p>
          )}
          {selected && <div className="mt-4"><NextBestActionCard action={selected.nextAction} /></div>}
        </Card>
        </section>
      </div>

      <div className="mt-6">
        <Card>
          <SectionTitle
            title="Alertas do cliente · demonstração"
            description={`Alertas demonstrativos compatíveis com ${client.name}`}
          />
          <div className="space-y-2">
            {selected.alerts.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum alerta demonstrativo compatível com este cliente.</p>
            )}
            {selected.alerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{alert.type}</span>
                    <RiskBadge level={alert.level} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{alert.machineId} · {alert.time} · demonstração</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}

function componentLabel(component: "ml" | "operational_rules" | "balanced") {
  return component === "ml" ? "Modelo ML" : component === "operational_rules" ? "Regras operacionais" : "Balanceado";
}

function CompositionRow({ label, score, contribution, weight }: { label: string; score: number; contribution: number; weight: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">score {score} · peso {weight}% · contribuição {contribution.toFixed(1)}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, contribution))}%` }} />
      </div>
    </div>
  );
}

function ConsultorExplanation({ selected }: { selected: NonNullable<ConsultorDashboardSnapshot["clients"][number]> }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <p>O score consolidado é <strong>{selected.summary.score}/100</strong>, classificado como <strong>risco {selected.summary.level}</strong>.</p>
      <p className="text-muted-foreground">
        A principal origem é {componentLabel(selected.composition.dominantComponent).toLowerCase()}, com maior recorrência de {selected.summary.mainFactor.toLowerCase()}.
      </p>
      <p>Orientação preventiva: <strong>{selected.recommendation.title.toLowerCase()}</strong>. {selected.recommendation.rationale}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
