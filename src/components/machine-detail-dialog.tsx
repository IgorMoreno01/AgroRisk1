import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RiskBadge, ScoreBar } from "@/components/risk-badge";
import { RiskComposition } from "@/components/risk-composition";
import { RecommendationCard } from "@/components/recommendation-card";
import { NextBestActionCard } from "@/components/next-best-action";
import {
  type Machine,
  alerts, operationHistory, getOperator, getArea,
} from "@/lib/mock-data";
import { scoreMachine, currentOperationFor } from "@/lib/risk-score";
import { recommendationsForMachine, nextBestActionForMachine } from "@/lib/recommendations";
import { AlertTriangle, MapPin, Tractor, User, Activity, History, Flame } from "lucide-react";

export function MachineDetailDialog({
  machine,
  open,
  onOpenChange,
}: {
  machine: Machine | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!machine) return null;
  const op = currentOperationFor(machine.id);
  const b = scoreMachine(machine.id);
  const area = getArea(machine.areaId);
  const operator = getOperator(machine.operatorId);
  const machineAlerts = alerts.filter((a) => a.machineId === machine.id);
  const history = operationHistory.filter((h) => h.machineId === machine.id).slice(0, 5);
  const recs = recommendationsForMachine(machine.id, "gestor");
  const nextAction = nextBestActionForMachine(machine.id);
  const isHigh = b.level === "alto";
  const isPriority = b.total >= 80;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <Tractor className="h-4 w-4 text-info" />
                {machine.name}
              </DialogTitle>
              <DialogDescription>
                {machine.id} · {machine.type} · {machine.model}
              </DialogDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <RiskBadge score={b.total} />
              {isPriority && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-semibold text-danger-foreground">
                  <Flame className="h-3 w-3" /> Prioridade Alta
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <Info label="Cliente / Fazenda" value={machine.client} />
          <Info label="Área atual" value={area?.name ?? "—"} icon={MapPin} />
          <Info label="Operador responsável" value={operator?.name ?? machine.operator} icon={User} />
          <Info label="Operação atual" value={op?.type ?? "—"} icon={Activity} />
          <Info label="Status" value={machine.status} />
          <Info label="Última atualização" value={machine.lastUpdate} />
        </div>

        <div className="mt-2 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Score de risco</div>
              <div className="mt-0.5 text-3xl font-semibold tabular-nums text-foreground">
                {b.total}<span className="text-base text-muted-foreground"> / 100</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Principal fator</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">{b.mainFactor}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Composição do score</h3>
          <RiskComposition breakdown={b} compact />
        </div>

        <NextBestActionCard action={nextAction} />


        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Alertas associados ({machineAlerts.length})
            </h3>
            <ul className="space-y-2">
              {machineAlerts.length === 0 && (
                <li className="text-xs text-muted-foreground">Sem alertas registrados.</li>
              )}
              {machineAlerts.map((a) => (
                <li key={a.id} className="rounded-lg border border-border p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{a.type}</span>
                    <RiskBadge level={a.level} />
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{a.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{a.time} · {a.status}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <History className="h-3.5 w-3.5 text-info" /> Histórico recente
            </h3>
            <ul className="space-y-2">
              {history.length === 0 && (
                <li className="text-xs text-muted-foreground">Sem histórico registrado.</li>
              )}
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs">
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{h.summary}</div>
                    <div className="text-muted-foreground">{h.date}</div>
                  </div>
                  <ScoreBar score={h.score} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Recomendações geradas</h3>
          <div className="space-y-2">
            {recs.map((r) => (
              <RecommendationCard key={r.id} rec={r} />
            ))}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

function Info({
  label, value, icon: Icon,
}: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
