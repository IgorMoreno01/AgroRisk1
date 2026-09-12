import { RiskBadge } from "@/components/risk-badge";
import { dominantFactorLabel, type RiskResult, type RiskWeights } from "@/lib/risk-score";
import type { GeneratedRecommendation, RecAudience } from "@/lib/recommendations";

export function RiskExplanation({
  result,
  weights,
  recommendation,
  audience,
}: {
  result: RiskResult;
  weights: RiskWeights;
  recommendation?: GeneratedRecommendation;
  audience: RecAudience;
}) {
  const componentLabel = dominantFactorLabel(result.dominantFactor);
  const mainFactor = recommendation?.factor ?? result.breakdown.mainFactor;
  const balanced = result.dominantFactor === "balanced";

  if (audience === "admin") {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Score ML" value={`${result.climateScore} / 100`} detail={`Peso Sompo: ML ${weights.climate}%`} />
          <Metric label="Score operacional" value={`${result.operationalScore} / 100`} detail={`Peso Sompo: ${weights.operational}%`} />
          <Metric label="Contribuição ML" value={result.climateContribution.toFixed(1)} detail={`${result.climateScore} × ${weights.climate}%`} />
          <Metric label="Contribuição operacional" value={result.operationalContribution.toFixed(1)} detail={`${result.operationalScore} × ${weights.operational}%`} />
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Score final ponderado</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                {result.finalScore}<span className="text-base text-muted-foreground"> / 100</span>
              </div>
              <RiskBadge level={result.level} className="mt-2" />
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold text-foreground">{componentLabel}</div>
              <div className="mt-1 text-muted-foreground">
                {balanced ? "Macrocomponentes sem predominância" : "Componente com maior contribuição"}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Fator interno mais relevante</div>
              <div className="font-medium text-foreground">{mainFactor}</div>
            </div>
          </div>
          {recommendation && (
            <div className="mt-3 border-t border-primary/20 pt-3 text-xs">
              <div className="font-medium text-foreground">Recomendação principal: {recommendation.title}</div>
              <p className="mt-1 text-muted-foreground">{recommendation.rationale}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (audience === "operador") {
    return (
      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-foreground">Risco atual: {result.level}</span>
          <span className="font-semibold tabular-nums text-foreground">{result.finalScore}/100</span>
        </div>
        <p className="mt-2 text-muted-foreground">
          {balanced
            ? `Clima e operação contribuíram de forma balanceada. Principal ponto de atenção: ${mainFactor.toLowerCase()}.`
            : `Principal origem: ${componentLabel.toLowerCase()}. Motivo: ${mainFactor.toLowerCase()}.`}
        </p>
        {recommendation && (
          <p className="mt-2 font-medium text-foreground">Ação prática: {recommendation.title}.</p>
        )}
      </div>
    );
  }

  if (audience === "consultor") {
    return (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          O score consolidado é <strong>{result.finalScore}/100</strong>, classificado como{" "}
          <strong>risco {result.level}</strong>.
        </p>
        <p className="text-muted-foreground">
          {balanced
            ? `A origem está balanceada entre clima e operação; o fator interno mais relevante é ${mainFactor.toLowerCase()}.`
            : `A principal origem é ${componentLabel.toLowerCase()}, com maior relevância interna de ${mainFactor.toLowerCase()}.`}
        </p>
        {recommendation && (
          <p>
            Orientação preventiva ao cliente: <strong>{recommendation.title.toLowerCase()}</strong>.{" "}
            {recommendation.rationale}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Resumo do risco</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">{result.finalScore}/100</span>
            <RiskBadge level={result.level} />
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium text-foreground">{componentLabel}</div>
          <div className="text-muted-foreground">
            {balanced ? "Sem macrocomponente dominante" : "Principal origem do risco"}
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Metric label="Contribuição ML" value={result.climateContribution.toFixed(1)} />
        <Metric label="Contribuição operacional" value={result.operationalContribution.toFixed(1)} />
      </div>
      <p className="text-sm text-muted-foreground">
        Fator prioritário: <span className="font-medium text-foreground">{mainFactor}</span>.
      </p>
      {recommendation && (
        <p className="text-sm text-foreground">
          Ação recomendada: <span className="font-medium">{recommendation.title}</span>. {recommendation.rationale}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}