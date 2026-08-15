import { cn } from "@/lib/utils";
import type { NextBestAction } from "@/lib/recommendations";
import { ArrowRight } from "lucide-react";

const toneByPriority: Record<NextBestAction["priority"], string> = {
  alta:  "border-danger/40 bg-gradient-to-br from-danger/10 to-danger/5",
  "média": "border-warning/40 bg-gradient-to-br from-warning/10 to-warning/5",
  baixa: "border-success/40 bg-gradient-to-br from-success/10 to-success/5",
};

const dotByPriority: Record<NextBestAction["priority"], string> = {
  alta: "bg-danger", "média": "bg-warning", baixa: "bg-success",
};

export function NextBestActionCard({
  action,
  className,
}: {
  action: NextBestAction;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border p-4", toneByPriority[action.priority], className)}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
        Próxima melhor ação
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium">
          <span className={cn("h-1.5 w-1.5 rounded-full", dotByPriority[action.priority])} />
          {action.priority}
        </span>
      </div>
      <div className="mt-2 flex items-start gap-2">
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
        <div>
          <div className="text-base font-semibold leading-tight text-foreground">{action.title}</div>
          <p className="mt-1 text-sm text-foreground/80">{action.description}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Fator decisivo: <span className="font-medium text-foreground">{action.factor}</span> · {action.category}
          </p>
        </div>
      </div>
    </div>
  );
}
