import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout, Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MachineDetailDialog } from "@/components/machine-detail-dialog";
import { AreaDetailDialog } from "@/components/area-detail-dialog";
import { riskTrend, type Machine, type Area, type OperationType, type RiskLevel } from "@/lib/mock-data";
import { opTypeOptions, levelOptions } from "@/lib/ranking";
import { RecommendationCard } from "@/components/recommendation-card";
import {
  Tractor, AlertTriangle, Activity, Gauge,
  TrendingUp, TrendingDown, Flame, Filter as FilterIcon, ArrowUpDown, MapPin,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RequireProfile } from "@/components/require-profile";
import { GestorOperationalOverview } from "@/components/gestor-operational-overview";
import { getStoredSessionToken } from "@/lib/auth";
import { useActionableAlerts } from "@/lib/actionable-alerts";
import {
  evaluateGestorRiskBatch,
  getGestorDashboard,
  getGestorOperationalOverview,
} from "@/lib/api/gestor-dashboard.functions";
import type { GestorDashboardSnapshot } from "@/lib/gestor-dashboard-types";
import { PersonaV2RiskPanel } from "@/components/persona-v2-risk-panel";
import { selectGestorPriorityOperationIds } from "@/lib/gestor-risk-selection";
import {
  createGestorRequestController,
  GESTOR_DASHBOARD_REQUEST_TIMEOUT_MS,
  GESTOR_DASHBOARD_TIMEOUT_MESSAGE,
  GESTOR_PRIORITY_TIMEOUT_MESSAGE,
  GESTOR_RISK_REQUEST_TIMEOUT_MS,
  GESTOR_SECONDARY_TIMEOUT_MESSAGE,
  selectGestorDemandOperationIds,
} from "@/lib/gestor-dashboard-orchestration";

export const Route = createFileRoute("/gestor")({
  head: () => ({ meta: [{ title: "AgroRisk · Dashboard do Gestor" }] }),
  component: () => (
    <RequireProfile path="/gestor">
      <GestorPage />
    </RequireProfile>
  ),
});

function Kpi({
  label, value, hint, icon: Icon, trend, tone = "default",
}: {
  label: string; value: string; hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { dir: "up" | "down"; value: string };
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClass = {
    default: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    danger:  "bg-danger/10 text-danger",
  }[tone];
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium">
          {trend.dir === "up" ? (
            <TrendingUp className="h-3.5 w-3.5 text-danger" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-success" />
          )}
          <span className={trend.dir === "up" ? "text-danger" : "text-success"}>{trend.value}</span>
          <span className="text-muted-foreground">vs semana anterior</span>
        </div>
      )}
    </Card>
  );
}

function TrendChart({ data }: { data: number[] }) {
  const w = 600, h = 160, pad = 24;
  const max = 100, min = 0;
  const step = (w - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const area = `${path} L ${points[points.length - 1][0]} ${h - pad} L ${points[0][0]} ${h - pad} Z`;
  const labels = ["7d", "6d", "5d", "4d", "3d", "ontem", "hoje"];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((g) => {
        const y = h - pad - (g / 100) * (h - pad * 2);
        return (
          <g key={g}>
            <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="3 3" />
            <text x={4} y={y + 3} fontSize="9" fill="var(--color-muted-foreground)">{g}</text>
          </g>
        );
      })}
      <path d={area} fill="url(#g)" />
      <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3.5" fill="var(--color-card)" stroke="var(--color-primary)" strokeWidth="2" />
          <text x={x} y={h - 6} fontSize="9" textAnchor="middle" fill="var(--color-muted-foreground)">{labels[i]}</text>
        </g>
      ))}
    </svg>
  );
}

