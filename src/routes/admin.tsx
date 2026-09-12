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
import { evaluateAdminRiskBatch, getAdminDashboard } from "@/lib/api/admin-dashboard.functions";
import type { AdminDashboardSnapshot } from "@/lib/admin-dashboard-types";
import { mergeAdminOperationRows } from "@/lib/admin-dashboard-merge";
import { AdminOperationalOverview } from "@/components/admin-operational-overview";
import { useActionableAlerts } from "@/lib/actionable-alerts";

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
} | null>(null);

function useAdminDashboardData() {
  const state = useContext(AdminDashboardContext);
  if (!state) throw new Error("AdminDashboardContext não foi inicializado.");
  return state.snapshot;
}

function useAdminDashboardLoader() {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      const token = getStoredSessionToken();
      if (!token) {
        if (!cancelled) setError("Sessão Admin/Sompo não encontrada.");
        return;
      }
      inFlight.current = true;
      try {
        const result = await getAdminDashboard({ data: { token } });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSnapshot(result.snapshot);
        setError(null);
      } catch {
        if (!cancelled) setError("Não foi possível carregar os dados do Admin/Sompo.");
      } finally {
        inFlight.current = false;
      }
    };

    void load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return { snapshot, error };
}

function AdminPage() {
  const { snapshot, error } = useAdminDashboardLoader();
  const [riskSnapshot, setRiskSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const requestedRiskIds = useRef(new Set<string>());
  const requestedRiskTabs = useRef(new Set<TabId>());
  const [tab, setTab] = useState<TabId>("visao-geral");
  const { snapshot: actionableAlerts } = useActionableAlerts();
  const tabs = useMemo(
    () => (riskSnapshot ? createTabs(riskSnapshot, actionableAlerts.alerts.length) : []),
    [riskSnapshot, actionableAlerts.alerts.length],
  );

  useEffect(() => {
    if (!snapshot) return;
    requestedRiskIds.current.clear();
    requestedRiskTabs.current.clear();
    setRiskSnapshot(snapshot);
    const token = getStoredSessionToken();
    if (!token || snapshot.operations.length === 0) return;
    const ids = [...snapshot.operations]
      .sort((left, right) =>
        (right.status === "Em andamento" ? 1 : 0) -
          (left.status === "Em andamento" ? 1 : 0) ||
        Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt),
      )
      .slice(0, 12)
      .map((operation) => operation.id);
    ids.forEach((id) => requestedRiskIds.current.add(id));
    void evaluateAdminRiskBatch({ data: { token, operationIds: ids, limit: 12 } })
      .then((result) => {
        if (result.ok) setRiskSnapshot((current) => current
          ? mergeAdminOperationRows(current, result.operationRows)
          : current);
      })
      .catch(() => {
        // The relational dashboard remains usable; each score keeps its
        // granular "Calculando..." state instead of inventing a value.
      });
  }, [snapshot]);

  // Each section requests only the operation IDs needed for its first visible
  // page. In particular, opening Operations never evaluates the remaining
  // portfolio eagerly.
  useEffect(() => {
    if (!riskSnapshot || tab === "visao-geral" || tab === "alerts" || tab === "motor-risco") return;
    if (requestedRiskTabs.current.has(tab)) return;
    const token = getStoredSessionToken();
    if (!token) return;
    requestedRiskTabs.current.add(tab);
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
    ids.forEach((id) => requestedRiskIds.current.add(id));
    void evaluateAdminRiskBatch({ data: { token, operationIds: ids, limit: ids.length } })
      .then((result) => {
        if (!result.ok) return;
        setRiskSnapshot((current) => current
          ? mergeAdminOperationRows(current, result.operationRows)
          : current);
      })
      .catch(() => undefined);
  }, [tab, riskSnapshot]);

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
          <div className="text-sm font-medium text-foreground">
            {error ?? "Carregando dados relacionais do Admin/Sompo..."}
          </div>
        </Card>
      </AppLayout>
    );
  }

   const current = tabs.find((t) => t.id === tab)!;
  const currentCount = tab === "recs" ? riskSnapshot.operationRows.length : current.count;
  const Icon = current.icon;

  return (
       <AdminDashboardContext.Provider value={{ snapshot: riskSnapshot, setSnapshot: setRiskSnapshot }}>
      <AppLayout
      title="Dashboard da Sompo"
      subtitle="Visão consolidada dos clientes, frota, áreas, riscos e recomendações do MVP"
    >
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
          ? "PostgreSQL indisponível para clientes, máquinas, áreas e operações — exibindo fallback seguro com dados demonstrativos."
           : `Clientes, máquinas, áreas e operações: PostgreSQL · scores calculados pelo Risk Engine V2 com pesos Climático ${riskSnapshot.weights.ml}% / Operacional ${riskSnapshot.weights.operationalRules}%; sinais ainda não persistidos usam os vetores de referência homologados.`}
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
      </div>
      </AppLayout>
    </AdminDashboardContext.Provider>
  );
}

