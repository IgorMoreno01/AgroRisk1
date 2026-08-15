import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout, Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { RiskComposition } from "@/components/risk-composition";
import { RecommendationCard } from "@/components/recommendation-card";
import { NextBestActionCard } from "@/components/next-best-action";
import { clients, machinesByClient } from "@/lib/mock-data";
import { scoreClient, scoreMachine, scoreArea } from "@/lib/risk-score";
import { areas as allAreas } from "@/lib/mock-data";
import {
  recommendationsForClient, clientExplanation, nextBestActionForMachine,
} from "@/lib/recommendations";
import { Building2, FileText, AlertTriangle } from "lucide-react";
import { RequireProfile } from "@/components/require-profile";
import { ProfileAlertsSection } from "@/components/profile-alerts-section";
import { getProfileAlerts } from "@/lib/profile-alerts";

export const Route = createFileRoute("/consultor")({
  head: () => ({ meta: [{ title: "AgroRisk · Consultor" }] }),
  component: () => (
    <RequireProfile path="/consultor">
      <ConsultorPage />
    </RequireProfile>
  ),
});

function ConsultorPage() {
  const [clientId, setClientId] = useState(clients[0].id);
  const client = clients.find((c) => c.id === clientId)!;
  const cs = scoreClient(client.id);

  const clientMachines = machinesByClient(client.id)
    .map((m) => ({ m, b: scoreMachine(m.id) }))
    .sort((a, b) => b.b.total - a.b.total);

  const clientAreas = allAreas
    .filter((a) => a.clientId === client.id)
    .map((a) => scoreArea(a.id))
    .sort((a, b) => b.score - a.score);

  // Fatores mais recorrentes nas máquinas do cliente
  const tally: Record<string, number> = {};
  clientMachines.forEach(({ b }) => {
    b.parts.forEach((p) => {
      if (p.points > 0) tally[p.label] = (tally[p.label] ?? 0) + p.points;
    });
  });
  const totalPts = Object.values(tally).reduce((s, n) => s + n, 0) || 1;
  const factors = Object.entries(tally)
    .map(([label, pts]) => ({ label, weight: Math.round((pts / totalPts) * 100) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);

  // Composição do cliente: média ponto-a-ponto das máquinas
  const avgParts = clientMachines[0].b.parts.map((p, idx) => {
    const points = Math.round(
      clientMachines.reduce((s, { b }) => s + b.parts[idx].points, 0) / clientMachines.length,
    );
    return { ...p, points, detail: `Média da frota do cliente` };
  });
  const clientBreakdown = { total: cs.score, level: cs.level, parts: avgParts, mainFactor: cs.topFactor };

  const recommendations = recommendationsForClient(client.id, "consultor");
  const topMachineId = clientMachines[0]?.m.id;
  const nextAction = topMachineId
    ? nextBestActionForMachine(topMachineId)
    : undefined;
  const narrative = clientExplanation(client.id);

  const topMachine = clientMachines[0];

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

      <div id="analise" className="grid scroll-mt-20 gap-4 lg:grid-cols-3">
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
              Principal fator: <span className="font-medium text-foreground">{cs.topFactor}</span>
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
                  <div className="text-xs text-muted-foreground">{m.id} · {m.area} · {b.mainFactor}</div>
                </div>
                <ScoreBar score={b.total} />
                <RiskBadge score={b.total} />
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
            description="Média dos pontos por fator entre as máquinas"
          />
          <RiskComposition breakdown={clientBreakdown} compact />
        </Card>

        <Card>
          <SectionTitle
            title="Fatores recorrentes na frota"
            description="Contribuição relativa ao score do cliente"
          />
          <ul className="space-y-3">
            {factors.map((f) => (
              <li key={f.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    {f.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{f.weight}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-secondary" style={{ width: `${f.weight}%` }} />
                </div>
              </li>
            ))}
          </ul>
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
          <div className="space-y-3 text-sm leading-relaxed text-foreground">
            <p>
              Olá, <strong>{client.name}</strong>. O score médio da sua frota está em{" "}
              <strong>{cs.score}/100</strong>, classificado como{" "}
              <strong>risco {cs.level}</strong>.
            </p>
            <p>{narrative}</p>
            {topMachine && (
              <p className="text-muted-foreground">
                Destaque para o equipamento <strong>{topMachine.m.name}</strong> (score {topMachine.b.total}) —
                ação principal sugerida abaixo.
              </p>
            )}
          </div>
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
