import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/mock-data";
import { riskFromScore } from "@/lib/mock-data";

const styles: Record<RiskLevel, string> = {
  baixo: "bg-success/15 text-success border-success/30",
  medio: "bg-warning/20 text-warning-foreground border-warning/40",
  alto:  "bg-danger/15 text-danger border-danger/30",
};

const labels: Record<RiskLevel, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto:  "Alto",
};

export function RiskBadge({ level, score, className }: { level?: RiskLevel; score?: number; className?: string }) {
  const lvl = level ?? riskFromScore(score ?? 0);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[lvl],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          lvl === "baixo" && "bg-success",
          lvl === "medio" && "bg-warning",
          lvl === "alto" && "bg-danger",
        )}
      />
      Risco {labels[lvl]}
      {typeof score === "number" && <span className="opacity-70">· {score}</span>}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const lvl = riskFromScore(score);
  const color =
    lvl === "alto" ? "bg-danger" : lvl === "medio" ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">{score}</span>
    </div>
  );
}
