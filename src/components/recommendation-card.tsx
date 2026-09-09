import { cn } from "@/lib/utils";
import type { GeneratedRecommendation, RecCategory, RecPriority } from "@/lib/recommendations";
import {
  Route, Clock, Mountain, Settings, Wrench, GraduationCap,
  Leaf, ShieldAlert, Lightbulb, CheckCircle2,
} from "lucide-react";

const categoryIcon: Record<RecCategory, React.ComponentType<{ className?: string }>> = {
  "Rota": Route,
  "Horário": Clock,
  "Inclinação": Mountain,
  "Operação": Settings,
  "Manutenção": Wrench,
  "Treinamento": GraduationCap,
  "Atenção ambiental": Leaf,
  "Prevenção de sinistro": ShieldAlert,
};

const priorityStyles: Record<RecPriority, { ring: string; chip: string; dot: string; bar: string }> = {
  alta:  { ring: "border-danger/40 bg-danger/5",   chip: "bg-danger/15 text-danger",                       dot: "bg-danger",  bar: "bg-danger" },
  "média": { ring: "border-warning/40 bg-warning/5", chip: "bg-warning/20 text-warning-foreground",        dot: "bg-warning", bar: "bg-warning" },
  baixa: { ring: "border-success/40 bg-success/5", chip: "bg-success/15 text-success",                     dot: "bg-success", bar: "bg-success" },
};

const priorityLabel: Record<RecPriority, string> = {
  alta: "Prioridade alta",
  "média": "Prioridade média",
  baixa: "Prioridade baixa",
};

export function RecommendationCard({
  rec,
  showAction = false,
  className,
}: {
  rec: GeneratedRecommendation;
  showAction?: boolean;
  className?: string;
}) {
  const Icon = categoryIcon[rec.category] ?? Lightbulb;
  const styles = priorityStyles[rec.priority];

  return (
    <div className={cn("relative overflow-hidden rounded-xl border p-4", styles.ring, className)}>
      <span className={cn("absolute left-0 top-0 h-full w-1", styles.bar)} aria-hidden="true" />
      <div className="flex items-start gap-3 pl-2">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", styles.chip)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{rec.title}</h4>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", styles.chip)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
              {priorityLabel[rec.priority]}
            </span>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {rec.category}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-foreground/90">{rec.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Por quê:</span> {rec.rationale}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              Fator: <span className="font-medium text-foreground">{rec.factor}</span>
            </span>
            {showAction && (
              <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-success hover:bg-success/10">
                <CheckCircle2 className="h-3.5 w-3.5" /> Entendido
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecommendationCompact({ rec }: { rec: GeneratedRecommendation }) {
  const Icon = categoryIcon[rec.category] ?? Lightbulb;
  const styles = priorityStyles[rec.priority];
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", styles.chip)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{rec.title}</span>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase", styles.chip)}>
            {rec.priority}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{rec.rationale}</p>
      </div>
    </div>
  );
}
