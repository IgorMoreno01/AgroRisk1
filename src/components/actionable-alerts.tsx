import { AlertTriangle, Check, Eye } from "lucide-react";
import { Card, SectionTitle } from "@/components/app-layout";
import { useActionableAlerts } from "@/lib/actionable-alerts";
import type {
  ActionableAlert,
  ActionableAlertSeverity,
  ActionableAlertStatus,
} from "@/lib/actionable-alerts-types";
import { cn } from "@/lib/utils";

export const severityLabel: Record<ActionableAlertSeverity, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export const statusLabel: Record<ActionableAlertStatus, string> = {
  new: "Novo",
  viewed: "Visualizado",
  acknowledged: "Reconhecido",
  resolved: "Resolvido",
};

const severityClass: Record<ActionableAlertSeverity, string> = {
  low: "border-success/30 bg-success/5",
  medium: "border-warning/40 bg-warning/5",
  high: "border-danger/40 bg-danger/5",
  critical: "border-danger bg-danger/10",
};

export function ActionableAlertsList({
  sectionId,
  title = "Alertas acionáveis",
}: {
  sectionId: string;
  title?: string;
}) {
  const { snapshot, acknowledge } = useActionableAlerts();
  return (
    <section id={sectionId} className="scroll-mt-20">
      <Card>
        <SectionTitle
          title={title}
          description="Alertas persistidos e ações pendentes"
          action={<span className="text-xs text-muted-foreground">{snapshot.unreadCount} novos</span>}
        />
        <div className="space-y-2">
          {snapshot.alerts.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum alerta acionável no momento.</p>
          )}
          {snapshot.alerts.map((alert) => (
            <ActionableAlertRow
              key={alert.id}
              alert={alert}
              onAcknowledge={() => acknowledge(alert.id)}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}

export function ActionableAlertRow({
  alert,
  onAcknowledge,
}: {
  alert: ActionableAlert;
  onAcknowledge: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        severityClass[alert.severity],
        alert.status === "new" && "ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">{alert.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-semibold">
          {severityLabel[alert.severity]}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {alert.status === "new" ? <Eye className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {statusLabel[alert.status]}
        </span>
        {alert.status === "new" || alert.status === "viewed" ? (
          <button
            onClick={onAcknowledge}
            className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground"
          >
            Reconhecer alerta
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CriticalAlertBanner() {
  const { snapshot, acknowledge } = useActionableAlerts();
  const alert = snapshot.alerts.find(
    (item) =>
      item.severity === "critical"
      && item.status !== "acknowledged"
      && item.status !== "resolved",
  );
  if (!alert) return null;
  return (
    <div className="border-b-2 border-danger bg-danger/15 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-screen-2xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="font-semibold text-danger">Crítico: {alert.title}</div>
          <div className="text-sm text-foreground">{alert.message}</div>
          <div className="text-xs font-medium text-danger">Ação necessária: reconhecer este alerta.</div>
        </div>
        <button
          onClick={() => acknowledge(alert.id)}
          className="shrink-0 rounded-md bg-danger px-3 py-2 text-sm font-semibold text-danger-foreground"
        >
          Reconhecer
        </button>
      </div>
    </div>
  );
}