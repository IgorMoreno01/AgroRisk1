import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { RecommendationCard } from "@/components/recommendation-card";
import { RiskExplanation } from "@/components/risk-explanation";
import {
  type Area,
  alerts, operations, machines,
} from "@/lib/mock-data";
import { scoreAreaWithWeights, riskResultForArea, riskResultForMachine, riskResultForOperation } from "@/lib/risk-score";
import { recommendationsForArea } from "@/lib/recommendations";
import { AlertTriangle, MapPin, Tractor, Activity, History, Flame } from "lucide-react";
import { useRiskConfig } from "@/lib/risk-config";
import type { AdminMachineRow, AdminOperationRow } from "@/lib/admin-dashboard-types";
import type { Alert, RiskLevel } from "@/lib/mock-data";

export function AreaDetailDialog({
  area,
  open,
  onOpenChange,
  relationalDetail,
}: {
  area: Area | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  relationalDetail?: {
    score: number;
    level: RiskLevel;
    mainFactor: string;
    machines: AdminMachineRow[];
    operations: AdminOperationRow[];
    alerts: Alert[];
    alertsSource: "postgres" | "demo";
    weights: { ml: number; operationalRules: number };
  };
}) {
  const { weights } = useRiskConfig();
  if (!area) return null;
  const s = relationalDetail ? null : scoreAreaWithWeights(area.id, weights);
  const result = relationalDetail ? null : riskResultForArea(area.id, weights);
  const areaMachines = relationalDetail?.machines.map((row) => row.machine) ?? machines.filter((m) => m.areaId === area.id);
  const areaOps = relationalDetail?.operations.map((row) => row.operation) ?? operations.filter((o) => o.areaId === area.id);
  const activeOps = areaOps.filter((o) => o.status === "Em andamento");
  const concluded = areaOps.filter((o) => o.status === "Concluída" || o.status === "Interrompida").slice(0, 4);
  const areaAlerts = relationalDetail?.alerts ?? alerts.filter((a) => areaOps.some((o) => o.id === a.operationId));

  const recs = relationalDetail ? [] : recommendationsForArea(area.id, "gestor", { weights });
  const areaScore = relationalDetail?.score ?? s!.score;
  const isPriority = areaScore >= 80;

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
              <RiskBadge score={areaScore} />
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
          {relationalDetail ? (
            <div className="space-y-2 text-sm">
              <div className="font-semibold">Score {relationalDetail.score}/100 · risco {relationalDetail.level}</div>
              <p className="text-muted-foreground">Fator prioritário: <span className="font-medium text-foreground">{relationalDetail.mainFactor}</span>.</p>
                <p className="text-muted-foreground">Pesos Sompo: ML {relationalDetail.weights.ml}% · Operacional {relationalDetail.weights.operationalRules}%.</p>
            </div>
          ) : result ? (
            <RiskExplanation result={result} weights={weights} recommendation={recs[0]} audience="gestor" />
          ) : (
            <p className="text-sm text-muted-foreground">Sem operações suficientes para explicar o score desta área.</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Tractor className="h-3.5 w-3.5 text-info" /> Máquinas presentes ({areaMachines.length})
            </h3>
            <ul className="space-y-2">
              {areaMachines.length === 0 && <li className="text-xs text-muted-foreground">Nenhuma máquina nesta área.</li>}
              {areaMachines.map((m) => {
                 const relationalMachine = relationalDetail?.machines.find((row) => row.machine.id === m.id);
                 const mb = relationalMachine ? null : riskResultForMachine(m.id, weights);
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{m.name}</div>
                      <div className="text-muted-foreground">{m.id} · {m.status}</div>
                    </div>
                      <ScoreBar score={relationalMachine?.score ?? mb!.finalScore} />
                      <RiskBadge score={relationalMachine?.score ?? mb!.finalScore} />
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
                 const relationalOperation = relationalDetail?.operations.find((row) => row.operation.id === o.id);
                 const b = relationalOperation ? null : riskResultForOperation(o, weights);
                return (
                  <li key={o.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{o.type}</div>
                      <div className="text-muted-foreground">{o.machineId} · {o.start}</div>
                    </div>
                      <ScoreBar score={relationalOperation?.score ?? b!.finalScore} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
               <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Alertas da área ({areaAlerts.length}){relationalDetail?.alertsSource === "demo" ? " · demonstração" : ""}
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
                 const relationalOperation = relationalDetail?.operations.find((row) => row.operation.id === o.id);
                 const b = relationalOperation ? null : riskResultForOperation(o, weights);
                return (
                  <li key={o.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{o.type}</div>
                      <div className="text-muted-foreground">{o.machineId} · {o.status}</div>
                    </div>
                      <ScoreBar score={relationalOperation?.score ?? b!.finalScore} />
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
