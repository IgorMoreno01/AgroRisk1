import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { RecommendationCard } from "@/components/recommendation-card";
import {
  type Area,
  alerts, operations, machines,
} from "@/lib/mock-data";
import { scoreArea, scoreMachine, scoreOperation } from "@/lib/risk-score";
import { recommendationsForArea } from "@/lib/recommendations";
import { AlertTriangle, MapPin, Tractor, Activity, History, Flame } from "lucide-react";

export function AreaDetailDialog({
  area,
  open,
  onOpenChange,
}: {
  area: Area | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!area) return null;
  const s = scoreArea(area.id);
  const areaMachines = machines.filter((m) => m.areaId === area.id);
  const areaOps = operations.filter((o) => o.areaId === area.id);
  const activeOps = areaOps.filter((o) => o.status === "Em andamento");
  const concluded = areaOps.filter((o) => o.status === "Concluída" || o.status === "Interrompida").slice(0, 4);
  const areaAlerts = alerts.filter((a) => areaOps.some((o) => o.id === a.operationId));

  // Top fatores agregando operações
  const tally: Record<string, number> = {};
  areaOps.forEach((o) => {
    const b = scoreOperation(o);
    b.parts.forEach((p) => { if (p.points > 0) tally[p.label] = (tally[p.label] ?? 0) + p.points; });
  });
  const topFactors = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label);

  const recs = recommendationsForArea(area.id, "gestor");
  const isPriority = s.score >= 80;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-info" />
                {area.name}
              </DialogTitle>
              <DialogDescription>
                {area.id} · {area.type} · {area.client}
              </DialogDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <RiskBadge score={s.score} />
              {isPriority && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-semibold text-danger-foreground">
                  <Flame className="h-3 w-3" /> Prioridade Alta
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-4">
          <Info label="Condição" value={area.condition} />
          <Info label="Proximidade de água" value={area.nearWater} />
          <Info label="Cultura" value={area.crop} />
          <Info label="Hectares" value={`${area.hectares} ha`} />
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Score médio</div>
              <div className="mt-0.5 text-3xl font-semibold tabular-nums text-foreground">
                {s.score}<span className="text-base text-muted-foreground"> / 100</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Principal fator</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">{s.topFactor}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Principais fatores de risco</h3>
          <div className="flex flex-wrap gap-2">
            {topFactors.length === 0 && <span className="text-xs text-muted-foreground">Sem fatores significativos.</span>}
            {topFactors.map((f) => (
              <span key={f} className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
                <AlertTriangle className="h-3 w-3" /> {f}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Tractor className="h-3.5 w-3.5 text-info" /> Máquinas presentes ({areaMachines.length})
            </h3>
            <ul className="space-y-2">
              {areaMachines.length === 0 && <li className="text-xs text-muted-foreground">Nenhuma máquina nesta área.</li>}
              {areaMachines.map((m) => {
                const mb = scoreMachine(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{m.name}</div>
                      <div className="text-muted-foreground">{m.id} · {m.status}</div>
                    </div>
                    <ScoreBar score={mb.total} />
                    <RiskBadge score={mb.total} />
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Activity className="h-3.5 w-3.5 text-success" /> Operações ativas ({activeOps.length})
            </h3>
            <ul className="space-y-2">
              {activeOps.length === 0 && <li className="text-xs text-muted-foreground">Sem operações em andamento.</li>}
              {activeOps.map((o) => {
                const b = scoreOperation(o);
                return (
                  <li key={o.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{o.type}</div>
                      <div className="text-muted-foreground">{o.machineId} · {o.start}</div>
                    </div>
                    <ScoreBar score={b.total} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Alertas da área ({areaAlerts.length})
            </h3>
            <ul className="space-y-2">
              {areaAlerts.length === 0 && <li className="text-xs text-muted-foreground">Sem alertas associados.</li>}
              {areaAlerts.slice(0, 4).map((a) => (
                <li key={a.id} className="rounded-lg border border-border p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{a.type}</span>
                    <RiskBadge level={a.level} />
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{a.message}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <History className="h-3.5 w-3.5 text-info" /> Histórico resumido
            </h3>
            <ul className="space-y-2">
              {concluded.length === 0 && <li className="text-xs text-muted-foreground">Sem registros recentes.</li>}
              {concluded.map((o) => {
                const b = scoreOperation(o);
                return (
                  <li key={o.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{o.type}</div>
                      <div className="text-muted-foreground">{o.machineId} · {o.status}</div>
                    </div>
                    <ScoreBar score={b.total} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        {recs.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Recomendações para a área</h3>
            <div className="space-y-2">
              {recs.map((r) => (
                <RecommendationCard key={r.id} rec={r} />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium capitalize text-foreground">{value}</div>
    </div>
  );
}
