import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { ProfileAlertsSection } from "@/components/profile-alerts-section";
import { getProfileAlerts } from "@/lib/profile-alerts";
import { getStoredSessionToken } from "@/lib/auth";
import { getGestorDashboard } from "@/lib/api/gestor-dashboard.functions";
import type { GestorDashboardSnapshot } from "@/lib/gestor-dashboard-types";
import { PersonaV2RiskPanel } from "@/components/persona-v2-risk-panel";

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
  const [clientId,     setClientId]     = useState<string>("all");
  const [level,        setLevel]        = useState<RiskLevel | "all">("all");
  const [operationType, setOperationType] = useState<OperationType | "all">("all");
  const [areaId,       setAreaId]       = useState<string>("all");

  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);

  const [snapshot, setSnapshot] = useState<GestorDashboardSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredSessionToken();
    if (!token) return;
    void getGestorDashboard({ data: { token } })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) setLoadError(result.error);
        else setSnapshot(result.snapshot);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Não foi possível carregar o dashboard.");
      });
    return () => { cancelled = true; };
  }, []);

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
    ? `Priorize ${machineRows[0].machine.code}, com score ${machineRows[0].score} e atenção principal em ${machineRows[0].mainFactor.toLowerCase()}.`
    : "Nenhum equipamento atende aos filtros atuais.";
  const monitored = snapshot?.machineRows.length ?? 0;
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
    ...(snapshot?.areaRows ?? []).map((row) => ({ id: row.area.id, name: row.area.name })),
  ], [snapshot]);
  const selectedMachineRow = snapshot?.machineRows.find((row) => row.machine.id === selectedMachine?.id);
  const selectedAreaRow = snapshot?.areaRows.find((row) => row.area.id === selectedArea?.id);

  return (
    <AppLayout title="Dashboard do Gestor" subtitle="Visão consolidada da frota e risco operacional">
      <div id="topo" className="grid scroll-mt-20 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Máquinas monitoradas" value={String(monitored)} hint="Frota ativa hoje" icon={Tractor} tone="default" />
        <Kpi label="Operações em risco" value={snapshot ? String(snapshot.machinesAtRisk) : "…"} hint="Score ≥ 70" icon={Activity} tone="warning" trend={{ dir: "up", value: "+12%" }} />
        <Kpi label="Score médio da frota" value={snapshot ? String(avg) : "…"} hint="Escala 0–100 (Risk Engine V2)" icon={Gauge} tone="success" trend={{ dir: "down", value: "-3%" }} />
        <Kpi label="Alertas críticos" value={snapshot ? String(snapshot.criticalAlerts) : "…"} hint="Em aberto" icon={AlertTriangle} tone="danger" />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        {loadError ?? (snapshot
          ? `${snapshot.source === "postgres" ? "PostgreSQL" : "Dados demonstrativos"} · ${snapshot.scopeRule} · alertas demonstrativos`
          : "Carregando carteira do Gestor…")}
      </div>

      <PersonaV2RiskPanel persona="gestor" />

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle
            title="Evolução do risco — últimos 7 dias"
            description="Histórico demonstrativo · hoje com score V2 da frota PostgreSQL"
          />
          <TrendChart data={trendData} />
        </Card>

        <Card className="border-secondary/40 bg-secondary/5">
          <SectionTitle
            title="Resumo de priorização"
            description="Onde concentrar a atenção hoje"
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
          description="Top ações para os equipamentos mais críticos do ranking atual"
          
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
          <FilterSelect label="Cliente / Fazenda" value={clientId} options={clientOptions as { id: string; name: string }[]} onChange={setClientId} />
          <FilterSelect label="Nível de risco"    value={level}    options={levelOptions} onChange={setLevel} />
          <FilterSelect label="Tipo de operação"  value={operationType} options={opTypeOptions} onChange={setOperationType} />
          <FilterSelect label="Área / Região"     value={areaId}   options={areaOptions as { id: string; name: string }[]} onChange={setAreaId} />
        </div>
      </Card>

      {/* Tabs de Ranking */}
      <section id="ranking" className="mt-6 block scroll-mt-20">
      <Card>
        <Tabs defaultValue="machines">
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
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum equipamento atende aos filtros.</td></tr>
                  )}
                  {machineRows.map((r, i) => {
                    const isHigh = r.level === "alto";
                    const isPriority = r.score >= 80;
                    return (
                      <tr
                        key={r.machine.id}
                        onClick={() => setSelectedMachine(r.machine)}
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
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma área atende aos filtros.</td></tr>
                  )}
                  {areaRows.map((r, i) => {
                    const isPriority = r.score >= 80;
                    return (
                      <tr
                        key={r.area.id}
                        onClick={() => setSelectedArea(r.area)}
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
                  Nenhum tipo de operação atende aos filtros.
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
      </Card>
      </section>

      {/* Alertas gerenciais (US 5 · personalização por perfil) */}
      <div className="mt-6">
        <ProfileAlertsSection bundle={getProfileAlerts("gestor")} />
      </div>

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