function RiskEngineConfigurationPanel() {
  const data = useAdminDashboardData();
  const evaluation = data.operationRows[0]?.evaluation;
  if (!evaluation) return <Card>Nenhuma operação disponível para avaliação.</Card>;
  return <AdminV2RiskPanel evaluation={evaluation} />;
}

function OverviewPanel() {
  const data = useAdminDashboardData();
  const mDist = data.machineDistribution;
  const aDist = data.areaDistribution;
  const { snapshot: actionableAlerts } = useActionableAlerts();
  const criticalAlerts = actionableAlerts.alerts.filter((alert) => alert.severity === "critical").length;
  const topRecs = adminV2RecommendationRows(data)
    .filter((r) => r.rec.priority === "alta")
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Máquinas monitoradas" value={String(data.machines.length)} tone="info" />
         <SummaryCard label="Operações em risco" value="Calculando..." tone="warning" />
         <SummaryCard label="Score médio da frota" value="Calculando..." tone="info" />
        <SummaryCard label="Alertas críticos" value={String(criticalAlerts)} tone="danger" />
      </div>

      <AdminOperationalOverview overview={data.operationalOverview} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 text-sm font-semibold text-foreground">Distribuição da frota por risco</div>
          <div className="space-y-2 text-sm">
             <DistRow label="Risco alto"  mq={mDist.total ? mDist.alto : "Calculando..."}  ar={aDist.total ? aDist.alto : "Calculando..."} tone="danger" />
             <DistRow label="Risco médio" mq={mDist.total ? mDist.medio : "Calculando..."} ar={aDist.total ? aDist.medio : "Calculando..."} tone="warning" />
             <DistRow label="Risco baixo" mq={mDist.total ? mDist.baixo : "Calculando..."} ar={aDist.total ? aDist.baixo : "Calculando..."} tone="success" />
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
              <div className="text-sm text-muted-foreground">Sem recomendações de prioridade alta no momento.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DistRow({ label, mq, ar, tone }: { label: string; mq: number | string; ar: number | string; tone: "danger" | "warning" | "success" }) {
  const dot = { danger: "bg-danger", warning: "bg-warning", success: "bg-success" }[tone];
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <span className="text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
        <span><b className="text-foreground">{mq}</b> máq.</span>
        <span><b className="text-foreground">{ar}</b> áreas</span>
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
      <div className="grid gap-3 sm:grid-cols-3">
        <DistCard label="Risco alto"  alto={mDist.alto}  medio={aDist.alto}  tone="danger" />
        <DistCard label="Risco médio" alto={mDist.medio} medio={aDist.medio} tone="warning" />
        <DistCard label="Risco baixo" alto={mDist.baixo} medio={aDist.baixo} tone="success" />
      </div>

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

  const catEntries = Object.entries(byCat).filter(([, n]) => n > 0) as [RecCategory, number][];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Recomendações geradas" value={String(rows.length)} tone="info" />
        <SummaryCard label="Prioridade alta"  value={String(byPrio.alta)}    tone="danger" />
        <SummaryCard label="Prioridade média" value={String(byPrio["média"])} tone="warning" />
        <SummaryCard label="Prioridade baixa" value={String(byPrio.baixa)}   tone="success" />
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
          Recomendações consolidadas ({rows.length})
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
  const riskByMachine = new Map(data.machineRows.map((row) => [row.machine.id, row]));
  return (
    <TableShell headers={["ID", "Equipamento", "Tipo", "Cliente", "Área", "Operador", "Status", "Score", "Risco"]}>
      {data.machines.map((m) => {
        const risk = riskByMachine.get(m.id);
        return (
          <tr key={m.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{m.id}</TD>
            <TD><div className="font-medium text-foreground">{m.name}</div><div className="text-xs text-muted-foreground">{m.model}</div></TD>
            <TD>{m.type}</TD>
            <TD>{m.client}</TD>
            <TD>{m.area}</TD>
            <TD>{m.operator}</TD>
            <TD><StatusPill label={m.status} tone={machineStatusTone[m.status]} /></TD>
            <TD>{risk ? <ScoreBar score={risk.score} /> : "Calculando..."}</TD>
            <TD>{risk ? <RiskBadge score={risk.score} /> : "Calculando..."}</TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

function ClientsTable() {
  const data = useAdminDashboardData();
  const riskByClient = new Map(data.clientRows.map((row) => [row.client.id, row]));
  return (
    <TableShell headers={["ID", "Cliente", "Localização", "Operação", "Máquinas", "Score médio", "Risco"]}>
      {data.clients.map((c) => {
        const risk = riskByClient.get(c.id);
        return (
          <tr key={c.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{c.id}</TD>
            <TD className="font-medium text-foreground">{c.name}</TD>
            <TD>{c.location}</TD>
            <TD>{c.mainOperation}</TD>
            <TD className="tabular-nums">{c.machineCount}</TD>
            <TD>{risk ? <ScoreBar score={risk.score} /> : "Calculando..."}</TD>
            <TD>{risk ? <RiskBadge score={risk.score} /> : "Calculando..."}</TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

function AreasTable() {
  const data = useAdminDashboardData();
  const riskByArea = new Map(data.areaRows.map((row) => [row.area.id, row]));
  return (
    <TableShell headers={["ID", "Área", "Cliente", "Tipo", "Condição", "Água", "Score", "Risco"]}>
      {data.areas.map((a) => {
        const risk = riskByArea.get(a.id);
        return (
          <tr key={a.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{a.id}</TD>
            <TD className="font-medium text-foreground">{a.name}</TD>
            <TD>{a.client}</TD>
            <TD>{a.type}</TD>
            <TD>{a.condition || "Não informada"}</TD>
            <TD className="capitalize">{a.nearWater}</TD>
            <TD>{risk ? <ScoreBar score={risk.score} /> : "Calculando..."}</TD>
            <TD>{risk ? <RiskBadge score={risk.score} /> : "Calculando..."}</TD>
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
            <TD>{risk ? <ScoreBar score={risk.score} /> : "Calculando..."}</TD>
            <TD>{risk ? <RiskBadge score={risk.score} /> : "Calculando..."}</TD>
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
              const token = getStoredSessionToken();
              const ids = data.operations.slice(next * pageSize, (next + 1) * pageSize).map((operation) => operation.id);
              if (!token || !dashboardState) return;
              void evaluateAdminRiskBatch({ data: { token, operationIds: ids, limit: ids.length } }).then((result) => {
                if (result.ok) dashboardState.setSnapshot((current) => current
                  ? mergeAdminOperationRows(current, result.operationRows)
                  : current);
              });
            }}
          >Próxima página</button>
        )}
      </div>
    </div>
  );
}
