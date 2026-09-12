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
import type { GeneratedRecommendation } from "@/lib/recommendations";
import type { RiskEngineV2Result } from "@/lib/risk-engine-v2/types";
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
  const [riskLoadingByClient, setRiskLoadingByClient] = useState<Record<string, boolean>>({});
  const [equipmentLoadingByClient, setEquipmentLoadingByClient] = useState<Record<string, boolean>>({});
  const [requestedEquipmentOperationIds, setRequestedEquipmentOperationIds] = useState<Record<string, string[]>>({});
  const [preventiveOverview, setPreventiveOverview] = useState<ConsultorDashboardSnapshot["preventiveOverview"] | null>(null);
  const [preventiveLoading, setPreventiveLoading] = useState(false);
  const [preventiveError, setPreventiveError] = useState<string | null>(null);
  const requestedClients = useRef(new Set<string>());
  const priorityPublishedClients = useRef(new Set<string>());
  const priorityGeneration = useRef(0);
  const priorityRequestByClient = useRef<Record<string, number>>({});
  const priorityOperationByClient = useRef<Record<string, string>>({});
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
  const visibleEquipmentOperationIds = requestedEquipmentOperationIds[selected?.client.id ?? ""] ?? [];
  const visibleEquipmentOperationIdSet = new Set(visibleEquipmentOperationIds);
  const clientMachines = (selected?.machines ?? []).filter(
    (row) => row.operation && visibleEquipmentOperationIdSet.has(String(row.operation.id)),
  );
  const clientAreas = selected?.areas ?? [];
  const recommendations = selected?.recommendation ? [selected.recommendation] : [];
  const topMachine = clientMachines.find(
    (row) => row.operation?.id === priorityOperationByClient.current[selected?.client.id ?? ""],
  ) ?? clientMachines[0];
  const priorityArea = clientAreas.find((row) => row.area.id === topMachine?.machine.areaId);
  const priorityResult = topMachine?.evaluation.result;
  const priorityLoading = Boolean(riskLoadingByClient[selected?.client.id ?? ""]);
  const priorityMlContribution = priorityResult?.contributions.find(
    (item) => item.component === "ml",
  )?.weightedContribution ?? 0;
  const priorityOperationalContribution = priorityResult?.contributions.find(
    (item) => item.component === "operational_rules",
  )?.weightedContribution ?? 0;
  const hasNoOperations = selected?.operations.length === 0;
  const equipmentLoading = Boolean(equipmentLoadingByClient[selected?.client.id ?? ""]);
  const hasMoreEligibleEquipment = Boolean(selected && selectConsultorPriorityOperationIds({
    operations: selected.operations,
    machines: selected.machinesData,
    areas: selected.areasData,
    evaluatedOperationIds: visibleEquipmentOperationIds,
    limit: 1,
  }).length);
  const noOperationsMessage = "Este cliente não possui operações monitoradas disponíveis.";

  const selectClient = (nextClientId: string) => {
    if (nextClientId === clientId) return;
    priorityGeneration.current += 1;
    secondaryGeneration.current += 1;
    requestedClients.current.delete(nextClientId);
    priorityPublishedClients.current.delete(nextClientId);
    delete priorityOperationByClient.current[nextClientId];
    setPriorityPublished(false);
    setRiskErrorByClient((current) => {
      const next = { ...current };
      delete next[nextClientId];
      return next;
    });
    setRiskLoadingByClient((current) => ({ ...current, [nextClientId]: false }));
    setEquipmentLoadingByClient((current) => ({ ...current, [nextClientId]: false }));
    setRequestedEquipmentOperationIds((current) => ({ ...current, [nextClientId]: [] }));
    setSnapshot((current) => current ? {
      ...current,
      clients: current.clients.map((item) => item.client.id === nextClientId ? {
        ...item,
        evaluatedOperationIds: [],
        riskErrorsByOperationId: {},
        summary: undefined,
        machines: [],
        areas: [],
        recurringFactors: [],
        composition: undefined,
        recommendation: undefined,
        nextAction: undefined,
        explanation: undefined,
      } : item),
    } : current);
    setClientId(nextClientId);
  };

  const loadMoreVisible = () => {
    if (!selected) return;
    const token = getStoredSessionToken();
    const operationIds = selectConsultorPriorityOperationIds({
      operations: selected.operations,
      machines: selected.machinesData,
      areas: selected.areasData,
      evaluatedOperationIds: visibleEquipmentOperationIds,
      limit: 3,
    });
    if (!token || operationIds.length === 0 || equipmentLoading) return;
    if (!priorityPublished) return;
    const generation = ++secondaryGeneration.current;
    setRequestedEquipmentOperationIds((current) => ({
      ...current,
      [selected.client.id]: [...new Set([...(current[selected.client.id] ?? []), ...operationIds.map(String)])],
    }));
    setEquipmentLoadingByClient((current) => ({ ...current, [selected.client.id]: true }));
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
    }).finally(() => {
      if (generation !== secondaryGeneration.current) return;
      setEquipmentLoadingByClient((current) => ({ ...current, [selected.client.id]: false }));
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
    requestedClients.current.delete(clientId);
    setRiskLoadingByClient((current) => ({ ...current, [clientId]: false }));
    setEquipmentLoadingByClient((current) => ({ ...current, [clientId]: false }));
    setPriorityPublished(priorityPublishedClients.current.has(clientId));
  }, [clientId]);

  useEffect(() => {
    if (!snapshot || !selected || requestedClients.current.has(selected.client.id)) return;
    const token = getStoredSessionToken();
    if (!token) return;
    const operationIds = selectConsultorPriorityOperationIds({
      operations: selected.operations,
      machines: selected.machinesData,
      areas: selected.areasData,
      evaluatedOperationIds: selected.evaluatedOperationIds,
      limit: 1,
    });
    if (operationIds.length === 0) return;
    setRequestedEquipmentOperationIds((current) => ({
      ...current,
      [selected.client.id]: [String(operationIds[0])],
    }));
    priorityOperationByClient.current[selected.client.id] = operationIds[0]!;
    requestedClients.current.add(selected.client.id);
    setRiskLoadingByClient((current) => ({ ...current, [selected.client.id]: true }));
    const generation = priorityGeneration.current;
    const requestId = (priorityRequestByClient.current[selected.client.id] ?? 0) + 1;
    priorityRequestByClient.current[selected.client.id] = requestId;
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
    }).finally(() => {
      if (priorityRequestByClient.current[selected.client.id] === requestId) {
        setRiskLoadingByClient((current) => ({ ...current, [selected.client.id]: false }));
      }
    });
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
              onClick={() => selectClient(c.id)}
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
          recommendation={selected.recommendation}
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
               <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Máquinas monitoradas" value={String(selected.machinesData.length)} />
                  <Stat label="Áreas monitoradas" value={String(selected.areasData.length)} />
                  <Stat label="Operações monitoradas" value={String(selected.operations.length)} />
                  <Stat label="Alertas do cliente" value={String(selected.alerts.length)} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Status geral" />
          <div className="flex flex-col items-center gap-2 py-2">
             <div className="text-5xl font-semibold tabular-nums text-foreground">
               {priorityLoading ? "Calculando..." : priorityResult?.finalScore ?? "—"}
             </div>
            {priorityResult && <RiskBadge level={priorityResult.level} />}
            <p className="text-center text-xs text-muted-foreground">
               {priorityResult
                 ? <>Nível da operação prioritária: <span className="font-medium text-foreground">{priorityResult.level}</span></>
                 : riskErrorByClient[selected.client.id]
                   ? "Não disponível"
                   : hasNoOperations
                     ? noOperationsMessage
                     : "Aguardando análise da operação prioritária"}
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section id="equipamentos-risco" className="scroll-mt-20">
        <Card>
          <SectionTitle
            title="Equipamento em análise"
            description="Resultado da operação prioritária"
          />
          <div className="space-y-2">
            {priorityLoading && <p className="text-sm text-muted-foreground">Calculando...</p>}
            {!priorityLoading && !topMachine && <p className="text-sm text-muted-foreground">{riskErrorByClient[selected.client.id] ? "Não disponível" : hasNoOperations ? noOperationsMessage : "Análise ainda não solicitada."}</p>}
            {clientMachines.map((row) => (
              <div key={row.machine.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{row.machine.name}</div>
                  <div className="text-xs text-muted-foreground">{row.machine.id} · {row.machine.area} · {row.mainFactor}</div>
                </div>
                <ScoreBar score={row.score} />
                <RiskBadge score={row.score} />
              </div>
            ))}
            {hasMoreEligibleEquipment && (
              <button type="button" onClick={loadMoreVisible} disabled={!priorityPublished || equipmentLoading} className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60">
                {equipmentLoading ? "Carregando equipamentos..." : priorityPublished ? "Carregar mais equipamentos" : "Calculando item prioritário..."}
              </button>
            )}
          </div>
        </Card>
        </section>

        <section id="areas-criticas" className="scroll-mt-20">
        <Card>
          <SectionTitle
             title="Área da operação analisada"
             description="Resultado da operação prioritária"
          />
          <ul className="space-y-2">
            {priorityLoading && <li className="text-sm text-muted-foreground">Calculando...</li>}
            {!priorityLoading && clientAreas.length === 0 && <li className="text-sm text-muted-foreground">{riskErrorByClient[selected.client.id] ? "Não disponível" : hasNoOperations ? noOperationsMessage : "Análise ainda não solicitada."}</li>}
            {[priorityArea].filter((row): row is NonNullable<typeof row> => Boolean(row)).map((row) => (
              <li key={row.area.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
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
             title="Composição do score da operação"
              description="Contribuições locais da operação prioritária"
          />
            {priorityResult ? (
             <div className="space-y-3">
                <CompositionRow label="Score ML" score={priorityResult.ml.mlRelativeScore} contribution={priorityMlContribution} weight={priorityResult.weights.ml} />
                <CompositionRow label="Score operacional" score={priorityResult.operationalRules.operationalRulesScore} contribution={priorityOperationalContribution} weight={priorityResult.weights.operationalRules} />
                <CompositionRow label="Score final" score={priorityResult.finalScore} contribution={priorityResult.finalScore} weight={100} />
               <div className="text-xs text-muted-foreground">
                  Componente dominante: <span className="font-medium text-foreground">{riskComponentLabel(priorityResult.dominantComponent)}</span>
               </div>
               <div className="text-xs text-muted-foreground">
                  Drivers da operação: <span className="font-medium text-foreground">{priorityResult.drivers.slice(0, 3).map((driver) => driver.label).join(", ") || "nenhum"}</span>
               </div>
             </div>
           ) : (
              <p className="text-sm text-muted-foreground">{priorityLoading ? "Calculando..." : riskErrorByClient[selected.client.id] ? "Não disponível" : hasNoOperations ? noOperationsMessage : "Análise ainda não solicitada."}</p>
           )}
        </Card>

        <Card>
          <SectionTitle
            title="Origem do risco"
            description="Explicação preventiva baseada no resultado central"
          />
            {priorityResult && topMachine ? (
             <ConsultorExplanation
                result={priorityResult}
                mainFactor={topMachine.mainFactor}
               recommendation={selected.recommendation}
             />
          ) : (
             <p className="text-sm text-muted-foreground">{priorityLoading ? "Calculando..." : riskErrorByClient[selected.client.id] ? "Não disponível" : hasNoOperations ? noOperationsMessage : "Análise ainda não solicitada."}</p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section id="recomendacoes" className="scroll-mt-20">
        <Card>
          <SectionTitle
            title="Recomendações preventivas"
            description="Geradas a partir do score e dos fatores da operação prioritária"
          />
          <div className="space-y-3">
              {recommendations.length === 0 && (
                <p className="text-sm text-muted-foreground">
                   {priorityLoading ? "Calculando..." : riskErrorByClient[selected.client.id] ? "Não disponível" : hasNoOperations ? noOperationsMessage : "Nenhuma recomendação ativa para esta operação."}
                </p>
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
          {priorityResult && topMachine ? (
            <ConsultorExplanation
              result={priorityResult}
              mainFactor={topMachine.mainFactor}
              recommendation={selected.recommendation}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{priorityLoading ? "Calculando..." : riskErrorByClient[selected.client.id] ? "Não disponível" : hasNoOperations ? noOperationsMessage : "Análise ainda não solicitada."}</p>
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
          <ConsultorPreventiveOverview overview={preventiveOverview} clientId={selected.client.id} clientName={selected.client.name} />
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

function riskComponentLabel(component: "ml" | "operational_rules" | "balanced") {
  return component === "ml" ? "ML" : component === "operational_rules" ? "Operacional" : "Balanceado";
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
  result,
  mainFactor,
  recommendation,
}: {
  result: RiskEngineV2Result;
  mainFactor: string;
  recommendation?: GeneratedRecommendation;
}) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <p>O score da operação é <strong>{result.finalScore}/100</strong>, classificado como <strong>risco {result.level}</strong>.</p>
      <p className="text-muted-foreground">
        A principal origem é {riskComponentLabel(result.dominantComponent)}, com atenção em {mainFactor.toLowerCase()}.
      </p>
      {recommendation ? (
        <p>Orientação preventiva: <strong>{recommendation.title.toLowerCase()}</strong>. {recommendation.rationale}</p>
      ) : (
        <p className="text-muted-foreground">Nenhuma recomendação ativa para esta operação.</p>
      )}
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
