import { cn } from "@/lib/utils";
import type { ScoreBreakdown } from "@/lib/risk-score";

function barTone(ratio: number) {
  if (ratio >= 0.7) return "bg-danger";
  if (ratio >= 0.4) return "bg-warning";
  return "bg-success";
}

export function RiskComposition({
  breakdown,
  compact = false,
}: {
  breakdown: ScoreBreakdown;
  compact?: boolean;
}) {
  return (
    <ul className={cn("space-y-3", compact && "space-y-2")}>
      {breakdown.parts.map((p) => {
        const ratio = p.max === 0 ? 0 : p.points / p.max;
        return (
          <li key={p.category}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{p.label}</span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{p.points}</span>
                <span className="opacity-60"> / {p.max}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", barTone(ratio))}
                style={{ width: `${Math.max(4, ratio * 100)}%` }}
              />
            </div>
            {!compact && (
              <div className="mt-1 text-xs text-muted-foreground">{p.detail}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
