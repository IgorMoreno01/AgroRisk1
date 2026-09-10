import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppLayout, Card } from "@/components/app-layout";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import {
  machines, clients, areas, operations, alerts, users,
  type MachineStatus, type AlertCriticality, type AlertStatus,
} from "@/lib/mock-data";
import {
  riskResultForMachine, scoreClientWithWeights, scoreAreaWithWeights,
  scoreByOperationTypeWithWeights, riskResultForOperation, dominantFactorLabel,
} from "@/lib/risk-score";
import { rankMachines, rankAreas, machineDistribution, areaDistribution } from "@/lib/ranking";
import {
  allRecommendationsConsolidated, countByCategory, countByPriority,
  type RecCategory, type RecPriority,
} from "@/lib/recommendations";
import { Tractor, Building2, Map, ListChecks, Bell, Gauge, Trophy, Flame, Lightbulb, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { RequireProfile } from "@/components/require-profile";
import { ProfileAlertsSection } from "@/components/profile-alerts-section";
import { getProfileAlerts } from "@/lib/profile-alerts";
import { useRiskConfig } from "@/lib/risk-config";
import { AdminV2RiskPanel } from "@/components/admin-v2-risk-panel";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "AgroRisk · Admin / Sompo" }] }),
  component: () => (
    <RequireProfile path="/admin">
      <AdminPage />
    </RequireProfile>
  ),
});

const tabs = [
  { id: "visao-geral", label: "Visão geral",            icon: ShieldCheck, count: null as number | null },
  { id: "rankings",    label: "Rankings de risco",      icon: Trophy,      count: 2 },
  { id: "scores",      label: "Scores consolidados",    icon: Gauge,       count: 4 },
  { id: "recs",        label: "Recomendações prioritárias", icon: Lightbulb, count: null as number | null },
  { id: "clients",     label: "Clientes monitorados",   icon: Building2,   count: clients.length },
  { id: "machines",    label: "Máquinas monitoradas",   icon: Tractor,     count: machines.length },
  { id: "areas",       label: "Áreas e regiões",        icon: Map,         count: areas.length },
  { id: "operations",  label: "Operações monitoradas", icon: ListChecks,   count: operations.length },
  { id: "alerts",      label: "Central de alertas",     icon: Bell,        count: alerts.length },
  { id: "motor-risco", label: "Configuração do motor de risco", icon: SlidersHorizontal, count: null as number | null },
] as const;

type TabId = (typeof tabs)[number]["id"];

function AdminPage() {
  const { weights } = useRiskConfig();
  const [tab, setTab] = useState<TabId>("visao-geral");

  useEffect(() => {
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
  }, []);

  const current = tabs.find((t) => t.id === tab)!;
  const currentCount = tab === "recs"
    ? allRecommendationsConsolidated(weights).length
    : current.count;
  const Icon = current.icon;

  return (
    <AppLayout
      title="Dashboard da Sompo"
      subtitle="Visão consolidada dos clientes, frota, áreas, riscos e recomendações do MVP"
    >
      <div id="topo" className="scroll-mt-20" />

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
          <div id="central-alertas" className="space-y-4 scroll-mt-20">
            <Card className="p-0"><AlertsTable /></Card>
            <ProfileAlertsSection bundle={getProfileAlerts("admin")} />
          </div>
        )}
        {tab === "motor-risco" && <RiskEngineConfigurationPanel />}
      </div>
    </AppLayout>
  );
}

function RiskEngineConfigurationPanel() {
  return <AdminV2RiskPanel />;
}

