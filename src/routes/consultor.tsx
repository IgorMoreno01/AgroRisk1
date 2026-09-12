import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppLayout, Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { RecommendationCard } from "@/components/recommendation-card";
import { NextBestActionCard } from "@/components/next-best-action";
import { AlertTriangle, Building2, Database, FileText } from "lucide-react";
import { RequireProfile } from "@/components/require-profile";
import { PersonaV2RiskPanel } from "@/components/persona-v2-risk-panel";
import { getStoredSessionToken } from "@/lib/auth";
import {
  evaluateConsultorRiskBatch,
  getConsultorDashboard,
  getConsultorPreventiveData,
} from "@/lib/api/consultor-dashboard.functions";
import type { ConsultorDashboardSnapshot } from "@/lib/consultor-dashboard-types";
import { ConsultorPreventiveOverview } from "@/components/consultor-preventive-overview";
import { selectConsultorPriorityOperationIds } from "@/lib/consultor-risk-selection";

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
  const [riskAttempt, setRiskAttempt] = useState(0);
  const [riskErrorByClient, setRiskErrorByClient] = useState<Record<string, string>>({});
  const [preventiveOverview, setPreventiveOverview] = useState<ConsultorDashboardSnapshot["preventiveOverview"] | null>(null);
  const [preventiveLoading, setPreventiveLoading] = useState(false);
  const [preventiveError, setPreventiveError] = useState<string | null>(null);
  const requestedClients = useRef(new Set<string>());
  const priorityPublishedClients = useRef(new Set<string>());
  const priorityGeneration = useRef(0);
  const secondaryGeneration = useRef(0);
  const [priorityPublished, setPriorityPublished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const token = getStoredSessionToken();
    if (!token) return;
    void getConsultorDashboard({ data: { token } })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setLoadError(result.error);
        requestedClients.current.clear();
        priorityPublishedClients.current.clear();
        priorityGeneration.current += 1;
        secondaryGeneration.current += 1;
        setPriorityPublished(false);
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
  const recommendations = selected?.recommendation ? [selected.recommendation] : [];
  const topMachine = clientMachines[0];

  const loadMoreVisible = () => {
    if (!selected) return;
    const token = getStoredSessionToken();
    const operationIds = selectConsultorPriorityOperationIds({
      operations: selected.operations,
      machines: selected.machinesData,
      areas: selected.areasData,
      evaluatedOperationIds: selected.evaluatedOperationIds,
      limit: 3,
    });
    if (!token || operationIds.length === 0) return;
    if (!priorityPublished) return;
    const generation = ++secondaryGeneration.current;
    setRiskErrorByClient((current) => {
      const next = { ...current };
      delete next[selected.client.id];
      return next;
    });
    void evaluateConsultorRiskBatch({
      data: { token, clientId: selected.client.id, operationIds, limit: operationIds.length },
    }).then((result) => {
      if (generation !== secondaryGeneration.current) return;
      if (!result.ok) throw new Error(result.error);
      setSnapshot((current) => current ? {
        ...current,
        clients: current.clients.map((item) => item.client.id === result.client.client.id ? result.client : item),
      } : current);
      const errors = result.client.riskErrorsByOperationId ?? {};
      if (Object.keys(errors).length) {
        setRiskErrorByClient((current) => ({
          ...current,
          [selected.client.id]: Object.entries(errors).map(([id, message]) => `${id}: ${message}`).join(" "),
        }));
      }
    }).catch((error) => {
      if (generation !== secondaryGeneration.current) return;
      setRiskErrorByClient((current) => ({
        ...current,
        [selected.client.id]: error instanceof Error ? error.message : "Não foi possível calcular os itens visíveis.",
      }));
    });
  };

  const loadPreventiveOverview = () => {
    const token = getStoredSessionToken();
    if (!token || preventiveLoading) return;
    setPreventiveLoading(true);
    setPreventiveError(null);
    void getConsultorPreventiveData({ data: { token } })
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setPreventiveOverview(result.overview);
      })
      .catch((error) => setPreventiveError(error instanceof Error ? error.message : "Não foi possível carregar os dados preventivos."))
      .finally(() => setPreventiveLoading(false));
  };

  useEffect(() => {
    // A response for a previously selected client must never replace the
    // currently visible client after the selection changes.
    priorityGeneration.current += 1;
    secondaryGeneration.current += 1;
    setPriorityPublished(priorityPublishedClients.current.has(clientId));
  }, [clientId]);

  useEffect(() => {
    if (!snapshot || !selected || selected.summary || requestedClients.current.has(selected.client.id)) return;
    const token = getStoredSessionToken();
    if (!token) return;
    const operationIds = selectConsultorPriorityOperationIds({
      operations: selected.operations,
      machines: selected.machinesData,
      areas: selected.areasData,
      evaluatedOperationIds: selected.evaluatedOperationIds,
      limit: 1,
    });
    const timer = window.setTimeout(() => {
      requestedClients.current.add(selected.client.id);
      const generation = priorityGeneration.current;
      void evaluateConsultorRiskBatch({
        data: { token, clientId: selected.client.id, operationIds, limit: 1 },
      }).then((result) => {
        if (generation !== priorityGeneration.current) {
          requestedClients.current.delete(selected.client.id);
          return;
        }
        if (!result.ok) throw new Error(result.error);
        setSnapshot((current) => current ? {
          ...current,
          clients: current.clients.map((item) =>
            item.client.id === result.client.client.id ? result.client : item),
        } : current);
        setRiskErrorByClient((current) => {
          const next = { ...current };
          const errors = Object.entries(result.client.riskErrorsByOperationId ?? {});
          if (errors.length) next[selected.client.id] = errors.map(([id, message]) => `${id}: ${message}`).join(" ");
          else delete next[selected.client.id];
          return next;
        });
        if (!Object.keys(result.client.riskErrorsByOperationId ?? {}).length) {
          priorityPublishedClients.current.add(selected.client.id);
          setPriorityPublished(true);
        }
      }).catch(() => {
        if (generation !== priorityGeneration.current) return;
        requestedClients.current.delete(selected.client.id);
        setRiskErrorByClient((current) => ({
          ...current,
          [selected.client.id]: "Não foi possível calcular os scores deste cliente.",
        }));
      });
    }, 75);
    return () => window.clearTimeout(timer);
  }, [snapshot, selected, clientId, riskAttempt]);

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
          <SectionTitle title="Carregando carteira" description="Carregando dados relacionais…" />
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        </Card>
      </AppLayout>
    );
  }

  if (!selected || !client) {
    return (
      <AppLayout title="Visão do Consultor" subtitle="Análise consolidada por cliente e recomendações preventivas">
        <Card>
          <SectionTitle title="Carteira sem clientes" description="Nenhum cliente está associado ao escopo autorizado desta conta." />
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
        {`${snapshot.source === "postgres" ? "PostgreSQL" : "Dados demonstrativos"} · ${snapshot.scopeRule} · alertas persistentes`}
      </div>

      {topMachine && (
        <PersonaV2RiskPanel
          persona="consultor"
          result={topMachine.evaluation.result}
          evaluation={topMachine.evaluation}
        />
      )}

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
                 <Stat label="Máquinas" value={String(selected.machinesData.length)} />
                 <Stat label="Score médio" value={cs ? String(cs.score) : "Calculando..."} />
                 <Stat label="Máq. risco alto" value={cs ? String(cs.machinesHigh) : "Calculando..."} />
                 <Stat label="Área crítica" value={cs?.topAreaName ?? "Calculando..."} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Status geral" />
          <div className="flex flex-col items-center gap-2 py-2">
             <div className="text-5xl font-semibold tabular-nums text-foreground">{cs?.score ?? "—"}</div>
            {cs && <RiskBadge score={cs.score} />}
            <p className="text-center text-xs text-muted-foreground">
               Fator consolidado: <span className="font-medium text-foreground">{cs?.mainFactor ?? "Calculando..."}</span>
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
            {clientMachines.length === 0 && selected.machinesData.slice(0, 3).map((machine, i) => (
              <div key={machine.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{machine.name}</div>
                  <div className="text-xs text-muted-foreground">{machine.id} · {machine.area}</div>
                </div>
                <span className="text-sm text-muted-foreground">Calculando...</span>
              </div>
            ))}
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
            {selected.evaluatedOperationIds.length < selected.operations.length && (
              <button type="button" onClick={loadMoreVisible} disabled={!priorityPublished} className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60">
                {priorityPublished ? "Carregar mais itens visíveis" : "Calculando item prioritário..."}
              </button>
            )}
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
            {clientAreas.length === 0 && selected.areasData.slice(0, 3).map((area, i) => (
              <li key={area.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{area.name}</div>
                  <div className="text-xs text-muted-foreground">{area.condition}</div>
                </div>
                <span className="text-sm text-muted-foreground">Calculando...</span>
              </li>
            ))}
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
           {selected.composition ? (
             <div className="space-y-3">
               <CompositionRow label="Climático" score={selected.composition.climateScore} contribution={selected.composition.climateContribution} weight={snapshot!.weights.ml} />
               <CompositionRow label="Operacional" score={selected.composition.operationalScore} contribution={selected.composition.operationalContribution} weight={snapshot!.weights.operationalRules} />
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
           {selected.summary && selected.composition && selected.recommendation ? (
             <ConsultorExplanation
               summary={selected.summary}
               composition={selected.composition}
               recommendation={selected.recommendation}
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
               <p className="text-sm text-muted-foreground">Calculando...</p>
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
          {selected.explanation ? (
            <p className="text-sm leading-relaxed text-foreground">{selected.explanation}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados suficientes para explicar o risco.</p>
          )}
          {topMachine && (
            <p className="mt-3 text-sm text-muted-foreground">
              Destaque operacional: <strong>{topMachine.machine.name}</strong> (score {topMachine.score}).
            </p>
          )}
          {selected.nextAction && <div className="mt-4"><NextBestActionCard action={selected.nextAction} /></div>}
          {riskErrorByClient[selected.client.id] && (
            <div className="mt-3 flex items-center gap-3 text-xs text-danger">
              <p>{riskErrorByClient[selected.client.id]}</p>
              <button
                type="button"
                className="rounded-md border border-danger/40 px-2 py-1 font-medium"
                onClick={() => {
                  requestedClients.current.delete(selected.client.id);
                  priorityGeneration.current += 1;
                  setRiskAttempt((value) => value + 1);
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
        </Card>
        </section>
      </div>

      <section className="mt-6">
        {preventiveOverview ? (
          <ConsultorPreventiveOverview overview={preventiveOverview} />
        ) : (
          <Card>
            <SectionTitle title="Análise preventiva da carteira" description="Dados preventivos são carregados somente quando solicitados." />
            {preventiveError && <p className="mb-3 text-sm text-danger">{preventiveError}</p>}
            <button type="button" onClick={loadPreventiveOverview} disabled={preventiveLoading} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60">
              {preventiveLoading ? "Carregando..." : "Carregar análise preventiva"}
            </button>
          </Card>
        )}
      </section>
    </AppLayout>
  );
}

function componentLabel(component: "climate" | "operational" | "balanced") {
  return component === "climate" ? "Climático" : component === "operational" ? "Operacional" : "Balanceado";
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

function ConsultorExplanation({
  summary,
  composition,
  recommendation,
}: {
  summary: NonNullable<ConsultorDashboardSnapshot["clients"][number]["summary"]>;
  composition: NonNullable<ConsultorDashboardSnapshot["clients"][number]["composition"]>;
  recommendation: NonNullable<ConsultorDashboardSnapshot["clients"][number]["recommendation"]>;
}) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <p>O score consolidado é <strong>{summary.score}/100</strong>, classificado como <strong>risco {summary.level}</strong>.</p>
      <p className="text-muted-foreground">
        A principal origem é {componentLabel(composition.dominantComponent).toLowerCase()}, com maior recorrência de {summary.mainFactor.toLowerCase()}.
      </p>
      <p>Orientação preventiva: <strong>{recommendation.title.toLowerCase()}</strong>. {recommendation.rationale}</p>
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
