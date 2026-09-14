import { Card, SectionTitle } from "@/components/app-layout";
import { ActionableAlertRow } from "@/components/actionable-alerts";
import { useActionableAlerts } from "@/lib/actionable-alerts";
import type { AdminOperationalOverview } from "@/lib/admin-dashboard-types";

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value))
  : "—";

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value))
  : "—";

export function AdminOperationalOverview({ overview }: { overview: AdminOperationalOverview }) {
  const { snapshot, acknowledge } = useActionableAlerts();
  const topAlerts = snapshot.alerts.slice(0, 5);
  const counts = {
    critical: snapshot.alerts.filter((alert) => alert.severity === "critical").length,
    high: snapshot.alerts.filter((alert) => alert.severity === "high").length,
    medium: snapshot.alerts.filter((alert) => alert.severity === "medium").length,
    new: snapshot.alerts.filter((alert) => alert.status === "new").length,
    acknowledged: snapshot.alerts.filter((alert) => alert.status === "acknowledged").length,
  };

  return (
    <div id="admin-operational-overview" className="grid scroll-mt-20 items-start gap-4 xl:grid-cols-3">
      <Card>
        <SectionTitle title="Alertas acionáveis" description="Visão global por prioridade e recência" />
        <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>Críticos <b className="text-foreground">{counts.critical}</b></span>
          <span>Altos <b className="text-foreground">{counts.high}</b></span>
          <span>Médios <b className="text-foreground">{counts.medium}</b></span>
          <span>Novos <b className="text-foreground">{counts.new}</b></span>
          <span>Reconhecidos <b className="text-foreground">{counts.acknowledged}</b></span>
        </div>
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {topAlerts.length === 0
            ? <p className="text-sm text-muted-foreground">Nenhum alerta acionável.</p>
            : topAlerts.map((alert) => (
              <ActionableAlertRow
                key={alert.id}
                alert={alert}
                onAcknowledge={() => void acknowledge(alert.id)}
              />
            ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Manutenção da carteira" description="Máquinas vencidas e próximas" />
        <div className="mb-3 flex gap-4 text-sm">
          <span>Atrasadas <b className="text-danger">{overview.maintenance.overdueCount}</b></span>
          <span>Próximas <b className="text-warning-foreground">{overview.maintenance.dueSoonCount}</b></span>
        </div>
        <div className="max-h-60 space-y-2 overflow-y-auto text-xs">
          {overview.maintenance.top.length === 0 && (
            <p className="text-muted-foreground">Nenhuma manutenção pendente.</p>
          )}
          {overview.maintenance.top.map((item) => (
            <div key={item.id} className="rounded border px-2 py-1.5">
              <div className="flex justify-between gap-2 font-medium">
                <span>{item.machineType} · {item.machineId}</span>
                <span>{item.status === "overdue" ? "Atrasada" : "Próxima"}</span>
              </div>
              <div className="text-muted-foreground">{item.client}</div>
              <div className="text-muted-foreground">
                Última {date(item.lastPerformedAt)} · Próxima {date(item.nextDueAt)}
                {item.source === "synthetic" ? " · Dados sintéticos" : ""}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Atividade operacional recente" description="Últimos registros globais" />
        <div className="max-h-60 space-y-2 overflow-y-auto text-xs">
          {overview.activity.length === 0 && (
            <p className="text-muted-foreground">Nenhuma atividade registrada.</p>
          )}
          {overview.activity.map((item) => (
            <div key={item.id} className="rounded border px-2 py-1.5">
              <div className="flex justify-between gap-2 font-medium">
                <span>{item.machineType} · {item.machineId}</span>
                <span>{item.status === "completed" ? "Concluída" : item.status === "in_progress" ? "Em andamento" : "Não iniciada"}</span>
              </div>
              <div className="text-muted-foreground">{item.operator} · {item.client}</div>
              <div className="text-muted-foreground">Operação {item.operationId}</div>
              <div className="text-muted-foreground">
                Início {dateTime(item.startedAt)} · Fim {dateTime(item.finishedAt)}
              </div>
              {item.observation && <div className="truncate text-muted-foreground">{item.observation}</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}