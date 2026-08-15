import { Card, SectionTitle } from "@/components/app-layout";
import { cn } from "@/lib/utils";
import { Bell, AlertTriangle } from "lucide-react";
import type { ProfileAlert, ProfileAlertsBundle } from "@/lib/profile-alerts";
import type { AlertCriticality, AlertStatus } from "@/lib/mock-data";

const critColor: Record<AlertCriticality, string> = {
  alta: "bg-danger/15 text-danger border-danger/30",
  média: "bg-warning/15 text-warning border-warning/30",
  baixa: "bg-success/15 text-success border-success/30",
};

const statusColor: Record<AlertStatus, string> = {
  aberto: "bg-danger/10 text-danger",
  "em análise": "bg-warning/10 text-warning",
  resolvido: "bg-success/10 text-success",
};

export function ProfileAlertsSection({ bundle }: { bundle: ProfileAlertsBundle }) {
  const open = bundle.alerts.filter((a) => a.status !== "resolvido").length;
  return (
    <section id={bundle.sectionId} className="scroll-mt-20">
      <Card>
        <SectionTitle
          title={bundle.sectionTitle}
          description={bundle.sectionDescription}
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">
              <Bell className="h-3 w-3" /> {open} pendentes
            </span>
          }
        />
        <ul className="divide-y divide-border">
          {bundle.alerts.map((a) => (
            <Row key={a.id} a={a} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function Row({ a }: { a: ProfileAlert }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="truncate text-sm font-medium text-foreground">{a.title}</div>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {a.context} · {a.detail}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
            critColor[a.criticality],
          )}
        >
          {a.criticality}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{a.time}</span>
        <span className={cn("rounded px-1.5 py-0.5 font-medium", statusColor[a.status])}>
          {a.status}
        </span>
      </div>
    </li>
  );
}
