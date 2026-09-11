import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Wrench } from "lucide-react";
import { Card, SectionTitle } from "@/components/app-layout";
import { getStoredSessionToken } from "@/lib/auth";
import { getPreventiveMaintenance } from "@/lib/api/preventive-maintenance.functions";
import type {
  MaintenanceStatus,
  PreventiveMaintenanceSnapshot,
} from "@/lib/preventive-maintenance-types";

const statusCopy: Record<
  MaintenanceStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  ok: {
    label: "Em dia",
    className: "bg-success/15 text-success",
    icon: CheckCircle2,
  },
  due_soon: {
    label: "Manutenção próxima",
    className: "bg-warning/15 text-warning",
    icon: CalendarClock,
  },
  overdue: {
    label: "Manutenção atrasada",
    className: "bg-danger/15 text-danger",
    icon: AlertTriangle,
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function PreventiveMaintenanceCard() {
  const [snapshot, setSnapshot] = useState<PreventiveMaintenanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredSessionToken();
    if (!token) {
      setError("Sessão do Operador não encontrada.");
      return;
    }
    void getPreventiveMaintenance({ data: { token } })
      .then((response) => {
        if (!response.ok) throw new Error(response.error);
        setSnapshot(response.snapshot);
      })
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar a manutenção preventiva.",
        );
      });
  }, []);

  if (error) {
    return (
      <Card>
        <SectionTitle title="Manutenção do equipamento" description={error} />
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card>
        <SectionTitle title="Manutenção do equipamento" description="Carregando manutenção preventiva…" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando o registro
        </div>
      </Card>
    );
  }

  const record = snapshot.record;
  if (!record) {
    return (
      <Card>
        <SectionTitle
          title="Manutenção do equipamento"
          description={`${snapshot.machineId} · nenhum registro disponível`}
        />
      </Card>
    );
  }

  const status = statusCopy[record.status];
  const StatusIcon = status.icon;

  return (
    <Card>
      <SectionTitle
        title="Manutenção do equipamento"
        description={`Manutenção preventiva · ${snapshot.machineId}`}
        action={
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
            <StatusIcon className="h-3.5 w-3.5" /> {status.label}
          </span>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Última manutenção
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">{formatDate(record.performedAt)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{record.maintenanceType}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Próxima manutenção
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">{formatDate(record.nextDueAt)}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" /> Observação
          </div>
          <div className="mt-1 line-clamp-2 text-sm text-foreground">{record.observation || "Sem observação."}</div>
        </div>
      </div>
      {record.source !== "real" && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Registro sintético determinístico para demonstração.
        </p>
      )}
    </Card>
  );
}