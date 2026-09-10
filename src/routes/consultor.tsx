import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout, Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { RiskComposition } from "@/components/risk-composition";
import { RecommendationCard } from "@/components/recommendation-card";
import { RiskExplanation } from "@/components/risk-explanation";
import { NextBestActionCard } from "@/components/next-best-action";
import { clients, machinesByClient } from "@/lib/mock-data";
import {
  scoreClientWithWeights, riskResultForClient, riskResultForMachine, scoreAreaWithWeights,
  dominantFactorLabel,
} from "@/lib/risk-score";
import { areas as allAreas } from "@/lib/mock-data";
import {
  recommendationsForClient, nextBestActionForMachine,
} from "@/lib/recommendations";
import { Building2, FileText } from "lucide-react";
import { RequireProfile } from "@/components/require-profile";
import { ProfileAlertsSection } from "@/components/profile-alerts-section";
import { getProfileAlerts } from "@/lib/profile-alerts";
import { useRiskConfig } from "@/lib/risk-config";
import { PersonaV2RiskPanel } from "@/components/persona-v2-risk-panel";

export const Route = createFileRoute("/consultor")({
  head: () => ({ meta: [{ title: "AgroRisk · Consultor" }] }),
  component: () => (
    <RequireProfile path="/consultor">
      <ConsultorPage />
    </RequireProfile>
  ),
});

function ConsultorPage() {
  const { weights } = useRiskConfig();
  const [clientId, setClientId] = useState(clients[0].id);
  const client = clients.find((c) => c.id === clientId)!;
  const cs = scoreClientWithWeights(client.id, weights);
  const clientResult = riskResultForClient(client.id, weights);

  const clientMachines = machinesByClient(client.id)
    .map((m) => ({ m, b: riskResultForMachine(m.id, weights) }))
    .sort((a, b) => b.b.finalScore - a.b.finalScore);

  const clientAreas = allAreas
    .filter((a) => a.clientId === client.id)
    .map((a) => scoreAreaWithWeights(a.id, weights))
    .sort((a, b) => b.score - a.score);

  const recommendations = recommendationsForClient(client.id, "consultor", { weights });
  const topMachine = clientMachines[0];
  const nextAction = topMachine
    ? nextBestActionForMachine(topMachine.m.id, { weights, result: topMachine.b })
    : undefined;

  return (
    <AppLayout title="Visão do Consultor" subtitle="Análise consolidada por cliente e recomendações preventivas">
      <div id="clientes" className="mb-5 flex scroll-mt-20 flex-wrap gap-2">
        {clients.map((c) => {
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

      <PersonaV2RiskPanel persona="consultor" />

      <div id="analise" className="mt-6 grid scroll-mt-20 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="Resumo do cliente" />
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10 text-info">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-foreground">{client.name}</div>
              <div className="text-sm text-muted-foreground">{client.location} · ID {client.id}</div>
              <div className="mt-3 grid grid-cols-4 gap-4">
                <Stat label="Máquinas" value={String(client.machines)} />
                <Stat label="Score médio" value={String(cs.score)} />
                <Stat label="Máq. risco alto" value={String(cs.machinesHigh)} />
                <Stat label="Área crítica" value={cs.topAreaName} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Status geral" />
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="text-5xl font-semibold tabular-nums text-foreground">{cs.score}</div>
            <RiskBadge score={cs.score} />
            <p className="text-center text-xs text-muted-foreground">
              Componente consolidado: <span className="font-medium text-foreground">{cs.topFactor}</span>
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
            {clientMachines.slice(0, 3).map(({ m, b }, i) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${
                  i === 0 ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground"
                }`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.id} · {m.area} · {dominantFactorLabel(b.dominantFactor)}</div>
                </div>
                <ScoreBar score={b.finalScore} />
                <RiskBadge score={b.finalScore} />
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
            {clientAreas.slice(0, 3).map((a, i) => (
              <li key={a.areaId} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${
                  i === 0 ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground"
                }`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.condition} · fator: {a.topFactor}</div>
                </div>
                <ScoreBar score={a.score} />
                <RiskBadge score={a.score} />
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
           {clientResult ? (
             <RiskComposition breakdown={clientResult.breakdown} compact />
           ) : (
             <p className="text-sm text-muted-foreground">Sem dados suficientes para compor o score.</p>
           )}
        </Card>

        <Card>
          <SectionTitle
            title="Origem do risco"
            description="Explicação preventiva baseada no resultado central"
          />
          {clientResult ? (
            <RiskExplanation
              result={clientResult}
              weights={weights}
              recommendation={recommendations[0]}
              audience="consultor"
            />
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
          {clientResult ? (
            <RiskExplanation
              result={clientResult}
              weights={weights}
              recommendation={recommendations[0]}
              audience="consultor"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados suficientes para explicar o risco.</p>
          )}
          {topMachine && (
            <p className="mt-3 text-sm text-muted-foreground">
              Destaque operacional: <strong>{topMachine.m.name}</strong> (score {topMachine.b.finalScore}).
            </p>
          )}
          {nextAction && <div className="mt-4"><NextBestActionCard action={nextAction} /></div>}
        </Card>
        </section>
      </div>

      {/* Alertas do cliente (US 5 · personalização por perfil) */}
      <div className="mt-6">
        <ProfileAlertsSection bundle={getProfileAlerts("consultor")} />
      </div>
    </AppLayout>
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
