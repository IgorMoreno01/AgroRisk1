import { Card, SectionTitle } from "@/components/app-layout";
import { ActionableAlertRow } from "@/components/actionable-alerts";
import { useActionableAlerts } from "@/lib/actionable-alerts";
import type { GestorOperationalOverview } from "@/lib/gestor-dashboard-types";

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
  : "—";
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value))
  : "—";

export function GestorOperationalOverview({ overview }: { overview: GestorOperationalOverview }) {
  const { snapshot, acknowledge } = useActionableAlerts();
  const alerts = snapshot.alerts.slice(0, 5);
  const counts = {
    critical: snapshot.alerts.filter((a) => a.severity === "critical").length,
    high: snapshot.alerts.filter((a) => a.severity === "high").length,
    medium: snapshot.alerts.filter((a) => a.severity === "medium").length,
    new: snapshot.alerts.filter((a) => a.status === "new").length,
    acknowledged: snapshot.alerts.filter((a) => a.status === "acknowledged").length,
  };
  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-3">
      <div id="alertas-gerenciais" className="scroll-mt-20">
      <Card className="h-full">
        <SectionTitle title="Alertas acionáveis" description="Prioridade e reconhecimento" />
        <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>Críticos <b className="text-foreground">{counts.critical}</b></span>
          <span>Altos <b className="text-foreground">{counts.high}</b></span>
          <span>Médios <b className="text-foreground">{counts.medium}</b></span>
          <span>Novos <b className="text-foreground">{counts.new}</b></span>
          <span>Reconhecidos <b className="text-foreground">{counts.acknowledged}</b></span>
        </div>
        <div className="space-y-2">{alerts.length === 0
          ? <p className="text-sm text-muted-foreground">Nenhum alerta acionável.</p>
          : alerts.map((alert) => <ActionableAlertRow key={alert.id} alert={alert} onAcknowledge={() => void acknowledge(alert.id)} />)}
        </div>
      </Card>
      </div>
      <Card>
        <SectionTitle title="Manutenção da frota" description="Itens vencidos e próximos do vencimento" />
        <div className="mb-3 flex gap-4 text-sm">
          <span>Vencidas <b className="text-danger">{overview.maintenance.overdueCount}</b></span>
          <span>Próximas <b className="text-warning-foreground">{overview.maintenance.dueSoonCount}</b></span>
        </div>
        <div className="space-y-2 text-xs">
          {overview.maintenance.top.length === 0 && <p className="text-muted-foreground">Nenhuma manutenção pendente.</p>}
          {overview.maintenance.top.map((item) => (
            <div key={item.id} className="flex justify-between gap-2 rounded border px-2 py-1.5">
              <span className="truncate">{item.machineType} · {item.machineId}<small className="block text-muted-foreground">{item.client}{item.source === "synthetic" ? " · Dados sintéticos" : ""}</small></span>
              <span className="shrink-0 text-right">{item.status === "overdue" ? "Vencida" : "Próxima"}<small className="block text-muted-foreground">{date(item.nextDueAt)}</small></span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle title="Atividade operacional recente" description="Últimos registros da operação" />
        <div className="space-y-2 text-xs">
          {overview.activity.length === 0 && <p className="text-muted-foreground">Nenhuma atividade registrada.</p>}
          {overview.activity.map((item) => (
            <div key={item.id} className="rounded border px-2 py-1.5">
              <div className="flex justify-between gap-2 font-medium"><span>{item.machineType} · {item.machineId}</span><span>{item.status === "completed" ? "Concluída" : item.status === "in_progress" ? "Em andamento" : "Não iniciada"}</span></div>
               <div className="text-muted-foreground">{item.operator} · Operação {item.operationId}</div>
               <div className="text-muted-foreground">Início {dateTime(item.startedAt)} · Fim {dateTime(item.finishedAt)}</div>
              {item.observation && <div className="truncate text-muted-foreground">{item.observation}</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}