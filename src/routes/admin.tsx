import { createFileRoute } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout, Card } from "@/components/app-layout";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { type MachineStatus } from "@/lib/mock-data";
import {
  countByCategory, countByPriority,
  type AdminRecRow, type RecCategory, type RecPriority,
} from "@/lib/recommendations";
import { Tractor, Building2, Map as MapIcon, ListChecks, Bell, Gauge, Trophy, Flame, Lightbulb, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { RequireProfile } from "@/components/require-profile";
import { ActionableAlertsList } from "@/components/actionable-alerts";
import { useRiskConfig } from "@/lib/risk-config";
import { AdminV2RiskPanel, recommendationForV2Result } from "@/components/admin-v2-risk-panel";
import { getStoredSessionToken } from "@/lib/auth";
import { evaluateAdminRiskBatch } from "@/lib/api/admin-dashboard.functions";
import type { AdminDashboardSnapshot } from "@/lib/admin-dashboard-types";
import { mergeAdminOperationRows } from "@/lib/admin-dashboard-merge";
import { AdminOperationalOverview } from "@/components/admin-operational-overview";
import { useActionableAlerts } from "@/lib/actionable-alerts";
import {
  ADMIN_PRIORITY_TIMEOUT_MESSAGE,
  ADMIN_RISK_REQUEST_TIMEOUT_MS,
  ADMIN_SECONDARY_TIMEOUT_MESSAGE,
  createSingleFlightRequestController,
  preserveAdminRiskSnapshot,
  useAdminDashboardLoader,
} from "@/lib/admin-dashboard-loader";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "AgroRisk · Admin / Sompo" }] }),
  component: () => (
    <RequireProfile path="/admin">
      <AdminPage />
    </RequireProfile>
  ),
});

type TabId =
  | "visao-geral"
  | "rankings"
  | "scores"
  | "recs"
  | "clients"
  | "machines"
  | "areas"
  | "operations"
  | "alerts"
  | "motor-risco";

const createTabs = (snapshot: AdminDashboardSnapshot, actionableAlertCount: number) => [
  { id: "visao-geral" as const, label: "Visão geral", icon: ShieldCheck, count: null as number | null },
  { id: "rankings" as const, label: "Rankings de risco", icon: Trophy, count: 2 },
  { id: "scores" as const, label: "Scores consolidados", icon: Gauge, count: 4 },
  { id: "recs" as const, label: "Recomendações prioritárias", icon: Lightbulb, count: null as number | null },
  { id: "clients" as const, label: "Clientes monitorados", icon: Building2, count: snapshot.clients.length },
  { id: "machines" as const, label: "Máquinas monitoradas", icon: Tractor, count: snapshot.machines.length },
  { id: "areas" as const, label: "Áreas e regiões", icon: MapIcon, count: snapshot.areas.length },
  { id: "operations" as const, label: "Operações monitoradas", icon: ListChecks, count: snapshot.operations.length },
  { id: "alerts" as const, label: "Central de alertas", icon: Bell, count: actionableAlertCount },
  { id: "motor-risco" as const, label: "Configuração do motor de risco", icon: SlidersHorizontal, count: null as number | null },
];

const AdminDashboardContext = createContext<{
  snapshot: AdminDashboardSnapshot;
  setSnapshot: React.Dispatch<React.SetStateAction<AdminDashboardSnapshot | null>>;
  requestMoreRisk: (operationIds: string[]) => void;
  riskErrorsByOperationId: Record<string, string>;
  priorityPending: boolean;
  priorityOperationId: string | null;
} | null>(null);

function useAdminDashboardData() {
  const state = useContext(AdminDashboardContext);
  if (!state) throw new Error("AdminDashboardContext não foi inicializado.");
  return state.snapshot;
}