function OverviewPanel() {
  const { weights } = useRiskConfig();
  const mDist = machineDistribution({}, weights);
  const aDist = areaDistribution({}, weights);
  const avgScore = Math.round(
    machines.reduce((acc, m) => acc + riskResultForMachine(m.id, weights).finalScore, 0) / machines.length,
  );
  const criticalAlerts = alerts.filter((a) => a.criticality === "alta").length;
  const opsAtRisk = operations.filter((o) => riskResultForOperation(o, weights).finalScore >= 71).length;
  const topRecs = allRecommendationsConsolidated(weights)
    .filter((r) => r.rec.priority === "alta")
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Máquinas monitoradas" value={String(machines.length)} tone="info" />
        <SummaryCard label="Operações em risco" value={String(opsAtRisk)} tone="warning" />
        <SummaryCard label="Score médio da frota" value={String(avgScore)} tone={avgScore >= 71 ? "danger" : avgScore >= 41 ? "warning" : "success"} />
        <SummaryCard label="Alertas críticos" value={String(criticalAlerts)} tone="danger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 text-sm font-semibold text-foreground">Distribuição da frota por risco</div>
          <div className="space-y-2 text-sm">
            <DistRow label="Risco alto"  mq={mDist.alto}  ar={aDist.alto}  tone="danger" />
            <DistRow label="Risco médio" mq={mDist.medio} ar={aDist.medio} tone="warning" />
            <DistRow label="Risco baixo" mq={mDist.baixo} ar={aDist.baixo} tone="success" />
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

function DistRow({ label, mq, ar, tone }: { label: string; mq: number; ar: number; tone: "danger" | "warning" | "success" }) {
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
  const { weights } = useRiskConfig();
  const mRows = rankMachines({}, weights);
  const aRows = rankAreas({}, weights);
  const mDist = machineDistribution({}, weights);
  const aDist = areaDistribution({}, weights);

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
  const { weights } = useRiskConfig();
  const rows = allRecommendationsConsolidated(weights);
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
  const { weights } = useRiskConfig();
  const machineRows = machines.map((m) => ({ m, b: riskResultForMachine(m.id, weights) }));
  const clientRows  = clients.map((c) => scoreClientWithWeights(c.id, weights));
  const areaRows    = areas.map((a) => scoreAreaWithWeights(a.id, weights));
  const opTypeRows  = scoreByOperationTypeWithWeights(weights);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Scores por máquina
        </div>
        <TableShell headers={["Equipamento", "Cliente", "Score", "Principal fator", "Risco"]}>
          {machineRows.map(({ m, b }) => (
            <tr key={m.id} className="hover:bg-muted/40">
              <TD><div className="font-medium text-foreground">{m.name}</div><div className="text-xs text-muted-foreground">{m.id}</div></TD>
              <TD className="text-xs text-muted-foreground">{m.client}</TD>
               <TD><ScoreBar score={b.finalScore} /></TD>
               <TD className="text-xs text-muted-foreground">{dominantFactorLabel(b.dominantFactor)}</TD>
               <TD><RiskBadge score={b.finalScore} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Scores por cliente / fazenda
        </div>
        <TableShell headers={["Cliente", "Score médio", "Máq. risco alto", "Área crítica", "Risco"]}>
          {clientRows.map((c) => (
            <tr key={c.clientId} className="hover:bg-muted/40">
              <TD className="font-medium text-foreground">{c.name}</TD>
              <TD><ScoreBar score={c.score} /></TD>
              <TD className="tabular-nums">{c.machinesHigh}</TD>
              <TD className="text-xs text-muted-foreground">{c.topAreaName}</TD>
              <TD><RiskBadge score={c.score} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Scores por área / região
        </div>
        <TableShell headers={["Área", "Cliente", "Condição", "Score", "Principal fator", "Risco"]}>
          {areaRows.map((a) => (
            <tr key={a.areaId} className="hover:bg-muted/40">
              <TD className="font-medium text-foreground">{a.name}</TD>
              <TD className="text-xs text-muted-foreground">{a.clientName}</TD>
              <TD className="text-xs text-muted-foreground">{a.condition}</TD>
              <TD><ScoreBar score={a.score} /></TD>
              <TD className="text-xs text-muted-foreground">{a.topFactor}</TD>
              <TD><RiskBadge score={a.score} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Scores por tipo de operação
        </div>
        <TableShell headers={["Tipo", "Operações", "Score médio", "Risco"]}>
          {opTypeRows.map((s) => (
            <tr key={s.type} className="hover:bg-muted/40">
              <TD className="font-medium text-foreground">{s.type}</TD>
              <TD className="tabular-nums">{s.count}</TD>
              <TD><ScoreBar score={s.score} /></TD>
              <TD><RiskBadge score={s.score} /></TD>
            </tr>
          ))}
        </TableShell>
      </Card>
    </div>
  );
}

function MachinesTable() {
  const { weights } = useRiskConfig();
  return (
    <TableShell headers={["ID", "Equipamento", "Tipo", "Cliente", "Área", "Operador", "Status", "Score", "Risco"]}>
      {machines.map((m) => {
        const b = riskResultForMachine(m.id, weights);
        return (
          <tr key={m.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{m.id}</TD>
            <TD><div className="font-medium text-foreground">{m.name}</div><div className="text-xs text-muted-foreground">{m.model}</div></TD>
            <TD>{m.type}</TD>
            <TD>{m.client}</TD>
            <TD>{m.area}</TD>
            <TD>{m.operator}</TD>
            <TD><StatusPill label={m.status} tone={machineStatusTone[m.status]} /></TD>
            <TD><ScoreBar score={b.finalScore} /></TD>
            <TD><RiskBadge score={b.finalScore} /></TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

function ClientsTable() {
  const { weights } = useRiskConfig();
  return (
    <TableShell headers={["ID", "Cliente", "Localização", "Operação", "Máquinas", "Score médio", "Risco"]}>
      {clients.map((c) => {
        const s = scoreClientWithWeights(c.id, weights);
        return (
          <tr key={c.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{c.id}</TD>
            <TD className="font-medium text-foreground">{c.name}</TD>
            <TD>{c.location}</TD>
            <TD>{c.mainOperation}</TD>
            <TD className="tabular-nums">{c.machineCount}</TD>
            <TD><ScoreBar score={s.score} /></TD>
            <TD><RiskBadge score={s.score} /></TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

function AreasTable() {
  const { weights } = useRiskConfig();
  return (
    <TableShell headers={["ID", "Área", "Cliente", "Tipo", "Condição", "Água", "Score", "Risco"]}>
      {areas.map((a) => {
        const s = scoreAreaWithWeights(a.id, weights);
        return (
          <tr key={a.id} className="hover:bg-muted/40">
            <TD className="font-mono text-xs text-muted-foreground">{a.id}</TD>
            <TD className="font-medium text-foreground">{a.name}</TD>
            <TD>{a.client}</TD>
            <TD>{a.type}</TD>
            <TD>{a.condition}</TD>
            <TD className="capitalize">{a.nearWater}</TD>
            <TD><ScoreBar score={s.score} /></TD>
            <TD><RiskBadge score={s.score} /></TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

function OperationsTable() {
  const { weights } = useRiskConfig();
  return (
    <TableShell headers={["ID", "Máquina", "Tipo", "Área", "Início", "Duração", "Status", "Score", "Risco"]}>
      {operations.map((o) => {
        const b = riskResultForOperation(o, weights);
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
            <TD><ScoreBar score={b.finalScore} /></TD>
            <TD><RiskBadge score={b.finalScore} /></TD>
          </tr>
        );
      })}
    </TableShell>
  );
}

const alertCritTone: Record<AlertCriticality, "green" | "yellow" | "red"> = {
  baixa: "green",
  "média": "yellow",
  alta: "red",
};
const alertStatusTone: Record<AlertStatus, "yellow" | "blue" | "green"> = {
  aberto: "yellow",
  "em análise": "blue",
  resolvido: "green",
};

function AlertsTable() {
  return (
    <TableShell headers={["ID", "Tipo", "Máquina", "Operação", "Mensagem", "Criticidade", "Status", "Quando"]}>
      {alerts.map((a) => (
        <tr key={a.id} className="hover:bg-muted/40">
          <TD className="font-mono text-xs text-muted-foreground">{a.id}</TD>
          <TD className="font-medium text-foreground">{a.type}</TD>
          <TD>{a.machineId}</TD>
          <TD className="font-mono text-xs text-muted-foreground">{a.operationId}</TD>
          <TD className="max-w-[320px] text-muted-foreground">{a.message}</TD>
          <TD><StatusPill label={a.criticality} tone={alertCritTone[a.criticality]} /></TD>
          <TD><StatusPill label={a.status} tone={alertStatusTone[a.status]} /></TD>
          <TD className="text-xs text-muted-foreground">{a.time}</TD>
        </tr>
      ))}
    </TableShell>
  );
}

function UsersTable() {
  return (
    <TableShell headers={["ID", "Nome", "Perfil", "Cliente associado", "Permissões"]}>
      {users.map((u) => (
        <tr key={u.id} className="hover:bg-muted/40">
          <TD className="font-mono text-xs text-muted-foreground">{u.id}</TD>
          <TD className="font-medium text-foreground">{u.name}</TD>
          <TD className="capitalize">{u.profile}</TD>
          <TD>{u.clientId ?? "—"}</TD>
          <TD className="text-xs text-muted-foreground">{u.permissions.join(", ")}</TD>
        </tr>
      ))}
    </TableShell>
  );
}
