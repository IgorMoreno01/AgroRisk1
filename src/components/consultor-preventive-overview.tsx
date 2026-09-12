import { Card, SectionTitle } from "@/components/app-layout";
import { ActionableAlertRow } from "@/components/actionable-alerts";
import { useActionableAlerts } from "@/lib/actionable-alerts";
import type { ConsultorPreventiveOverview } from "@/lib/consultor-dashboard-types";

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value))
  : "—";

export function ConsultorPreventiveOverview({
  overview,
  clientId,
  clientName,
}: {
  overview: ConsultorPreventiveOverview;
  clientId: string;
  clientName: string;
}) {
  const { snapshot, acknowledge } = useActionableAlerts();
  const clientAlerts = snapshot.alerts.filter((alert) => alert.clientId === clientId);
  const topAlerts = clientAlerts.slice(0, 5);
  const maintenance = overview.maintenance.top.filter((item) => item.clientId === clientId);
  const attentionPoints = overview.attentionPoints.filter((item) => item.clientId === clientId);
  const overdueCount = maintenance.filter((item) => item.status === "overdue").length;
  const dueSoonCount = maintenance.filter((item) => item.status === "due_soon").length;
  const counts = {
    critical: clientAlerts.filter((alert) => alert.severity === "critical").length,
    high: clientAlerts.filter((alert) => alert.severity === "high").length,
    medium: clientAlerts.filter((alert) => alert.severity === "medium").length,
    new: clientAlerts.filter((alert) => alert.status === "new").length,
    acknowledged: clientAlerts.filter((alert) => alert.status === "acknowledged").length,
  };

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-3">
      <section id="alertas-cliente" className="scroll-mt-20">
        <Card className="h-full">
          <SectionTitle title={`Alertas de ${clientName}`} description="Prioridade e reconhecimento" />
          <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>Críticos <b className="text-foreground">{counts.critical}</b></span>
            <span>Altos <b className="text-foreground">{counts.high}</b></span>
            <span>Médios <b className="text-foreground">{counts.medium}</b></span>
            <span>Novos <b className="text-foreground">{counts.new}</b></span>
            <span>Reconhecidos <b className="text-foreground">{counts.acknowledged}</b></span>
          </div>
          <div className="space-y-2">
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
      </section>

      <Card>
        <SectionTitle
          title={`Manutenção preventiva de ${clientName}`}
          description="Itens atrasados e próximos"
        />
        <div className="mb-3 flex gap-4 text-sm">
          <span>Atrasadas <b className="text-danger">{overdueCount}</b></span>
          <span>Próximas <b className="text-warning-foreground">{dueSoonCount}</b></span>
        </div>
        <div className="space-y-2 text-xs">
          {maintenance.length === 0 && (
            <p className="text-muted-foreground">Nenhuma manutenção pendente.</p>
          )}
          {maintenance.map((item) => (
            <div key={item.id} className="rounded border px-2 py-1.5">
              <div className="flex justify-between gap-2 font-medium">
                <span>{item.machineType} · {item.machineId}</span>
                <span>{item.status === "overdue" ? "Atrasada" : "Próxima"}</span>
              </div>
              <div className="text-muted-foreground">{item.client}</div>
              <div className="text-muted-foreground">
                Próxima manutenção {date(item.nextDueAt)}
                {item.source === "synthetic" ? " · Dados sintéticos" : ""}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle
            title={`Pontos de atenção de ${clientName}`}
          description="Ocorrências úteis para orientação preventiva"
        />
        <div className="space-y-2 text-xs">
          {attentionPoints.length === 0 && (
            <p className="text-muted-foreground">Nenhuma ocorrência relevante recente.</p>
          )}
          {attentionPoints.map((item) => (
            <div key={item.id} className="rounded border px-2 py-1.5">
              <div className="flex justify-between gap-2 font-medium">
                <span>{item.machineType} · {item.machineId}</span>
                <span>{date(item.occurredAt)}</span>
              </div>
              <div className="text-muted-foreground">{item.client} · {item.operator}</div>
              <div className="text-muted-foreground">Status: {item.status}</div>
              {item.observation && <div className="mt-1 text-foreground">{item.observation}</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}