function AdminPage() {
  const { snapshot, error, retry: retryDashboard } = useAdminDashboardLoader();
  const [localRiskSnapshot, setRiskSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  // Phase A can render in the same pass as the loader; risk rows remain local
  // and are overlaid once the priority/secondary evaluations resolve.
  const riskSnapshot = localRiskSnapshot ?? snapshot;
  const [priorityRiskError, setPriorityRiskError] = useState<string | null>(null);
  const [priorityPublished, setPriorityPublished] = useState(false);
  const [riskErrorsByOperationId, setRiskErrorsByOperationId] = useState<Record<string, string>>({});
  const [priorityOperationId, setPriorityOperationId] = useState<string | null>(null);
  const requestedRiskIds = useRef(new Set<string>());
  const requestedRiskTabs = useRef(new Set<TabId>());
  const riskSnapshotRef = useRef<AdminDashboardSnapshot | null>(null);
  const priorityGeneration = useRef(0);
  const priorityOperationIdRef = useRef<string | null>(null);
  const secondaryGeneration = useRef(0);
  const riskRequest = useRef(
    createSingleFlightRequestController<Awaited<ReturnType<typeof evaluateAdminRiskBatch>>>(),
  ).current;
  const [riskRequestRevision, setRiskRequestRevision] = useState(0);
  const [tab, setTab] = useState<TabId>("visao-geral");
  const { snapshot: actionableAlerts } = useActionableAlerts();
  const tabs = useMemo(
    () => (riskSnapshot ? createTabs(riskSnapshot, actionableAlerts.alerts.length) : []),
    [riskSnapshot, actionableAlerts.alerts.length],
  );
  const priorityPending = Boolean(priorityOperationId) &&
    !priorityPublished &&
    priorityRiskError === null;

  const mergeRiskRows = (rows: Parameters<typeof mergeAdminOperationRows>[1]) => {
    setRiskSnapshot((current) => {
      const next = current ? mergeAdminOperationRows(current, rows) : current;
      riskSnapshotRef.current = next;
      return next;
    });
  };

  const requestPriorityRisk = (id: string) => {
    const token = getStoredSessionToken();
    if (!token) {
      requestedRiskIds.current.delete(id);
      setPriorityRiskError("Sessão Admin/Sompo não encontrada.");
      setPriorityPublished(true);
      return;
    }
    // Timeout aborts the transport before releasing this single-flight slot;
    // retries therefore never overlap an older evaluation request.
    if (riskRequest.inFlight) return;
    requestedRiskIds.current.add(id);
    const generation = ++priorityGeneration.current;
    const isCurrentPriority = () =>
      generation === priorityGeneration.current &&
      priorityOperationIdRef.current === id &&
      !!riskSnapshotRef.current?.operations.some((operation) => operation.id === id);
    const request = riskRequest.start(
      (signal) => evaluateAdminRiskBatch({
        data: { token, operationIds: [id], limit: 1 },
        signal,
      }),
      {
        timeoutMs: ADMIN_RISK_REQUEST_TIMEOUT_MS,
        onTimeout: () => {
          requestedRiskIds.current.delete(id);
          if (!isCurrentPriority()) {
            setRiskRequestRevision((revision) => revision + 1);
            return;
          }
          setPriorityRiskError(ADMIN_PRIORITY_TIMEOUT_MESSAGE);
          // A failed priority item must not block all secondary tabs forever.
          setPriorityPublished(true);
          setRiskRequestRevision((revision) => revision + 1);
        },
      },
    );
    if (!request.started) return;
    void request.promise.then(
      (result) => {
        if (!request.isCurrent() || !isCurrentPriority()) {
          setRiskRequestRevision((revision) => revision + 1);
          return;
        }
        if (!result.ok) {
          requestedRiskIds.current.delete(id);
          setPriorityRiskError(result.error);
          setPriorityPublished(true);
          setRiskRequestRevision((revision) => revision + 1);
          return;
        }
        if (!result.operationRows.some((row) => row.operation.id === id)) {
          requestedRiskIds.current.delete(id);
          setPriorityRiskError(
            result.riskErrorsByOperationId?.[id] ??
              "Não foi possível calcular o risco da operação prioritária.",
          );
          setPriorityPublished(true);
          setRiskRequestRevision((revision) => revision + 1);
          return;
        }
        requestedRiskIds.current.add(id);
        mergeRiskRows(result.operationRows);
        setPriorityRiskError(null);
        setPriorityPublished(true);
        setRiskRequestRevision((revision) => revision + 1);
      },
      (requestError) => {
        if (!request.isCurrent() || !isCurrentPriority()) {
          setRiskRequestRevision((revision) => revision + 1);
          return;
        }
        requestedRiskIds.current.delete(id);
        setPriorityRiskError(
          requestError instanceof Error
            ? requestError.message
            : "Não foi possível calcular o risco da operação prioritária.",
        );
        setPriorityPublished(true);
        setRiskRequestRevision((revision) => revision + 1);
      },
    );
  };

  useEffect(() => {
    if (!snapshot) return;
    const previousSnapshot = riskSnapshotRef.current;
    const nextSnapshot = preserveAdminRiskSnapshot(snapshot, previousSnapshot);
    riskSnapshotRef.current = nextSnapshot;
    setRiskSnapshot(nextSnapshot);
    const operationIds = new Set(snapshot.operations.map((operation) => operation.id));
    requestedRiskIds.current.forEach((id) => {
      if (!operationIds.has(id)) requestedRiskIds.current.delete(id);
    });

    if (!previousSnapshot) {
      requestedRiskIds.current.clear();
      requestedRiskTabs.current.clear();
      setPriorityRiskError(null);
      setPriorityPublished(false);
      setRiskErrorsByOperationId({});
    }

    if (snapshot.operations.length === 0) {
      priorityGeneration.current += 1;
      priorityOperationIdRef.current = null;
      setPriorityOperationId(null);
      setPriorityRiskError(null);
      // Empty relational data is a resolved state, not an endless spinner.
      setPriorityPublished(true);
      return;
    }
    const id = [...snapshot.operations]
      .sort((left, right) =>
        (right.status === "Em andamento" ? 1 : 0) -
          (left.status === "Em andamento" ? 1 : 0) ||
        Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt),
      )
      .map((operation) => operation.id)[0];
    if (!id) return;
    const isSamePriority = previousSnapshot !== null && priorityOperationId === id;
    if (!isSamePriority) priorityGeneration.current += 1;
    priorityOperationIdRef.current = id;
    setPriorityOperationId(id);
    // A refresh with the same priority keeps both its score and its failure
    // state.  Only the first load or a newly selected operation starts work.
    if (isSamePriority && priorityPublished) return;
    if (isSamePriority && riskRequest.inFlight) return;
    setPriorityRiskError(null);
    setPriorityPublished(false);
    requestPriorityRisk(id);
  }, [snapshot, riskRequestRevision]);

  const retryPriorityRisk = () => {
    if (!riskSnapshot || !priorityOperationId || riskRequest.inFlight) return;
    requestedRiskIds.current.delete(priorityOperationId);
    setPriorityRiskError(null);
    setPriorityPublished(false);
    requestPriorityRisk(priorityOperationId);
  };

  const requestMoreRisk = (operationIds: string[]) => {
    const token = getStoredSessionToken();
    const ids = operationIds
      .filter((id) => !requestedRiskIds.current.has(id))
      .slice(0, 12);
    if (ids.length === 0) return false;
    if (!token) {
      setRiskErrorsByOperationId((current) => ({
        ...current,
        ...Object.fromEntries(ids.map((id) => [id, "Sessão Admin/Sompo não encontrada."])),
      }));
      return false;
    }
    if (riskRequest.inFlight) return false;
    ids.forEach((id) => requestedRiskIds.current.add(id));
    setRiskErrorsByOperationId((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    const generation = ++secondaryGeneration.current;
    const isCurrentSecondary = () =>
      generation === secondaryGeneration.current &&
      ids.every((id) => riskSnapshotRef.current?.operations.some((operation) => operation.id === id));
    const request = riskRequest.start(
      (signal) => evaluateAdminRiskBatch({
        data: { token, operationIds: ids, limit: ids.length },
        signal,
      }),
      {
        timeoutMs: ADMIN_RISK_REQUEST_TIMEOUT_MS,
        onTimeout: () => {
          ids.forEach((id) => requestedRiskIds.current.delete(id));
          if (!isCurrentSecondary()) {
            setRiskRequestRevision((revision) => revision + 1);
            return;
          }
          setRiskErrorsByOperationId((current) => ({
            ...current,
            ...Object.fromEntries(ids.map((id) => [id, ADMIN_SECONDARY_TIMEOUT_MESSAGE])),
          }));
          setRiskRequestRevision((revision) => revision + 1);
        },
      },
    );
    if (!request.started) {
      ids.forEach((id) => requestedRiskIds.current.delete(id));
      return false;
    }
    void request.promise.then(
      (result) => {
        if (!request.isCurrent() || !isCurrentSecondary()) {
          if (generation === secondaryGeneration.current) {
            ids.forEach((id) => requestedRiskIds.current.delete(id));
          }
          setRiskRequestRevision((revision) => revision + 1);
          return;
        }
        if (!result.ok) {
          ids.forEach((id) => requestedRiskIds.current.delete(id));
          setRiskErrorsByOperationId((current) => ({
            ...current,
            ...Object.fromEntries(ids.map((id) => [id, result.error])),
          }));
          setRiskRequestRevision((revision) => revision + 1);
          return;
        }
        const completed = new Set(result.operationRows.map((row) => row.operation.id));
        const failed = result.failedOperationIds ?? ids.filter((id) => !completed.has(id));
        failed.forEach((id) => requestedRiskIds.current.delete(id));
        setRiskErrorsByOperationId((current) => {
          const next = { ...current };
          completed.forEach((id) => delete next[id]);
          failed.forEach((id) => {
            next[id] = result.riskErrorsByOperationId?.[id] ??
              "Não foi possível calcular o risco desta operação.";
          });
          return next;
        });
        mergeRiskRows(result.operationRows);
        setRiskRequestRevision((revision) => revision + 1);
      },
      (requestError) => {
        if (!request.isCurrent() || !isCurrentSecondary()) {
          if (generation === secondaryGeneration.current) {
            ids.forEach((id) => requestedRiskIds.current.delete(id));
          }
          setRiskRequestRevision((revision) => revision + 1);
          return;
        }
        ids.forEach((id) => requestedRiskIds.current.delete(id));
        const message = requestError instanceof Error
          ? requestError.message
          : "Não foi possível calcular o risco desta operação.";
        setRiskErrorsByOperationId((current) => ({
          ...current,
          ...Object.fromEntries(ids.map((id) => [id, message])),
        }));
        setRiskRequestRevision((revision) => revision + 1);
      },
    );
    return true;
  };

  // Secondary batches are gated until the priority result has been published.
  useEffect(() => {
    if (!riskSnapshot || !priorityPublished || tab === "visao-geral" || tab === "alerts" || tab === "motor-risco") return;
    if (requestedRiskTabs.current.has(tab)) return;
    const visibleMachines = tab === "areas"
      ? riskSnapshot.machines.filter((machine) =>
          riskSnapshot.areas.slice(0, 4).some((area) => area.id === machine.areaId))
      : tab === "clients"
        ? riskSnapshot.machines.filter((machine) =>
            riskSnapshot.clients.slice(0, 2).some((client) => client.id === machine.clientId))
        : riskSnapshot.machines.slice(0, 12);
    const needsCurrentMachineRisk =
      tab === "machines" || tab === "rankings" || tab === "scores" ||
      tab === "areas" || tab === "clients" || tab === "recs";
    const operations = needsCurrentMachineRisk
      ? visibleMachines.flatMap((machine) =>
          riskSnapshot.operations
            .filter((operation) => operation.machineId === machine.id)
            .sort((left, right) =>
              (right.status === "Em andamento" ? 1 : 0) -
                (left.status === "Em andamento" ? 1 : 0) ||
              Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt) ||
              left.id.localeCompare(right.id),
            )
            .slice(0, 1),
        )
      : riskSnapshot.operations;
    const ids = operations
      .map((operation) => operation.id)
      .filter((id) => !requestedRiskIds.current.has(id))
      .slice(0, 12);
    if (ids.length === 0) return;
    if (requestMoreRisk(ids)) requestedRiskTabs.current.add(tab);
  }, [tab, riskSnapshot, priorityPublished, riskRequestRevision]);

  useEffect(() => {
    if (!riskSnapshot) return;
    const applyHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (!h || h === "topo") { setTab("visao-geral"); return; }
      if (h === "central-alertas") { setTab("alerts"); return; }
      const match = tabs.find((t) => t.id === h);
      if (match) setTab(match.id);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [riskSnapshot, tabs]);

   if (!riskSnapshot) {
    return (
      <AppLayout
        title="Dashboard da Sompo"
        subtitle="Visão consolidada dos clientes, frota, áreas, riscos e recomendações do MVP"
      >
        <Card>
          <div className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
            <span>{error ?? "Carregando dados relacionais do Admin/Sompo..."}</span>
            {error && (
              <button
                type="button"
                onClick={retryDashboard}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium"
              >
                Tentar novamente
              </button>
            )}
          </div>
        </Card>
      </AppLayout>
    );
  }

   const current = tabs.find((t) => t.id === tab)!;
  const currentCount = tab === "recs" ? riskSnapshot.operationRows.length : current.count;
  const Icon = current.icon;
   const remainingRiskIds = riskSnapshot.operations
     .map((operation) => operation.id)
     .filter((id) => !requestedRiskIds.current.has(id) && !riskErrorsByOperationId[id])
     .slice(0, 12);

   return (
        <AdminDashboardContext.Provider
          value={{
            snapshot: riskSnapshot,
            setSnapshot: setRiskSnapshot,
            requestMoreRisk,
            riskErrorsByOperationId,
            priorityPending,
            priorityOperationId,
          }}
        >
      <AppLayout
      title="Dashboard da Sompo"
      subtitle="Visão consolidada dos clientes, frota, áreas, riscos e recomendações do MVP"
    >
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <span>Atualização relacional não concluída: {error} Os dados exibidos permanecem disponíveis.</span>
          <button
            type="button"
            onClick={retryDashboard}
            className="shrink-0 rounded-md border border-warning/40 px-3 py-1 font-medium"
          >
            Tentar novamente
          </button>
        </div>
      )}
      <div id="topo" className="scroll-mt-20" />

      <div
        className={cn(
          "mb-4 rounded-lg border px-3 py-2 text-xs",
           riskSnapshot.degraded
            ? "border-warning/40 bg-warning/10 text-warning-foreground"
            : "border-success/30 bg-success/5 text-success",
        )}
      >
         {riskSnapshot.degraded
          ? "Dados relacionais indisponíveis no momento — a visualização pode estar parcial."
           : `Dados atualizados · Risk Engine V2 ativo · Pesos Sompo: ML ${riskSnapshot.weights.ml}% / Operacional ${riskSnapshot.weights.operationalRules}%.`}
      </div>

      <div className="mb-5 flex items-center gap-3 border-b border-border pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seção ativa</div>
          <div className="truncate text-lg font-semibold text-foreground">{current.label}</div>
        </div>
        {currentCount !== null && (
          <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
            {currentCount}
          </span>
        )}
      </div>

      <div id={tab} className="scroll-mt-20">
         {priorityRiskError && (
           <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              <span>{priorityOperationId}: {priorityRiskError}</span>
             <button type="button" onClick={retryPriorityRisk} className="rounded-md border border-danger/40 px-3 py-1 text-xs font-medium">
               Tentar novamente
             </button>
           </div>
         )}
          {Object.entries(riskErrorsByOperationId).map(([operationId, message]) => (
            <div key={operationId} className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              <span>{operationId}: {message}</span>
              <button type="button" onClick={() => requestMoreRisk([operationId])} className="rounded-md border border-danger/40 px-3 py-1 text-xs font-medium">
                Tentar novamente
              </button>
            </div>
          ))}
        {tab === "visao-geral" && <OverviewPanel />}
        {tab === "rankings" && <RankingsPanel />}
        {tab === "scores" && <ScoresPanel />}
        {tab === "recs" && <RecsPanel />}
        {tab === "clients" && <Card className="p-0"><ClientsTable /></Card>}
        {tab === "machines" && <Card className="p-0"><MachinesTable /></Card>}
        {tab === "areas" && <Card className="p-0"><AreasTable /></Card>}
        {tab === "operations" && <Card className="p-0"><OperationsTable /></Card>}
        {tab === "alerts" && (
          <div className="space-y-4 scroll-mt-20">
            <ActionableAlertsList sectionId="central-alertas" title="Central de alertas" />
          </div>
        )}
        {tab === "motor-risco" && <RiskEngineConfigurationPanel />}
        {priorityPublished && !["visao-geral", "alerts", "motor-risco"].includes(tab) && remainingRiskIds.length > 0 && (
          <div className="mt-4">
            <button type="button" onClick={() => requestMoreRisk(remainingRiskIds)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
              Carregar mais itens visíveis
            </button>
          </div>
        )}
      </div>
      </AppLayout>
    </AdminDashboardContext.Provider>
  );
}

function RiskEngineConfigurationPanel() {
  const data = useAdminDashboardData();
  const dashboardContext = useContext(AdminDashboardContext);
  const evaluation = data.operationRows.find(
    (row) => row.operation.id === dashboardContext?.priorityOperationId,
  )?.evaluation;
  if (!evaluation) {
    return (
      <Card>
        <div className="text-sm font-semibold text-foreground">Configuração do motor de risco</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {dashboardContext?.priorityPending
            ? "Calculando temporário para a operação prioritária."
            : "Não disponível: a operação prioritária não possui avaliação V2."}
        </p>
      </Card>
    );
  }
  return <AdminV2RiskPanel evaluation={evaluation} />;
}

function OverviewPanel() {
  const data = useAdminDashboardData();
  const dashboardContext = useContext(AdminDashboardContext);
  const mDist = data.machineDistribution;
  const aDist = data.areaDistribution;
  const priorityRisk = data.operationRows.find(
    (row) => row.operation.id === dashboardContext?.priorityOperationId,
  );
  const hasRiskRows = data.operationRows.length > 0;
  const partialSuffix = data.riskCoverageComplete ? "" : " · Parcial";
  const averageScore = data.riskCoverageComplete && data.machineRows.length
    ? Math.round(data.machineRows.reduce((sum, row) => sum + row.score, 0) / data.machineRows.length)
    : data.operationRows.length
      ? Math.round(data.operationRows.reduce((sum, row) => sum + row.score, 0) / data.operationRows.length)
    : null;
  const operationsAtRisk = data.operationRows.filter((row) => row.score >= 71).length;
  const evaluatedDistribution = {
    alto: data.operationRows.filter((row) => row.score >= 71).length,
    medio: data.operationRows.filter((row) => row.score >= 41 && row.score < 71).length,
    baixo: data.operationRows.filter((row) => row.score < 41).length,
  };
  const { snapshot: actionableAlerts } = useActionableAlerts();
  const criticalAlerts = actionableAlerts.alerts.filter((alert) => alert.severity === "critical").length;
  const priorityResult = priorityRisk?.evaluation.result;
  const dominantDriver = priorityResult
    ? priorityResult.drivers.find(
      (driver) =>
        priorityResult.dominantComponent === "balanced" ||
        driver.source === priorityResult.dominantComponent,
    )
    : undefined;
  const recommendation = priorityResult
    ? recommendationForV2Result(
      priorityResult as Parameters<typeof recommendationForV2Result>[0],
    )
    : null;
  const topRecs = adminV2RecommendationRows(data)
    .filter((r) => r.rec.priority === "alta")
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Clientes monitorados" value={String(data.clients.length)} tone="info" />
        <SummaryCard label="Máquinas monitoradas" value={String(data.machines.length)} tone="info" />
        <SummaryCard label="Operações monitoradas" value={String(data.operations.length)} tone="info" />
        <SummaryCard
          label="Operações em risco"
          value={hasRiskRows ? `${operationsAtRisk}${partialSuffix}` : dashboardContext?.priorityPending ? "Calculando temporário" : "Não disponível"}
          tone="warning"
        />
        <SummaryCard
          label={data.riskCoverageComplete ? "Score médio da frota" : "Média das operações avaliadas"}
          value={averageScore === null ? "Não disponível" : `${averageScore}${partialSuffix}`}
          tone="info"
        />
        <SummaryCard label="Score prioritário" value={priorityRisk ? String(priorityRisk.score) : dashboardContext?.priorityPending ? "Calculando temporário" : "Não disponível"} tone="success" />
        <SummaryCard label="Alertas críticos" value={String(criticalAlerts)} tone="danger" />
      </div>

      <AdminOperationalOverview overview={data.operationalOverview} />

      {priorityRisk && priorityResult && recommendation ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-primary/30 bg-primary/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">
                  Resumo de risco prioritário
                </div>
                <div className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
                  {priorityRisk.score}<span className="ml-1 text-lg font-medium text-muted-foreground">/100</span>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {priorityRisk.operation.id} · {priorityRisk.operation.type}
                </p>
              </div>
              <RiskBadge score={priorityRisk.score} />
            </div>
            <div className="mt-4 grid gap-2 border-t border-primary/15 pt-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Componente dominante</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {priorityResult.dominantComponent === "ml" ? "Modelo ML" : priorityResult.dominantComponent === "operational_rules" ? "Operacional" : "Equilibrado"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Principal driver</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {dominantDriver?.label ?? "Não disponível"}
                </div>
              </div>
            </div>
          </Card>
          <Card className="border-warning/30 bg-warning/5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-warning-foreground">
              Recomendação prioritária
            </div>
            <div className="mt-2 text-base font-semibold text-foreground">{recommendation.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{recommendation.description}</p>
            <div className="mt-3 border-t border-warning/20 pt-3 text-xs text-muted-foreground">
              Fator: <span className="font-medium text-foreground">{recommendation.factor}</span>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="border-border bg-muted/20">
          <div className="text-sm font-semibold text-foreground">Resumo de risco prioritário</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {dashboardContext?.priorityPending
              ? "Calculando temporário para a operação prioritária."
              : "Não disponível: a operação prioritária não possui avaliação V2."}
          </p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-1 text-sm font-semibold text-foreground">
            {data.riskCoverageComplete ? "Distribuição da frota por risco" : "Distribuição das operações avaliadas"}
          </div>
          {!data.riskCoverageComplete && (
            <div className="mb-3 text-xs text-muted-foreground">
              {data.operationRows.length} de {data.operations.length} operações avaliadas
            </div>
          )}
          <div className="space-y-2 text-sm">
             {data.riskCoverageComplete ? (
               <>
                 <DistRow label="Risco alto" mq={mDist.total ? mDist.alto : "Não disponível"} ar={aDist.total ? aDist.alto : "Não disponível"} tone="danger" />
                 <DistRow label="Risco médio" mq={mDist.total ? mDist.medio : "Não disponível"} ar={aDist.total ? aDist.medio : "Não disponível"} tone="warning" />
                 <DistRow label="Risco baixo" mq={mDist.total ? mDist.baixo : "Não disponível"} ar={aDist.total ? aDist.baixo : "Não disponível"} tone="success" />
               </>
             ) : (
               <>
                 <DistRow label="Risco alto" mq={evaluatedDistribution.alto} ar="—" tone="danger" primaryLabel="operações" secondaryLabel="" />
                 <DistRow label="Risco médio" mq={evaluatedDistribution.medio} ar="—" tone="warning" primaryLabel="operações" secondaryLabel="" />
                 <DistRow label="Risco baixo" mq={evaluatedDistribution.baixo} ar="—" tone="success" primaryLabel="operações" secondaryLabel="" />
               </>
             )}
          </div>
        </Card>

        <Card>
          <div className="mb-3 text-sm font-semibold text-foreground">Priorização — recomendações alta</div>
          <div className="space-y-2">
            {topRecs.map((r, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <Flame className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{r.rec.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.clientName} · {r.target}</div>
                </div>
                <RiskBadge score={r.score} />
              </div>
            ))}
            {topRecs.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {data.riskCoverageComplete ? "Sem recomendações de prioridade alta no momento." : "Recomendações parciais."}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DistRow({ label, mq, ar, tone, primaryLabel = "máq.", secondaryLabel = "áreas" }: { label: string; mq: number | string; ar: number | string; tone: "danger" | "warning" | "success"; primaryLabel?: string; secondaryLabel?: string }) {
  const dot = { danger: "bg-danger", warning: "bg-warning", success: "bg-success" }[tone];
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <span className="text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
        <span><b className="text-foreground">{mq}</b> {primaryLabel}</span>
        {secondaryLabel && <span><b className="text-foreground">{ar}</b> {secondaryLabel}</span>}
      </div>
    </div>
  );
}

function RankingsPanel() {
  const data = useAdminDashboardData();
  const mRows = data.machineRows;
  const aRows = data.areaRows;
  const mDist = data.machineDistribution;
  const aDist = data.areaDistribution;

  return (
    <div className="space-y-6">
      {data.riskCoverageComplete ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <DistCard label="Risco alto"  alto={mDist.alto}  medio={aDist.alto}  tone="danger" />
          <DistCard label="Risco médio" alto={mDist.medio} medio={aDist.medio} tone="warning" />
          <DistCard label="Risco baixo" alto={mDist.baixo} medio={aDist.baixo} tone="success" />
        </div>
      ) : (
        <Card><div className="text-sm text-muted-foreground">
          {data.operationRows.length ? "Distribuição parcial — aguardando os demais itens visíveis." : "Distribuição não disponível."}
        </div></Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            Ranking geral de equipamentos
          </div>
          <TableShell headers={["#", "Equipamento", "Cliente", "Score", "Alertas", "Risco"]}>
            {mRows.map((r, i) => (
              <tr key={r.machine.id} className={cn("hover:bg-muted/40", r.score >= 80 && "bg-danger/5")}>
                <TD className="tabular-nums text-muted-foreground">{i + 1}</TD>
                <TD>
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    {r.machine.code}
                    {r.score >= 80 && <Flame className="h-3.5 w-3.5 text-danger" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.machine.name}</div>
                </TD>
                <TD className="text-xs text-muted-foreground">{r.machine.client}</TD>
                <TD><ScoreBar score={r.score} /></TD>
                <TD className="tabular-nums">{r.alertsCount}</TD>
                <TD><RiskBadge score={r.score} /></TD>
              </tr>
            ))}
          </TableShell>
        </Card>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            Ranking geral de áreas
          </div>
          <TableShell headers={["#", "Área", "Cliente", "Score", "Op. ativas", "Risco"]}>
            {aRows.map((r, i) => (
              <tr key={r.area.id} className={cn("hover:bg-muted/40", r.score >= 80 && "bg-danger/5")}>
                <TD className="tabular-nums text-muted-foreground">{i + 1}</TD>
                <TD>
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    {r.area.name}
                    {r.score >= 80 && <Flame className="h-3.5 w-3.5 text-danger" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.area.type}</div>
                </TD>
                <TD className="text-xs text-muted-foreground">{r.area.client}</TD>
                <TD><ScoreBar score={r.score} /></TD>
                <TD className="tabular-nums">{r.activeOperations}</TD>
                <TD><RiskBadge score={r.score} /></TD>
              </tr>
            ))}
          </TableShell>
        </Card>
      </div>
    </div>
  );
}

function DistCard({
  label, alto, medio, tone,
}: { label: string; alto: number; medio: number; tone: "danger" | "warning" | "success" }) {
  const toneClass = {
    danger:  "border-danger/40 bg-danger/5 text-danger",
    warning: "border-warning/40 bg-warning/5 text-warning-foreground",
    success: "border-success/40 bg-success/5 text-success",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider opacity-70">Máquinas</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{alto}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider opacity-70">Áreas</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{medio}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- Painel de Recomendações (consolidado) ----------
const priorityTone: Record<RecPriority, string> = {
  alta:  "bg-danger/15 text-danger",
  "média": "bg-warning/20 text-warning-foreground",
  baixa: "bg-success/15 text-success",
};

function RecsPanel() {
  const data = useAdminDashboardData();
  const rows = adminV2RecommendationRows(data);
  const byCat = countByCategory(rows);
  const byPrio = countByPriority(rows);
  const partial = !data.riskCoverageComplete;

  const catEntries = Object.entries(byCat).filter(([, n]) => n > 0) as [RecCategory, number][];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Recomendações geradas" value={`${rows.length}${partial ? " · Parcial" : ""}`} tone="info" />
        <SummaryCard label="Prioridade alta"  value={`${byPrio.alta}${partial ? " · Parcial" : ""}`} tone="danger" />
        <SummaryCard label="Prioridade média" value={`${byPrio["média"]}${partial ? " · Parcial" : ""}`} tone="warning" />
        <SummaryCard label="Prioridade baixa" value={`${byPrio.baixa}${partial ? " · Parcial" : ""}`} tone="success" />
      </div>

      <Card>
        <div className="mb-3 text-sm font-semibold text-foreground">Distribuição por categoria</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {catEntries.map(([cat, n]) => (
            <div key={cat} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-foreground">{cat}</span>
              <span className="rounded-full bg-info/15 px-2 py-0.5 text-xs font-semibold text-info tabular-nums">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Recomendações {partial ? "parciais" : "consolidadas"} ({rows.length})
        </div>
        <TableShell headers={["Cliente / Fazenda", "Alvo", "Score", "Recomendação", "Categoria", "Prioridade", "Destino", "Risco"]}>
          {rows.map((r, i) => (
            <tr key={`${r.target}-${i}`} className="hover:bg-muted/40">
              <TD className="font-medium text-foreground">{r.clientName}</TD>
              <TD>
                <div className="font-medium text-foreground">{r.target}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.targetType}</div>
              </TD>
              <TD><ScoreBar score={r.score} /></TD>
              <TD>
                <div className="text-sm font-medium text-foreground">{r.rec.title}</div>
                <div className="text-xs text-muted-foreground">{r.rec.rationale}</div>
              </TD>
              <TD className="text-xs text-muted-foreground">{r.rec.category}</TD>
              <TD>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", priorityTone[r.rec.priority])}>
                  {r.rec.priority}
                </span>
              </TD>
              <TD className="text-xs capitalize text-muted-foreground">{r.rec.audience}</TD>
              <TD><RiskBadge score={r.score} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>
    </div>
  );
}

function adminV2RecommendationRows(data: AdminDashboardSnapshot): AdminRecRow[] {
  const priorityOrder: Record<RecPriority, number> = { alta: 0, "média": 1, baixa: 2 };
  return data.operationRows
    .map((row): AdminRecRow => ({
      clientName: row.evaluation.context.client.name,
      target: row.evaluation.context.machine.code,
      targetType: "equipamento",
      score: row.score,
      level: row.level,
      rec: recommendationForV2Result(row.evaluation.result),
    }))
    .sort((left, right) =>
      priorityOrder[left.rec.priority] - priorityOrder[right.rec.priority] ||
      right.score - left.score ||
      left.target.localeCompare(right.target),
    );
}

function SummaryCard({
  label, value, tone,
}: { label: string; value: string; tone: "danger" | "warning" | "success" | "info" }) {
  const toneClass = {
    danger:  "border-danger/40 bg-danger/5 text-danger",
    warning: "border-warning/40 bg-warning/5 text-warning-foreground",
    success: "border-success/40 bg-success/5 text-success",
    info:    "border-info/40 bg-info/5 text-info",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}



function TH({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</th>;
}
function TD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 text-sm", className)}>{children}</td>;
}

function TableShell({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border bg-muted/60">
          <tr>{headers.map((h) => <TH key={h}>{h}</TH>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "blue" | "gray" | "red" | "yellow" }) {
  const map = {
    green:  "bg-success/15 text-success",
    blue:   "bg-info/15 text-info",
    gray:   "bg-muted text-muted-foreground",
    red:    "bg-danger/15 text-danger",
    yellow: "bg-warning/20 text-warning-foreground",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", map[tone])}>{label}</span>;
}

const machineStatusTone: Record<MachineStatus, "green" | "blue" | "gray" | "red" | "yellow"> = {
  ativa: "green",
  parada: "gray",
  "em alerta": "yellow",
  "crítica": "red",
};

// ---------- Painel de Scores ----------
function ScoresPanel() {
  const data = useAdminDashboardData();

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Scores por máquina
        </div>
        <TableShell headers={["Equipamento", "Cliente", "Score", "Principal fator", "Risco"]}>
          {data.machineRows.map((row) => (
            <tr key={row.machine.id} className="hover:bg-muted/40">
              <TD><div className="font-medium text-foreground">{row.machine.name}</div><div className="text-xs text-muted-foreground">{row.machine.id}</div></TD>
              <TD className="text-xs text-muted-foreground">{row.machine.client}</TD>
               <TD><ScoreBar score={row.score} /></TD>
               <TD className="text-xs text-muted-foreground">{row.mainFactor}</TD>
               <TD><RiskBadge score={row.score} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Scores por cliente / fazenda
        </div>
        <TableShell headers={["Cliente", "Score médio", "Máq. risco alto", "Área crítica", "Risco"]}>
          {data.clientRows.map((row) => (
            <tr key={row.client.id} className="hover:bg-muted/40">
              <TD className="font-medium text-foreground">{row.client.name}</TD>
              <TD><ScoreBar score={row.score} /></TD>
              <TD className="tabular-nums">{row.machinesHigh}</TD>
              <TD className="text-xs text-muted-foreground">{row.topAreaName}</TD>
              <TD><RiskBadge score={row.score} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Scores por área / região
        </div>
        <TableShell headers={["Área", "Cliente", "Condição", "Score", "Principal fator", "Risco"]}>
          {data.areaRows.map((row) => (
            <tr key={row.area.id} className="hover:bg-muted/40">
              <TD className="font-medium text-foreground">{row.area.name}</TD>
              <TD className="text-xs text-muted-foreground">{row.area.client}</TD>
              <TD className="text-xs text-muted-foreground">{row.area.condition || "Não informada"}</TD>
              <TD><ScoreBar score={row.score} /></TD>
              <TD className="text-xs text-muted-foreground">{row.mainFactor}</TD>
              <TD><RiskBadge score={row.score} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Scores por tipo de operação
        </div>
        <TableShell headers={["Tipo", "Operações", "Score médio", "Risco"]}>
          {data.operationTypeRows.map((row) => (
            <tr key={row.type} className="hover:bg-muted/40">
              <TD className="font-medium text-foreground">{row.type}</TD>
              <TD className="tabular-nums">{row.count}</TD>
              <TD><ScoreBar score={row.score} /></TD>
              <TD><RiskBadge score={row.score} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>
    </div>
  );
}

function MachinesTable() {
  const data = useAdminDashboardData();
  const dashboardState = useContext(AdminDashboardContext);
  const riskByMachine = new Map(data.machineRows.map((row) => [row.machine.id, row]));
  return (
    <TableShell headers={["ID", "Equipamento", "Tipo", "Cliente", "Área", "Operador", "Status", "Score", "Risco"]}>
      {data.machines.map((m) => {
        const risk = riskByMachine.get(m.id);
        const operationId = data.operations.find((operation) => operation.machineId === m.id)?.id;
        return (
          <tr key={m.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{m.id}</TD>
            <TD><div className="font-medium text-foreground">{m.name}</div><div className="text-xs text-muted-foreground">{m.model}</div></TD>
            <TD>{m.type}</TD>
            <TD>{m.client}</TD>
            <TD>{m.area}</TD>
            <TD>{m.operator}</TD>
            <TD><StatusPill label={m.status} tone={machineStatusTone[m.status]} /></TD>
            <TD>{risk ? <ScoreBar score={risk.score} /> : operationId ? <button type="button" onClick={() => dashboardState?.requestMoreRisk([operationId])} className="text-xs font-medium text-primary underline">Solicitar avaliação</button> : "Não disponível"}</TD>
            <TD>{risk ? <RiskBadge score={risk.score} /> : operationId ? "Pendente" : "Não disponível"}</TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

function ClientsTable() {
  const data = useAdminDashboardData();
  const dashboardState = useContext(AdminDashboardContext);
  const riskByClient = new Map(data.clientRows.map((row) => [row.client.id, row]));
  return (
    <TableShell headers={["ID", "Cliente", "Localização", "Operação", "Máquinas", "Score médio", "Risco"]}>
      {data.clients.map((c) => {
        const risk = riskByClient.get(c.id);
        const operationId = data.operations.find((operation) => operation.clientId === c.id)?.id;
        return (
          <tr key={c.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{c.id}</TD>
            <TD className="font-medium text-foreground">{c.name}</TD>
            <TD>{c.location}</TD>
            <TD>{c.mainOperation}</TD>
            <TD className="tabular-nums">{c.machineCount}</TD>
            <TD>{risk ? <ScoreBar score={risk.score} /> : operationId ? <button type="button" onClick={() => dashboardState?.requestMoreRisk([operationId])} className="text-xs font-medium text-primary underline">Solicitar avaliação</button> : "Não disponível"}</TD>
            <TD>{risk ? <RiskBadge score={risk.score} /> : operationId ? "Pendente" : "Não disponível"}</TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

function AreasTable() {
  const data = useAdminDashboardData();
  const dashboardState = useContext(AdminDashboardContext);
  const riskByArea = new Map(data.areaRows.map((row) => [row.area.id, row]));
  return (
    <TableShell headers={["ID", "Área", "Cliente", "Tipo", "Condição", "Água", "Score", "Risco"]}>
      {data.areas.map((a) => {
        const risk = riskByArea.get(a.id);
        const operationId = data.operations.find((operation) => operation.areaId === a.id)?.id;
        return (
          <tr key={a.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{a.id}</TD>
            <TD className="font-medium text-foreground">{a.name}</TD>
            <TD>{a.client}</TD>
            <TD>{a.type}</TD>
            <TD>{a.condition || "Não informada"}</TD>
            <TD className="capitalize">{a.nearWater}</TD>
            <TD>{risk ? <ScoreBar score={risk.score} /> : operationId ? <button type="button" onClick={() => dashboardState?.requestMoreRisk([operationId])} className="text-xs font-medium text-primary underline">Solicitar avaliação</button> : "Não disponível"}</TD>
            <TD>{risk ? <RiskBadge score={risk.score} /> : operationId ? "Pendente" : "Não disponível"}</TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

function OperationsTable() {
  const data = useAdminDashboardData();
  const dashboardState = useContext(AdminDashboardContext);
  const [page, setPage] = useState(0);
  const riskByOperation = new Map(data.operationRows.map((row) => [row.operation.id, row]));
  const pageSize = 12;
  const visibleOperations = data.operations.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <div className="space-y-3">
      <TableShell headers={["ID", "Máquina", "Tipo", "Área", "Início", "Duração", "Status", "Score", "Risco"]}>
      {visibleOperations.map((o) => {
        const risk = riskByOperation.get(o.id);
          const riskError = dashboardState?.riskErrorsByOperationId[o.id];
        return (
          <tr key={o.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{o.id}</TD>
            <TD className="font-medium text-foreground">{o.machineId}</TD>
            <TD>{o.type}</TD>
            <TD>{o.area}</TD>
            <TD>{o.start}</TD>
            <TD className="tabular-nums">{o.duration}</TD>
            <TD>
              <StatusPill
                label={o.status}
                tone={o.status === "Em andamento" ? "green" : o.status === "Concluída" ? "blue" : o.status === "Agendada" ? "yellow" : "red"}
              />
            </TD>
            <TD>{risk ? <ScoreBar score={risk.score} /> : riskError ? (
              <button type="button" onClick={() => dashboardState?.requestMoreRisk([o.id])} className="text-xs text-danger underline">Tentar novamente</button>
            ) : "Não disponível"}</TD>
            <TD>{risk ? <RiskBadge score={risk.score} /> : riskError ?? "Não disponível"}</TD>
          </tr>
        );
      })}
      </TableShell>
      <div className="flex items-center justify-between px-4 pb-4 text-sm text-muted-foreground">
        <span>Página {page + 1}</span>
        {page < Math.ceil(data.operations.length / pageSize) - 1 && (
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              const ids = data.operations.slice(next * pageSize, (next + 1) * pageSize).map((operation) => operation.id);
               dashboardState?.requestMoreRisk(ids);
            }}
          >Próxima página</button>
        )}
      </div>
    </div>
  );
}
