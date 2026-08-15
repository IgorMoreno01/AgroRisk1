import { Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge } from "@/components/risk-badge";
import { cn } from "@/lib/utils";
import type { ScoreBreakdown } from "@/lib/risk-score";
import type { Machine, Area, Operation } from "@/lib/mock-data";
import type { NextBestAction } from "@/lib/recommendations";
import {
  Activity, Tractor, MapPin, Gauge, AlertTriangle, ArrowRight,
  Droplets, Navigation, ShieldAlert, CheckCircle2, Bell, Eye, PlayCircle,
} from "lucide-react";

// ============================================================
// Resumo operacional
// ============================================================
export function OperationalSummary({
  operation, machine, area, breakdown, nextAction,
}: {
  operation: Operation;
  machine: Machine;
  area: Area;
  breakdown: ScoreBreakdown;
  nextAction: NextBestAction | null;
}) {
  const rows: Array<{ label: string; value: string; icon: React.ElementType }> = [
    { label: "Operação",     value: operation.id,         icon: Activity },
    { label: "Equipamento",  value: machine.name,         icon: Tractor },
    { label: "Área",         value: area.name,            icon: MapPin },
    { label: "Tipo",         value: operation.type,       icon: Navigation },
    { label: "Fator dominante", value: breakdown.mainFactor, icon: AlertTriangle },
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
            <span className="text-sm font-semibold text-foreground">{breakdown.total}/100</span>
            <RiskBadge level={breakdown.level} />
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
  area, breakdown,
}: {
  area: Area;
  breakdown: ScoreBreakdown;
}) {
  const { meters, zone } = waterMetersFrom(breakdown);
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
          <rect x="0" y="0" width="200" height="110" fill="#f1f5e9" />
          {/* talhão verde */}
          <rect x="6" y="8" width="120" height="94" rx="6" fill="#d9ead0" stroke="#a7c79a" strokeWidth="0.8" />
          {/* corpo d'água azul à direita */}
          <path d="M200,0 Q150,20 145,55 Q150,95 200,110 Z" fill="#bcd8f1" stroke="#7fb0d8" strokeWidth="0.8" />
          {/* área de atenção (faixa próxima da água) */}
          <path
            d="M200,12 Q165,30 162,55 Q165,85 200,100 L200,12 Z"
            fill="#fde68a"
            opacity="0.55"
          />
          {/* área segura (longe) */}
          <circle cx="30" cy="80" r="12" fill="#c6e7c1" opacity="0.9" />
          {/* rota A (atual) - tracejada vermelha */}
          <path
            d={`M20,90 C 60,80 ${machineX + 5},70 ${machineX + 18},${zone === "Crítico" ? 50 : 55}`}
            stroke="#dc2626" strokeWidth="1.4" fill="none" strokeDasharray="3 2"
          />
          {/* rota B (alternativa) - tracejada verde */}
          <path
            d="M20,90 C 50,60 70,40 110,28"
            stroke="#16a34a" strokeWidth="1.4" fill="none" strokeDasharray="3 2"
          />
          {/* marcador máquina */}
          <g transform={`translate(${machineX},${zone === "Crítico" ? 52 : 58})`}>
            <circle r="5" fill="#0f172a" />
            <circle r="2" fill="#fff" />
          </g>
          {/* marcador água */}
          <g transform="translate(178,55)">
            <circle r="4" fill="#1d4ed8" />
          </g>
          {/* marcador área segura */}
          <g transform="translate(30,80)">
            <circle r="3.2" fill="#16a34a" />
          </g>
        </svg>

        {/* Legenda flutuante */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 text-[10px]">
          <span className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-foreground shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#0f172a]" /> Máquina
          </span>
          <span className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-foreground shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#1d4ed8]" /> Água
          </span>
          <span className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-foreground shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#16a34a]" /> Área segura
          </span>
        </div>
      </div>

      {/* Dados textuais */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <Info icon={MapPin}    label="Área atual"  value={area.name} />
        <Info icon={Navigation} label="Tipo de área" value={area.type} />
        <Info icon={Droplets}  label="Distância até água" value={`${meters} m`} />
        <Info icon={ShieldAlert} label="Zona crítica" value={zone} />
        <Info icon={Navigation} label="Rota atual" value="Rota A" valueClass="text-danger" />
        <Info icon={ArrowRight} label="Rota alternativa" value="Rota B (sugerida)" valueClass="text-success" />
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
  operation, breakdown, area,
}: {
  operation: Operation;
  breakdown: ScoreBreakdown;
  area: Area;
}) {
  const events: Array<{ time: string; type: EventType; title: string; desc: string }> = [
    { time: "07:12", type: "start", title: "Operação iniciada", desc: `${operation.id} iniciada no ${area.name}` },
    { time: "07:14", type: "score", title: "Score atualizado",  desc: `Risco ${breakdown.level} calculado em ${breakdown.total}/100` },
    { time: "07:15", type: "rec",   title: "Recomendação gerada", desc: "Alterar rota para evitar área próxima de água" },
    { time: "07:16", type: "alert", title: "Alerta registrado",   desc: `Fator dominante: ${breakdown.mainFactor}` },
    { time: "07:17", type: "ack",   title: "Ação confirmada",     desc: "Operador confirmou ciência da recomendação" },
    { time: "07:19", type: "score", title: "Score recalculado",   desc: "Aguardando confirmação de mudança de rota" },
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
