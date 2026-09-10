import { Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge } from "@/components/risk-badge";
import { cn } from "@/lib/utils";
import { dominantFactorLabel, type RiskResult, type ScoreBreakdown } from "@/lib/risk-score";
import type { Alert, Machine, Area, HistoryEntry, Operation } from "@/lib/mock-data";
import type { OperatorAlert, OperatorHistoryEntry } from "@/lib/operador-dashboard-types";
import type { GeneratedRecommendation, NextBestAction } from "@/lib/recommendations";
import type { WaterGeoData, RouteData } from "@/lib/external-data.types";
import {
  Activity, Tractor, MapPin, Gauge, AlertTriangle, ArrowRight,
  Droplets, Navigation, ShieldAlert, CheckCircle2, Bell, Eye, PlayCircle,
  Wifi, WifiOff, Loader2,
} from "lucide-react";

// ============================================================
// Resumo operacional
// ============================================================
export function OperationalSummary({
  operation, machine, area, result, nextAction,
}: {
  operation: Operation;
  machine: Machine;
  area: Area;
  result: RiskResult;
  nextAction: NextBestAction | null;
}) {
  const rows: Array<{ label: string; value: string; icon: React.ElementType }> = [
    { label: "Operação",     value: operation.id,         icon: Activity },
    { label: "Equipamento",  value: machine.name,         icon: Tractor },
    { label: "Área",         value: area.name,            icon: MapPin },
    { label: "Tipo",         value: operation.type,       icon: Navigation },
    { label: "Componente dominante", value: dominantFactorLabel(result.dominantFactor), icon: AlertTriangle },
    { label: "Fator responsável", value: nextAction?.factor ?? result.breakdown.mainFactor, icon: AlertTriangle },
  ];

  return (
    <Card>
      <SectionTitle
        title="Resumo operacional"
        description="Snapshot rápido do estado atual"
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            {operation.status}
          </span>
        }
      />

      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
            <div className="flex min-w-0 items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <r.icon className="h-3.5 w-3.5 shrink-0" />
              {r.label}
            </div>
            <div className="truncate text-right text-sm font-medium text-foreground">{r.value}</div>
          </div>
        ))}

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            Score atual
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{result.finalScore}/100</span>
            <RiskBadge level={result.level} />
          </div>
        </div>

        {nextAction && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Próxima melhor ação</div>
              <div className="text-sm text-foreground">{nextAction.title}</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// Contexto geográfico (mini-mapa simulado)
// ============================================================
type Zone = "Seguro" | "Atenção" | "Crítico";

function waterMetersFrom(breakdown: ScoreBreakdown): { meters: number; zone: Zone } {
  const water = breakdown.parts.find((p) => p.category === "Proximidade de água");
  const detail = water?.detail ?? "";
  if (detail.includes("Abaixo")) return { meters: 35, zone: "Crítico" };
  if (detail.includes("50 e 100")) return { meters: 85, zone: "Atenção" };
  if (detail.includes("100 e 150")) return { meters: 120, zone: "Atenção" };
  return { meters: 200, zone: "Seguro" };
}

const zoneBadge: Record<Zone, string> = {
  Seguro: "bg-success/15 text-success",
  Atenção: "bg-warning/15 text-warning",
  Crítico: "bg-danger/15 text-danger",
};

export function GeoContextCard({
  area, breakdown, waterGeo, loadingWater, routeData, loadingRoute,
}: {
  area: Area;
  breakdown: ScoreBreakdown;
  waterGeo?: WaterGeoData | null;
  loadingWater?: boolean;
  routeData?: RouteData | null;
  loadingRoute?: boolean;
}) {
  // Usa distância real quando disponível; fallback para derivação do mock
  const { meters: mockMeters, zone: mockZone } = waterMetersFrom(breakdown);
  const realDistM = waterGeo?.nearestDistanceM ?? null;
  const meters = realDistM ?? mockMeters;
  const zone: Zone = realDistM !== null
    ? realDistM <= 50 ? "Crítico" : realDistM <= 150 ? "Atenção" : "Seguro"
    : mockZone;
  // Machine X position based on water proximity: closer water => more to the right (near water)
  const machineX = zone === "Crítico" ? 58 : zone === "Atenção" ? 48 : 38;

  return (
    <Card>
      <SectionTitle
        title="Contexto geográfico da operação"
        description="Representação esquemática · uso interno (sem GPS real)"
        action={
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", zoneBadge[zone])}>
            <ShieldAlert className="h-3 w-3" />
            Zona {zone}
          </span>
        }
      />

      {/* Mini-mapa SVG */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted/40">
        <svg viewBox="0 0 200 110" className="block h-44 w-full">
          {/* terreno */}
          <rect x="0" y="0" width="200" height="110" fill="var(--color-surface-alt)" />
          {/* talhão verde */}
          <rect x="6" y="8" width="120" height="94" rx="6" fill="var(--color-success-subtle)" stroke="var(--color-success)" strokeOpacity="0.45" strokeWidth="0.8" />
          {/* corpo d'água azul à direita */}
          <path d="M200,0 Q150,20 145,55 Q150,95 200,110 Z" fill="var(--color-info-subtle)" stroke="var(--color-info)" strokeOpacity="0.55" strokeWidth="0.8" />
          {/* área de atenção (faixa próxima da água) */}
          <path
            d="M200,12 Q165,30 162,55 Q165,85 200,100 L200,12 Z"
            fill="var(--color-warning-subtle)"
          />
          {/* área segura (longe) */}
          <circle cx="30" cy="80" r="12" fill="var(--color-success-subtle)" />
          {/* rota A (atual) - tracejada vermelha */}
          <path
            d={`M20,90 C 60,80 ${machineX + 5},70 ${machineX + 18},${zone === "Crítico" ? 50 : 55}`}
            stroke="var(--color-error)" strokeWidth="1.4" fill="none" strokeDasharray="3 2"
          />
          {/* rota B (alternativa) - tracejada verde */}
          <path
            d="M20,90 C 50,60 70,40 110,28"
            stroke="var(--color-success)" strokeWidth="1.4" fill="none" strokeDasharray="3 2"
          />
          {/* marcador máquina */}
          <g transform={`translate(${machineX},${zone === "Crítico" ? 52 : 58})`}>
            <circle r="5" fill="var(--color-inverse)" />
            <circle r="2" fill="var(--color-surface)" />
          </g>
          {/* marcador água */}
          <g transform="translate(178,55)">
            <circle r="4" fill="var(--color-info)" />
          </g>
          {/* marcador área segura */}
          <g transform="translate(30,80)">
            <circle r="3.2" fill="var(--color-success)" />
          </g>
        </svg>

        {/* Legenda flutuante */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 text-[10px]">
          <span className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-foreground shadow-sm">
            <span className="h-2 w-2 rounded-full bg-inverse" /> Máquina
          </span>
          <span className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-foreground shadow-sm">
            <span className="h-2 w-2 rounded-full bg-info" /> Água
          </span>
          <span className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-foreground shadow-sm">
            <span className="h-2 w-2 rounded-full bg-success" /> Área segura
          </span>
        </div>
      </div>

      {/* Badge de fonte dos dados de hidrografia */}
      <div className="mt-3 flex items-center gap-2">
        {loadingWater ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Buscando corpos d'água…
          </span>
        ) : waterGeo?.source === "overpass" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-info">
            <Wifi className="h-3 w-3" />
            {waterGeo.features.length > 0
              ? `${waterGeo.features.length} feição(ões) OSM · mais próxima: ${waterGeo.nearestName ?? "—"} (${meters} m)`
              : "Sem corpos d'água num raio de 3 km (OSM)"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <WifiOff className="h-3 w-3" /> Dados hidrográficos simulados
          </span>
        )}
      </div>

      {/* Dados textuais */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Info icon={MapPin}    label="Área atual"  value={area.name} />
        <Info icon={Navigation} label="Tipo de área" value={area.type} />
        <Info icon={Droplets}  label="Distância até água" value={`${meters} m`} />
        <Info icon={ShieldAlert} label="Zona crítica" value={zone} />
        <Info
          icon={Navigation}
          label="Rota principal"
          value={
            loadingRoute
              ? "Calculando…"
              : routeData && routeData.source !== "mock"
              ? `${routeData.primary.distanceLabel} · ${routeData.primary.durationLabel}`
              : "—"
          }
          valueClass={routeData && routeData.source !== "mock" ? "text-primary" : "text-muted-foreground"}
        />
        <Info
          icon={ArrowRight}
          label="Rota alternativa"
          value={
            loadingRoute
              ? "Calculando…"
              : routeData && routeData.source !== "mock" && routeData.alternative
              ? `${routeData.alternative.distanceLabel} · ${routeData.alternative.durationLabel}`
              : routeData && routeData.source !== "mock"
              ? "Sem alternativa"
              : "—"
          }
          valueClass={routeData?.alternative ? "text-success" : "text-muted-foreground"}
        />
      </div>

      {/* Badge de fonte dos dados de rota */}
      <div className="mt-2 flex items-center gap-2">
        {loadingRoute ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Calculando rota…
          </span>
        ) : routeData?.source === "openrouteservice" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-info">
            <Wifi className="h-3 w-3" />
            Rota real · openrouteservice
            {routeData.alternative ? " · rota alternativa disponível" : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <WifiOff className="h-3 w-3" /> Configure ORS_API_KEY para rota real
          </span>
        )}
      </div>
    </Card>
  );
}

function Info({
  icon: Icon, label, value, valueClass,
}: {
  icon: React.ElementType; label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-medium text-foreground", valueClass)}>{value}</div>
    </div>
  );
}

// ============================================================
// Histórico recente
// ============================================================
type EventType = "start" | "score" | "rec" | "alert" | "ack";
const eventStyle: Record<EventType, { icon: React.ElementType; color: string; bg: string }> = {
  start: { icon: PlayCircle,    color: "text-primary", bg: "bg-primary/10" },
  score: { icon: Gauge,         color: "text-foreground", bg: "bg-muted" },
  rec:   { icon: ArrowRight,    color: "text-success", bg: "bg-success/10" },
  alert: { icon: Bell,          color: "text-warning", bg: "bg-warning/10" },
  ack:   { icon: CheckCircle2,  color: "text-success", bg: "bg-success/10" },
};

export function RecentHistoryCard({
  operation, result, area, recommendation, history = [], alerts = [],
}: {
  operation: Operation;
  result: RiskResult;
  area: Area;
  recommendation?: GeneratedRecommendation;
  history?: Array<HistoryEntry | OperatorHistoryEntry>;
  alerts?: Array<Alert | OperatorAlert>;
}) {
  const events: Array<{ time: string; type: EventType; title: string; desc: string }> = [
    { time: operation.start, type: "start", title: "Operação iniciada", desc: `${operation.id} iniciada no ${area.name}` },
    { time: "atual", type: "score", title: "Score calculado", desc: `Risco ${result.level} calculado em ${result.finalScore}/100` },
    { time: "atual", type: "rec", title: "Recomendação gerada", desc: recommendation?.title ?? "Nenhuma ação adicional recomendada" },
    ...alerts.map((alert) => ({
      time: alert.time,
      type: "alert" as const,
      title: alert.type,
      desc: alert.message,
    })),
    ...history.map((entry) => ({
      time: entry.date,
      type: "ack" as const,
      title: "Registro anterior",
      desc: `${entry.summary}${"source" in entry && entry.source === "demo" ? " · demo" : ""}`,
    })),
  ];

  return (
    <Card>
      <SectionTitle
        title="Histórico recente"
        description="Últimos eventos da operação"
        action={
          <button className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
            <Eye className="h-3 w-3" /> Ver tudo
          </button>
        }
      />

      <ol className="relative space-y-3 border-l border-border pl-5">
        {events.map((e, i) => {
          const s = eventStyle[e.type];
          const Icon = s.icon;
          return (
            <li key={i} className="relative">
              <span className={cn("absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-card", s.bg)}>
                <Icon className={cn("h-3 w-3", s.color)} />
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{e.title}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{e.time}</span>
              </div>
              <p className="text-xs text-muted-foreground">{e.desc}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