function DistributionBar({ alto, medio, baixo }: { alto: number; medio: number; baixo: number }) {
  const total = Math.max(1, alto + medio + baixo);
  const pct = (n: number) => (n / total) * 100;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-danger"  style={{ width: `${pct(alto)}%` }} />
        <div className="bg-warning" style={{ width: `${pct(medio)}%` }} />
        <div className="bg-success" style={{ width: `${pct(baixo)}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="h-2 w-2 rounded-full bg-danger" /> Alto <span className="tabular-nums text-muted-foreground">{alto}</span>
        </span>
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="h-2 w-2 rounded-full bg-warning" /> Médio <span className="tabular-nums text-muted-foreground">{medio}</span>
        </span>
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="h-2 w-2 rounded-full bg-success" /> Baixo <span className="tabular-nums text-muted-foreground">{baixo}</span>
        </span>
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { id: T; name: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}

function GestorPage() {
  const { snapshot: actionableAlerts } = useActionableAlerts();
  const [clientId,     setClientId]     = useState<string>("all");
  const [level,        setLevel]        = useState<RiskLevel | "all">("all");
  const [operationType, setOperationType] = useState<OperationType | "all">("all");
  const [areaId,       setAreaId]       = useState<string>("all");
  const [activeRankingTab, setActiveRankingTab] = useState("machines");
  const [filterDemandVersion, setFilterDemandVersion] = useState(0);

  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);

  const [snapshot, setSnapshot] = useState<GestorDashboardSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [priorityPublished, setPriorityPublished] = useState(false);
  const [phaseAAttempt, setPhaseAAttempt] = useState(0);
  const [priorityOperationId, setPriorityOperationId] = useState<string | null>(null);
  const [selectionDemandVersion, setSelectionDemandVersion] = useState(0);
  const requestedOperationIds = useRef(new Set<string>());
  const completedOperationIds = useRef(new Set<string>());
  const requestMarkers = useRef(new Map<string, symbol>());
  const firstBatchScheduled = useRef(false);
  const priorityResolved = useRef(false);
  const pendingRankingTab = useRef<string | null>(null);
  const priorityGeneration = useRef(0);
  const secondaryGeneration = useRef(0);
  const phaseAGeneration = useRef(0);
  const priorityOperationIdRef = useRef<string | null>(null);
  const priorityFilterKey = useRef<string | null>(null);
  const pendingPriorityOperationIds = useRef(new Set<string>());
  const pendingSecondaryOperationIds = useRef(new Set<string>());
  const phaseARequest = useRef(
    createGestorRequestController<Awaited<ReturnType<typeof getGestorDashboard>>>(),
  ).current;
  const priorityRequest = useRef(
    createGestorRequestController<Awaited<ReturnType<typeof evaluateGestorRiskBatch>>>(),
  ).current;
  const secondaryRequest = useRef(
    createGestorRequestController<Awaited<ReturnType<typeof evaluateGestorRiskBatch>>>(),
  ).current;

  const discardPendingRiskIds = (priority: boolean) => {
    const pending = priority
      ? pendingPriorityOperationIds.current
      : pendingSecondaryOperationIds.current;
    pending.forEach((id) => {
      requestedOperationIds.current.delete(id);
      requestMarkers.current.delete(id);
    });
    pending.clear();
  };

  useEffect(() => {
    const nextFilterKey = [clientId, level, operationType, areaId].join("|");
    const filterChanged = priorityFilterKey.current !== null &&
      priorityFilterKey.current !== nextFilterKey;
    priorityFilterKey.current = nextFilterKey;
    // Filter/tab changes invalidate older asynchronous ranking responses.
    secondaryGeneration.current += 1;
    discardPendingRiskIds(false);
    secondaryRequest.invalidate();
    if (filterChanged) {
      priorityGeneration.current += 1;
      discardPendingRiskIds(true);
      priorityRequest.invalidate();
      firstBatchScheduled.current = false;
      priorityResolved.current = false;
      priorityOperationIdRef.current = null;
      setPriorityOperationId(null);
      setPriorityError(null);
      setPriorityPublished(false);
    }
  }, [clientId, level, operationType, areaId]);

  const releaseRequestIds = (ids: readonly string[], marker: symbol) => {
    ids.forEach((id) => {
      if (requestMarkers.current.get(id) !== marker) return;
      requestMarkers.current.delete(id);
      requestedOperationIds.current.delete(id);
      pendingPriorityOperationIds.current.delete(id);
      pendingSecondaryOperationIds.current.delete(id);
    });
  };

  const publishRiskErrors = (ids: readonly string[], errors: Record<string, string>) => {
    setSnapshot((previous) => {
      if (!previous) return previous;
      const nextErrors = { ...(previous.riskErrorsByOperationId ?? {}) };
      ids.forEach((id) => {
        if (errors[id]) nextErrors[id] = errors[id];
      });
      return {
        ...previous,
        riskCoverageComplete: false,
        riskErrorsByOperationId: nextErrors,
      };
    });
  };

  const requestBatch = (operationIds: string[], priority = false) => {
    const token = getStoredSessionToken();
    if (!token || operationIds.length === 0) return;
    const ids = operationIds
      .filter((id) =>
        !requestedOperationIds.current.has(id) &&
        !completedOperationIds.current.has(id))
      .slice(0, priority ? 1 : 12);
    if (ids.length === 0) {
      if (priority) {
        priorityResolved.current = true;
        setPriorityPublished(true);
      }
      return;
    }
    if (priority) {
      priorityOperationIdRef.current = ids[0]!;
      setPriorityOperationId(ids[0]!);
    }
    const controller = priority ? priorityRequest : secondaryRequest;
    if (controller.inFlight) return;
    const marker = Symbol("gestor-risk-attempt");
    const pendingIds = priority
      ? pendingPriorityOperationIds.current
      : pendingSecondaryOperationIds.current;
    ids.forEach((id) => {
      requestedOperationIds.current.add(id);
      requestMarkers.current.set(id, marker);
      pendingIds.add(id);
    });
    const generation = priority ? priorityGeneration.current : secondaryGeneration.current;
    const isCurrent = () =>
      generation === (priority ? priorityGeneration.current : secondaryGeneration.current);
    const timeoutMessage = priority
      ? GESTOR_PRIORITY_TIMEOUT_MESSAGE
      : GESTOR_SECONDARY_TIMEOUT_MESSAGE;
    setBatchLoading(true);
    const request = controller.start(
      (signal) => evaluateGestorRiskBatch({
        data: { token, operationIds: ids, limit: Math.min(ids.length, priority ? 1 : 12) },
        signal,
      }),
      {
        timeoutMs: GESTOR_RISK_REQUEST_TIMEOUT_MS,
        onTimeout: () => {
          releaseRequestIds(ids, marker);
          ids.forEach((id) => completedOperationIds.current.delete(id));
          if (!isCurrent()) return;
          publishRiskErrors(ids, Object.fromEntries(ids.map((id) => [id, timeoutMessage])));
          if (priority) {
            priorityResolved.current = true;
            setPriorityError(`${ids[0]}: ${timeoutMessage}`);
            setPriorityPublished(true);
          }
          setBatchLoading(secondaryRequest.inFlight || priorityRequest.inFlight);
        },
      },
    );
    if (!request.started) {
      releaseRequestIds(ids, marker);
      ids.forEach((id) => pendingIds.delete(id));
      return;
    }
    void request.promise.then(
      (result) => {
        if (!request.isCurrent() || !isCurrent()) {
          releaseRequestIds(ids, marker);
          setBatchLoading(secondaryRequest.inFlight || priorityRequest.inFlight);
          return;
        }
        if (!result.ok) {
          releaseRequestIds(ids, marker);
          ids.forEach((id) => completedOperationIds.current.delete(id));
          const errors = Object.fromEntries(ids.map((id) => [id, result.error]));
          publishRiskErrors(ids, errors);
          if (priority) {
            priorityResolved.current = true;
            setPriorityError(`${ids[0]}: ${result.error}`);
            setPriorityPublished(true);
          }
          return;
        }
        const returnedErrors = result.snapshot.riskErrorsByOperationId ?? {};
        const completed = new Set(
          (result.snapshot.operationRows ?? []).map((row) => row.operation.id),
        );
        const failed = ids.filter((id) => !completed.has(id) || returnedErrors[id]);
        const successful = ids.filter((id) => completed.has(id) && !returnedErrors[id]);
        failed.forEach((id) => {
          if (requestMarkers.current.get(id) === marker) {
            requestMarkers.current.delete(id);
            requestedOperationIds.current.delete(id);
          }
          completedOperationIds.current.delete(id);
          pendingIds.delete(id);
        });
        successful.forEach((id) => {
          if (requestMarkers.current.get(id) !== marker) return;
          requestMarkers.current.delete(id);
          completedOperationIds.current.add(id);
          requestedOperationIds.current.add(id);
          pendingIds.delete(id);
        });
        const errors = Object.fromEntries(failed.map((id) => [
          id,
          returnedErrors[id] ?? "Não foi possível calcular o risco desta operação.",
        ]));
        setSnapshot((previous) => {
          if (!previous) return result.snapshot;
          const previousErrors = { ...(previous.riskErrorsByOperationId ?? {}) };
          successful.forEach((id) => delete previousErrors[id]);
          Object.assign(previousErrors, errors);
          return {
            ...result.snapshot,
            operationalOverview: previous.operationalOverview,
            riskCoverageComplete: failed.length === 0
              ? result.snapshot.riskCoverageComplete
              : false,
            riskErrorsByOperationId: previousErrors,
          };
        });
        if (priority) {
          priorityResolved.current = true;
          setPriorityError(failed.length > 0 ? `${ids[0]}: ${errors[ids[0]]}` : null);
          setPriorityPublished(true);
        }
      },
      (requestError) => {
        if (!request.isCurrent() || !isCurrent()) {
          releaseRequestIds(ids, marker);
          setBatchLoading(secondaryRequest.inFlight || priorityRequest.inFlight);
          return;
        }
        releaseRequestIds(ids, marker);
        ids.forEach((id) => completedOperationIds.current.delete(id));
        ids.forEach((id) => pendingIds.delete(id));
        const message = requestError instanceof Error
          ? requestError.message
          : "Não foi possível calcular o risco desta operação.";
        publishRiskErrors(ids, Object.fromEntries(ids.map((id) => [id, message])));
        if (priority) {
          priorityResolved.current = true;
          setPriorityError(`${ids[0]}: ${message}`);
          setPriorityPublished(true);
        }
      },
    ).finally(() => {
      setBatchLoading(secondaryRequest.inFlight || priorityRequest.inFlight);
    });
  };

  useEffect(() => {
    let mounted = true;
    const token = getStoredSessionToken();
    const generation = ++phaseAGeneration.current;
    if (!token) {
      setLoadError("Sessão Gestor não encontrada.");
      setBatchLoading(false);
      return () => { mounted = false; };
    }
    setLoadError(null);
    setBatchLoading(true);
    const request = phaseARequest.start(
      // Keep the relational request independent from risk evaluation.
      (signal) => getGestorDashboard({ data: { token }, signal }),
      {
        timeoutMs: GESTOR_DASHBOARD_REQUEST_TIMEOUT_MS,
        onTimeout: () => {
          if (!mounted || generation !== phaseAGeneration.current) return;
          setLoadError(GESTOR_DASHBOARD_TIMEOUT_MESSAGE);
          setBatchLoading(false);
        },
      },
    );
    if (!request.started) return () => { mounted = false; };
    void request.promise.then(
      (result) => {
        if (!mounted || generation !== phaseAGeneration.current || !request.isCurrent()) return;
        if (!result.ok) {
          setLoadError(result.error);
          setBatchLoading(false);
          return;
        }
        priorityGeneration.current += 1;
        secondaryGeneration.current += 1;
        priorityRequest.invalidate();
        secondaryRequest.invalidate();
        requestedOperationIds.current.clear();
        completedOperationIds.current.clear();
        requestMarkers.current.clear();
        pendingPriorityOperationIds.current.clear();
        pendingSecondaryOperationIds.current.clear();
        firstBatchScheduled.current = false;
        priorityResolved.current = false;
        priorityOperationIdRef.current = null;
        setPriorityPublished(false);
        setPriorityOperationId(null);
        setPriorityError(null);
        pendingRankingTab.current = null;
        setSnapshot(result.snapshot);
        setBatchLoading(false);
      },
      (requestError) => {
        if (!mounted || generation !== phaseAGeneration.current || !request.isCurrent()) return;
        setLoadError(
          requestError instanceof Error
            ? requestError.message
            : "Não foi possível carregar o dashboard.",
        );
        setBatchLoading(false);
      },
    );
    return () => {
      mounted = false;
      phaseAGeneration.current += 1;
      phaseARequest.invalidate();
    };
  }, [phaseAAttempt]);

  useEffect(() => {
    if (!snapshot || firstBatchScheduled.current) return;
    // Start the visible operation immediately after the relational snapshot.
    const visibleMachineIds = new Set(snapshot.machines
      .filter((machine) =>
        (clientId === "all" || machine.clientId === clientId) &&
        (areaId === "all" || machine.areaId === areaId))
      .slice(0, 3)
      .map((machine) => machine.id));
    const visibleOperations = snapshot.operations.filter((operation) =>
      visibleMachineIds.has(operation.machineId) &&
      (clientId === "all" || operation.clientId === clientId) &&
      (areaId === "all" || operation.areaId === areaId) &&
      (operationType === "all" || operation.type === operationType));
    const visibleIds = selectGestorPriorityOperationIds(
      visibleOperations,
      visibleOperations.map((operation) => operation.id),
      1,
      false,
    );
    firstBatchScheduled.current = true;
    if (visibleIds.length === 0) {
      priorityOperationIdRef.current = null;
      setPriorityOperationId(null);
      priorityResolved.current = true;
      setPriorityPublished(true);
      return;
    }
    priorityOperationIdRef.current = visibleIds[0]!;
    setPriorityOperationId(visibleIds[0]!);
    requestBatch(visibleIds, true);
  }, [snapshot, clientId, level, operationType, areaId, filterDemandVersion]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    const token = getStoredSessionToken();
    if (!token) return () => { cancelled = true; };
    void getGestorOperationalOverview({ data: { token } })
      .then((result) => {
        if (!cancelled && result.ok) {
          setSnapshot((previous) => previous
            ? { ...previous, operationalOverview: result.overview }
            : previous);
        }
      })
      .catch(() => {
        // Operational overview is secondary; the relational dashboard remains usable.
      });
    return () => { cancelled = true; };
  }, [Boolean(snapshot)]);

  const handleRankingTabChange = (tab: string) => {
    if (!snapshot) return;
    setActiveRankingTab(tab);
    if (!priorityResolved.current || !priorityPublished) {
      pendingRankingTab.current = tab;
      return;
    }
    secondaryGeneration.current += 1;
    discardPendingRiskIds(false);
    secondaryRequest.invalidate();
    const filtered = snapshot.operations.filter((operation) =>
      (clientId === "all" || operation.clientId === clientId) &&
      (areaId === "all" || operation.areaId === areaId) &&
      (operationType === "all" || operation.type === operationType));
    const pendingIds = filtered
      .map((operation) => operation.id)
      .filter((id) =>
        !requestedOperationIds.current.has(id) &&
        !completedOperationIds.current.has(id));
    if (pendingIds.length === 0) return;
    const page = selectGestorDemandOperationIds(
      snapshot.operations,
      pendingIds,
      12,
    );
    requestBatch(page);
  };

  const handleMachineSelection = (machine: Machine) => {
    setSelectedArea(null);
    setSelectedMachine(machine);
    setSelectionDemandVersion((version) => version + 1);
  };

  const handleAreaSelection = (area: Area) => {
    setSelectedMachine(null);
    setSelectedArea(area);
    setSelectionDemandVersion((version) => version + 1);
  };

  useEffect(() => {
    // Selection is an explicit demand event.  Do not depend on `snapshot`:
    // publishing an error updates the snapshot and must not retry in a loop.
    secondaryGeneration.current += 1;
    discardPendingRiskIds(false);
    secondaryRequest.invalidate();
    if (!snapshot || !priorityPublished) return;
    const selectedIds = selectedMachine
      ? snapshot.operations
        .filter((operation) => operation.machineId === selectedMachine.id)
        .map((operation) => operation.id)
      : selectedArea
        ? snapshot.operations
          .filter((operation) => operation.areaId === selectedArea.id)
          .map((operation) => operation.id)
        : [];
    if (selectedIds.length === 0) return;
    const ids = selectGestorDemandOperationIds(
      snapshot.operations,
      selectedIds,
      12,
    );
    if (ids.length === 0) return;
    requestBatch(ids);
  }, [selectedMachine?.id, selectedArea?.id, priorityPublished, selectionDemandVersion]);

  useEffect(() => {
    if (!priorityPublished) return;
    const deferredTab = pendingRankingTab.current;
    pendingRankingTab.current = null;
    if (deferredTab) {
      handleRankingTabChange(deferredTab);
    } else if (filterDemandVersion > 0) {
      handleRankingTabChange(activeRankingTab);
    }
  }, [filterDemandVersion, priorityPublished]);

  const machineRows = useMemo(() => (snapshot?.machineRows ?? []).filter((row) =>
    (clientId === "all" || row.machine.clientId === clientId) &&
    (level === "all" || row.level === level) &&
    (areaId === "all" || row.machine.areaId === areaId) &&
    (operationType === "all" || row.operation?.type === operationType)
  ), [snapshot, clientId, level, areaId, operationType]);
  const areaRows = useMemo(() => (snapshot?.areaRows ?? []).filter((row) =>
    (clientId === "all" || row.area.clientId === clientId) &&
    (level === "all" || row.level === level) &&
    (areaId === "all" || row.area.id === areaId) &&
    (operationType === "all" || (snapshot?.operationRows ?? []).some((op) =>
      op.operation.areaId === row.area.id && op.operation.type === operationType))
  ), [snapshot, clientId, level, areaId, operationType]);
  const opTypeRows = useMemo(() => {
    const rows = (snapshot?.operationRows ?? []).filter((row) =>
      (clientId === "all" || row.operation.clientId === clientId) &&
      (areaId === "all" || row.operation.areaId === areaId) &&
      (operationType === "all" || row.operation.type === operationType)
    );
    return [...new Set(rows.map((row) => row.operation.type))].map((type) => {
      const matching = rows.filter((row) => row.operation.type === type);
      const score = Math.round(matching.reduce((total, row) => total + row.score, 0) / matching.length);
      const factors = matching.reduce<Record<string, number>>((counts, row) => {
        counts[row.mainFactor] = (counts[row.mainFactor] ?? 0) + 1;
        return counts;
      }, {});
      return {
        type,
        count: matching.length,
        score,
        level: score >= 71 ? "alto" as const : score >= 41 ? "medio" as const : "baixo" as const,
        mainFactor: Object.entries(factors).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "Sem fator dominante",
      };
    })
      .filter((row) => level === "all" || row.level === level)
      .sort((left, right) => right.score - left.score || left.type.localeCompare(right.type));
  }, [snapshot, clientId, level, areaId, operationType]);
  const distrib = useMemo(() => ({
    alto: machineRows.filter((row) => row.level === "alto").length,
    medio: machineRows.filter((row) => row.level === "medio").length,
    baixo: machineRows.filter((row) => row.level === "baixo").length,
  }), [machineRows]);
  const headline = machineRows[0]
    ? `${snapshot?.riskCoverageComplete ? "" : "Resultado parcial: "}Priorize ${machineRows[0].machine.code}, com score ${machineRows[0].score} e atenção principal em ${machineRows[0].mainFactor.toLowerCase()}.`
    : snapshot
      ? priorityError
        ? "Não disponível: não foi possível calcular a priorização dos equipamentos visíveis."
        : "Resultado parcial: priorização dos equipamentos visíveis."
      : "Carregando carteira do Gestor...";
  const monitored = snapshot?.machines.length ?? 0;
  const avg = snapshot?.averageScore ?? 0;
  const trendData = useMemo(() => {
    const history = riskTrend.slice(0, 6);
    return [...history, snapshot ? avg : riskTrend[riskTrend.length - 1]];
  }, [avg, snapshot]);
  const clientOptions = useMemo(() => [
    { id: "all", name: "Todos os clientes" },
    ...(snapshot?.clients ?? []).map((client) => ({ id: client.id, name: client.name })),
  ], [snapshot]);
  const areaOptions = useMemo(() => [
    { id: "all", name: "Todas as áreas" },
    ...(snapshot?.areas ?? []).map((area) => ({ id: area.id, name: area.name })),
  ], [snapshot]);
  const selectedMachineRow = snapshot?.machineRows.find((row) => row.machine.id === selectedMachine?.id);
  const selectedAreaRow = snapshot?.areaRows.find((row) => row.area.id === selectedArea?.id);
  const primaryRiskRow = snapshot?.operationRows.find(
    (row) => row.operation.id === priorityOperationId,
  );
  const priorityOperation = snapshot?.operations.find(
    (operation) => operation.id === priorityOperationId,
  );
  const primaryRiskError = priorityOperationId
    ? priorityError ?? snapshot?.riskErrorsByOperationId?.[priorityOperationId]
    : null;
  const aggregateCoverageLabel = snapshot?.riskCoverageComplete ? "completa" : "parcial";
  const riskValue = !snapshot
    ? loadError ? "Não disponível" : "Calculando..."
    : snapshot.riskCoverageComplete
      ? String(snapshot.machinesAtRisk)
      : snapshot.operationRows.length > 0
        ? "Parcial"
        : priorityError
          ? "Não disponível"
          : "Parcial";
  const scoreValue = !snapshot
    ? loadError ? "Não disponível" : "Calculando..."
    : snapshot.riskCoverageComplete
      ? String(avg)
      : snapshot.operationRows.length > 0
        ? "Parcial"
        : priorityError
          ? "Não disponível"
          : "Parcial";
  const retryPriorityRisk = (id: string) => {
    completedOperationIds.current.delete(id);
    requestedOperationIds.current.delete(id);
    requestMarkers.current.delete(id);
    priorityGeneration.current += 1;
    priorityRequest.invalidate();
    firstBatchScheduled.current = true;
    priorityResolved.current = false;
    setPriorityError(null);
    setPriorityPublished(false);
    requestBatch([id], true);
  };

  return (
    <AppLayout title="Dashboard do Gestor" subtitle="Visão consolidada da frota e risco operacional">
      <div id="topo" className="grid scroll-mt-20 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Máquinas monitoradas" value={String(monitored)} hint="Frota ativa hoje" icon={Tractor} tone="default" />
        <Kpi
          label="Operações em risco"
          value={riskValue}
          hint={`Score ≥ 70 · cobertura ${aggregateCoverageLabel}`}
          icon={Activity}
          tone="warning"
          trend={snapshot?.riskCoverageComplete ? { dir: "up", value: "+12%" } : undefined}
        />
        <Kpi
          label="Score médio da frota"
          value={scoreValue}
          hint={`Escala 0–100 · cobertura ${aggregateCoverageLabel}`}
          icon={Gauge}
          tone="success"
          trend={snapshot?.riskCoverageComplete ? { dir: "down", value: "-3%" } : undefined}
        />
        <Kpi
          label="Alertas críticos"
          value={snapshot ? String(snapshot.criticalAlerts) : String(actionableAlerts.alerts.filter((alert) => alert.severity === "critical").length)}
          hint={snapshot
            ? `Alertas ${snapshot.alertsSource === "postgres" ? "persistentes" : "demonstrativos"} filtrados pela carteira`
            : "Persistentes e ativos"}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        {loadError ?? (snapshot
          ? `${snapshot.source === "postgres" ? "PostgreSQL" : "Dados demonstrativos"} · ${snapshot.scopeRule} · alertas ${snapshot.alertsSource === "postgres" ? "persistentes" : "demonstrativos"}`
          : batchLoading ? "Calculando..." : "Carregando carteira do Gestor…")}
        {!snapshot && loadError && (
          <button
            type="button"
            className="ml-2 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
            onClick={() => setPhaseAAttempt((attempt) => attempt + 1)}
          >
            Tentar novamente
          </button>
        )}
      </div>

       {primaryRiskRow && (
        <PersonaV2RiskPanel
          persona="gestor"
          result={primaryRiskRow.evaluation.result}
          evaluation={primaryRiskRow.evaluation}
          recommendation={snapshot?.machineRows.find(
            (row) => row.machine.id === primaryRiskRow.operation.machineId,
          )?.recommendation}
        />
      )}
      {snapshot && priorityOperationId && !primaryRiskRow && priorityOperation && (
        <Card className="mt-4">
          <p className="text-sm text-muted-foreground">
            {primaryRiskError ??
              (priorityPublished ? "Não disponível" : "Parcial")}
          </p>
          {primaryRiskError && (
            <button
              type="button"
              className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
              onClick={() => retryPriorityRisk(priorityOperationId)}
            >
              Tentar novamente
            </button>
          )}
        </Card>
      )}
      {snapshot && Object.entries(snapshot.riskErrorsByOperationId ?? {})
        .filter(([operationId]) => operationId !== priorityOperationId)
        .map(([operationId, message]) => (
          <div key={operationId} className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            <span>{operationId}: {message}</span>
            <button type="button" onClick={() => requestBatch([operationId])} className="rounded-md border border-danger/40 px-3 py-1 text-xs font-medium">
              Tentar novamente
            </button>
          </div>
        ))}

      {snapshot && <GestorOperationalOverview overview={snapshot.operationalOverview} />}

      {snapshot && snapshot.alerts.length > 0 && (
        <Card className="mt-4">
          <SectionTitle
            title="Alertas da carteira"
            description={`Alertas ${snapshot.alertsSource === "postgres" ? "persistentes" : "demonstrativos"} filtrados pelas máquinas monitoradas`}
          />
          <div className="grid gap-2 md:grid-cols-2">
            {snapshot.alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{alert.type}</span>
                  <RiskBadge score={alert.level === "alto" ? 80 : alert.level === "medio" ? 55 : 25} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{alert.machineId} · {alert.message}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle
            title="Evolução do risco — últimos 7 dias"
            description={`Histórico demonstrativo · hoje com score V2 ${snapshot?.riskCoverageComplete ? "completo" : "parcial"} da frota`}
          />
          <TrendChart data={trendData} />
        </Card>

        <Card className="border-secondary/40 bg-secondary/5">
          <SectionTitle
            title="Resumo de priorização"
             description={snapshot?.riskCoverageComplete ? "Onde concentrar a atenção hoje" : "Cobertura parcial"}
          />
          <p className="text-sm leading-relaxed text-foreground">{headline}</p>
          <div className="mt-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Distribuição da frota
            </div>
            <DistributionBar alto={distrib.alto} medio={distrib.medio} baixo={distrib.baixo} />
          </div>
        </Card>
      </div>

      {/* Recomendações Prioritárias — derivadas dos top equipamentos do ranking filtrado */}
      <section id="recomendacoes" className="mt-6 block scroll-mt-20">
      <Card>
        <SectionTitle
          title="Recomendações Prioritárias"
          description={snapshot?.riskCoverageComplete
            ? "Top ações para os equipamentos mais críticos do ranking atual"
            : "Recomendações parciais dos equipamentos já avaliados"}
          
        />
        {(() => {
          const top = machineRows.slice(0, 3);
          if (top.length === 0) {
            return <p className="text-sm text-muted-foreground">Nenhum equipamento atende aos filtros atuais.</p>;
          }
          return (
            <div className="grid gap-3 lg:grid-cols-3">
              {top.map((r) => {
                 const rec = r.recommendation;
                return (
                  <div key={r.machine.id} className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">{r.machine.code} — Score {r.score}</div>
                        <div className="truncate text-muted-foreground">{r.machine.client} · {r.machine.area}</div>
                      </div>
                      <RiskBadge score={r.score} />
                    </div>
                    {rec && <RecommendationCard rec={rec} />}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>
      </section>


      <Card className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <FilterIcon className="h-4 w-4 text-muted-foreground" />
          Filtros
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <FilterSelect label="Cliente / Fazenda" value={clientId} options={clientOptions as { id: string; name: string }[]} onChange={(value) => { setClientId(value); setFilterDemandVersion((current) => current + 1); }} />
          <FilterSelect label="Nível de risco"    value={level}    options={levelOptions} onChange={(value) => { setLevel(value); setFilterDemandVersion((current) => current + 1); }} />
          <FilterSelect label="Tipo de operação"  value={operationType} options={opTypeOptions} onChange={(value) => { setOperationType(value); setFilterDemandVersion((current) => current + 1); }} />
          <FilterSelect label="Área / Região"     value={areaId}   options={areaOptions as { id: string; name: string }[]} onChange={(value) => { setAreaId(value); setFilterDemandVersion((current) => current + 1); }} />
        </div>
      </Card>

      {/* Tabs de Ranking */}
      <section id="ranking" className="mt-6 block scroll-mt-20">
      <Card>
        <Tabs value={activeRankingTab} onValueChange={handleRankingTabChange}>
          {snapshot && !snapshot.riskCoverageComplete && (
            <p className="mb-3 text-xs font-medium text-warning-foreground">
              {batchLoading
                ? "Ranking parcial — carregando somente itens visíveis, até 12 por solicitação."
                : Object.keys(snapshot.riskErrorsByOperationId ?? {}).length > 0 || priorityError
                  ? "Ranking parcial — Não disponível para todos os itens solicitados."
                  : "Ranking parcial — Parcial; carregue itens do ranking quando necessário."}
            </p>
          )}
          <TabsList className="mb-4">
            <TabsTrigger value="machines">Ranking por Equipamento</TabsTrigger>
            <TabsTrigger value="areas">Ranking por Área</TabsTrigger>
            <TabsTrigger value="opTypes">Visão por Tipo de Operação</TabsTrigger>
          </TabsList>

          <TabsContent value="machines">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Equipamento</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Cliente / Área</th>
                    <th className="px-3 py-2 text-left font-medium">Operador</th>
                    <th className="px-3 py-2 text-left font-medium">
                      <span className="inline-flex items-center gap-1">Score <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Principal fator</th>
                    <th className="px-3 py-2 text-left font-medium">Alertas</th>
                    <th className="px-3 py-2 text-left font-medium">Risco</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {machineRows.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {snapshot && !snapshot.riskCoverageComplete
                        ? priorityError ? "Não disponível para os filtros atuais." : "Parcial — itens visíveis ainda não avaliados."
                        : "Nenhum equipamento atende aos filtros."}
                    </td></tr>
                  )}
                  {machineRows.map((r, i) => {
                    const isHigh = r.level === "alto";
                    const isPriority = r.score >= 80;
                    return (
                      <tr
                        key={r.machine.id}
                        onClick={() => handleMachineSelection(r.machine)}
                        className={cn(
                          "cursor-pointer hover:bg-muted/40",
                          isPriority && "bg-danger/5",
                        )}
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <span className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
                            i === 0 ? "bg-danger/15 text-danger" : i < 3 ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground",
                          )}>{i + 1}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-foreground">{r.machine.code}</div>
                            {isPriority && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-danger-foreground">
                                <Flame className="h-2.5 w-2.5" /> Prioridade
                              </span>
                            )}
                            {isHigh && !isPriority && (
                              <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{r.machine.name}</div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.machine.type}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <div className="text-foreground">{r.machine.client}</div>
                          <div className="text-muted-foreground">{r.machine.area}</div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.machine.operator}</td>
                        <td className="px-3 py-2.5"><ScoreBar score={r.score} /></td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.mainFactor}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                            r.alertsCount > 0 ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground",
                          )}>
                            {r.alertsCount}
                          </span>
                        </td>
                        <td className="px-3 py-2.5"><RiskBadge score={r.score} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="areas">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Área / Região</th>
                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Score</th>
                    <th className="px-3 py-2 text-left font-medium">Op. ativas</th>
                    <th className="px-3 py-2 text-left font-medium">Máquinas</th>
                    <th className="px-3 py-2 text-left font-medium">Principal fator</th>
                    <th className="px-3 py-2 text-left font-medium">Risco</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {areaRows.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {snapshot && !snapshot.riskCoverageComplete
                        ? priorityError ? "Não disponível para os filtros atuais." : "Parcial — itens visíveis ainda não avaliados."
                        : "Nenhuma área atende aos filtros."}
                    </td></tr>
                  )}
                  {areaRows.map((r, i) => {
                    const isPriority = r.score >= 80;
                    return (
                      <tr
                        key={r.area.id}
                        onClick={() => handleAreaSelection(r.area)}
                        className={cn("cursor-pointer hover:bg-muted/40", isPriority && "bg-danger/5")}
                      >
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
                            i === 0 ? "bg-danger/15 text-danger" : i < 3 ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground",
                          )}>{i + 1}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-foreground">{r.area.name}</span>
                            {isPriority && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-danger-foreground">
                                <Flame className="h-2.5 w-2.5" /> Prioridade
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.area.client}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.area.type}</td>
                        <td className="px-3 py-2.5"><ScoreBar score={r.score} /></td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.activeOperations}</td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.machineCount}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.mainFactor}</td>
                        <td className="px-3 py-2.5"><RiskBadge score={r.score} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="opTypes">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {opTypeRows.length === 0 && (
                <div className="col-span-full rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                  {snapshot && !snapshot.riskCoverageComplete
                    ? priorityError ? "Não disponível para os filtros atuais." : "Parcial — itens visíveis ainda não avaliados."
                    : "Nenhum tipo de operação atende aos filtros."}
                </div>
              )}
              {opTypeRows.map((r) => (
                <div
                  key={r.type}
                  className={cn(
                    "rounded-xl border p-4",
                    r.level === "alto" ? "border-danger/40 bg-danger/5"
                      : r.level === "medio" ? "border-warning/40 bg-warning/5"
                      : "border-success/30 bg-success/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{r.type}</div>
                      <div className="text-xs text-muted-foreground">{r.count} operação(ões)</div>
                    </div>
                    <RiskBadge score={r.score} />
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div className="text-2xl font-semibold tabular-nums text-foreground">{r.score}</div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      Principal fator<br />
                      <span className="font-medium text-foreground">{r.mainFactor}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        {priorityPublished && (
          <button type="button" onClick={() => handleRankingTabChange(activeRankingTab)} className="mt-4 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
            Carregar mais itens do ranking
          </button>
        )}
      </Card>
      </section>

      <MachineDetailDialog
        machine={selectedMachine}
        relationalDetail={selectedMachineRow ? {
          score: selectedMachineRow.score,
          level: selectedMachineRow.level,
          mainFactor: selectedMachineRow.mainFactor,
          operation: selectedMachineRow.operation,
          recommendation: selectedMachineRow.recommendation,
          weights: snapshot!.weights,
          alerts: snapshot!.alerts.filter((alert) => alert.machineId === selectedMachineRow.machine.id),
          alertsSource: snapshot!.alertsSource,
        } : undefined}
        open={!!selectedMachine}
        onOpenChange={(o) => !o && setSelectedMachine(null)}
      />
      <AreaDetailDialog
        area={selectedArea}
        relationalDetail={selectedAreaRow ? {
          score: selectedAreaRow.score,
          level: selectedAreaRow.level,
          mainFactor: selectedAreaRow.mainFactor,
          machines: snapshot!.machineRows.filter((row) => row.machine.areaId === selectedAreaRow.area.id),
          operations: snapshot!.operationRows.filter((row) => row.operation.areaId === selectedAreaRow.area.id),
          alerts: snapshot!.alerts.filter((alert) => (
            snapshot!.operationRows.some((row) =>
              row.operation.areaId === selectedAreaRow.area.id &&
              row.operation.id === alert.operationId)
          )),
          alertsSource: snapshot!.alertsSource,
          weights: snapshot!.weights,
        } : undefined}
        open={!!selectedArea}
        onOpenChange={(o) => !o && setSelectedArea(null)}
      />
    </AppLayout>
  );
}
