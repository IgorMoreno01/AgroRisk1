import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/app-layout";
import { RecommendationCard } from "@/components/recommendation-card";
import { Slider } from "@/components/ui/slider";
import type { GeneratedRecommendation } from "@/lib/recommendations";
import { evaluateRiskEngineV2 } from "@/lib/risk-engine-v2/evaluate";
import type { OperationRiskEvaluation } from "@/lib/risk-engine-v2/operation-input.server";
import type { RiskEngineV2Result } from "@/lib/risk-engine-v2/types";
import { cn } from "@/lib/utils";
import { getStoredSessionToken } from "@/lib/auth";
import {
  getRiskEngineV2Configuration,
  saveRiskEngineV2Configuration,
} from "@/lib/api/risk-config.functions";

const componentLabels: Record<string, string> = {
  climate: "Clima",
  structure: "Estrutura do risco",
  history: "Histórico",
};
const directionLabels = {
  increase: "aumenta risco relativo",
  decrease: "reduz risco relativo",
  neutral: "efeito neutro",
} as const;
const dominantLabels = {
  ml: "Climático",
  operational_rules: "Operacional",
  balanced: "Equilibrado",
} as const;

const fmt = (value: number) => value.toFixed(2);

export const recommendationForV2Result = (
  result: RiskEngineV2Result,
): GeneratedRecommendation => {
  const mlDriver = result.drivers.find((driver) => driver.source === "ml");
  const operationalDriver = result.drivers.find(
    (driver) => driver.source === "operational_rules",
  );
  const operationalContext: Record<string, string> = {
    water_proximity: "a proximidade de água",
    operation_type: "o tipo da operação",
    terrain: "a condição do terreno",
  };
  const factor = operationalDriver
    ? operationalContext[operationalDriver.code] ?? operationalDriver.label.toLowerCase()
    : "as condições operacionais";
  const dominant =
    result.dominantComponent === "ml"
      ? "o score climático tem a maior contribuição ponderada"
      : result.dominantComponent === "operational_rules"
        ? "o score operacional tem a maior contribuição ponderada"
        : "os componentes climático e operacional têm contribuições ponderadas equivalentes";
  const mlContext = mlDriver
    ? ` O principal sinal explicativo climático é ${mlDriver.label.toLowerCase()}, sem indicar causalidade.`
    : "";

  if (result.level === "alto") {
    return {
      id: "v2-admin-high",
      title: "Revisar a operação antes de prosseguir",
      description: `Aplicar ação preventiva prioritária e revisar ${factor} antes de manter ou liberar a operação.`,
      rationale: `Risco alto: ${dominant}.${mlContext}`,
      category: operationalDriver?.code === "water_proximity" ? "Rota" : "Prevenção de sinistro",
      priority: "alta",
      audience: "admin",
      factor: operationalDriver?.label ?? "Risk Engine V2",
    };
  }

  if (result.level === "medio") {
    return {
      id: "v2-admin-medium",
      title: "Reforçar o acompanhamento da operação",
      description: `Revisar ${factor} e acompanhar a evolução do risco antes da próxima etapa.`,
      rationale: `Risco médio: ${dominant}.${mlContext}`,
      category: operationalDriver?.code === "water_proximity" ? "Rota" : "Prevenção de sinistro",
      priority: "média",
      audience: "admin",
      factor: operationalDriver?.label ?? "Risk Engine V2",
    };
  }

  return {
    id: "v2-admin-low",
    title: "Manter monitoramento preventivo",
    description: `Manter os controles atuais e observar ${factor} durante a operação.`,
    rationale: `Risco baixo: ${dominant}.${mlContext}`,
    category: operationalDriver?.code === "water_proximity" ? "Rota" : "Prevenção de sinistro",
    priority: "baixa",
    audience: "admin",
    factor: operationalDriver?.label ?? "Risk Engine V2",
  };
};

function LevelBadge({ level }: { level: RiskEngineV2Result["level"] }) {
  const labels = {
    baixo: "Risco baixo",
    medio: "Risco médio",
    alto: "Risco alto",
  } as const;
  const tones = {
    baixo: "border-success/30 bg-success/10 text-success",
    medio: "border-warning/30 bg-warning/10 text-warning-foreground",
    alto: "border-danger/30 bg-danger/10 text-danger",
  } as const;

  return (
    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", tones[level])}>
      {labels[level]}
    </span>
  );
}

function MlComponents({ result }: { result: RiskEngineV2Result }) {
  const maxAbs = Math.max(
    ...result.ml.components.map((item) => Math.abs(item.contribution)),
    Number.EPSILON,
  );
  return (
    <div className="space-y-3">
      {result.ml.components.map((item) => {
        const width = (Math.abs(item.contribution) / maxAbs) * 100;
        const Icon = item.direction === "decrease" ? ArrowDownRight : ArrowUpRight;
        return (
          <div key={item.component}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">
                {componentLabels[item.component] ?? item.label}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {item.contribution >= 0 ? "+" : ""}
                {fmt(item.contribution)}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
              aria-label={`Contribuição relativa de ${item.label}`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200",
                  item.contribution < 0 ? "bg-info" : "bg-primary",
                )}
                style={{ width: `${width}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {directionLabels[item.direction]}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Barras mostram apenas magnitude relativa entre componentes; não são percentuais e não
        precisam somar 100.
      </p>
    </div>
  );
}

function OperationalFactors({ result }: { result: RiskEngineV2Result }) {
  const rawTotal = result.operationalRules.factors.reduce(
    (total, factor) => total + factor.points,
    0,
  );
  const maxTotal = result.operationalRules.factors.reduce(
    (total, factor) => total + factor.maxPoints,
    0,
  );

  return (
    <div className="space-y-3">
      {result.operationalRules.factors.map((factor) => (
        <div key={factor.id}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">{factor.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
              {factor.points} / {factor.maxPoints}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-warning transition-[width] duration-200"
              style={{ width: `${(factor.points / factor.maxPoints) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="font-medium text-muted-foreground">Total bruto</span>
        <strong className="tabular-nums text-foreground">
          {rawTotal} / {maxTotal}
        </strong>
      </div>
    </div>
  );
}

function ContributionTable({ result }: { result: RiskEngineV2Result }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">Fonte</th>
            <th className="py-2 pr-3">Score × peso</th>
            <th className="py-2 text-right">Contribuição</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {result.contributions.map((item) => (
            <tr key={item.component}>
              <td className="py-2 pr-3 font-medium">
                 {item.component === "ml" ? "Climático" : "Operacional"}
              </td>
              <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                {fmt(item.sourceScore)} × {item.weight}%
              </td>
              <td className="py-2 text-right font-medium tabular-nums">
                {fmt(item.weightedContribution)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminV2RiskPanel({ evaluation }: { evaluation: OperationRiskEvaluation }) {
  const [mlWeight, setMlWeight] = useState(evaluation.input.weights.ml);
  const [savedMlWeight, setSavedMlWeight] = useState(evaluation.input.weights.ml);
  const quality = evaluation.provenance.external;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const result = useMemo(
    () => evaluateRiskEngineV2({
      ...evaluation.input,
      weights: { ml: mlWeight, operationalRules: 100 - mlWeight },
    }),
    [evaluation.input, mlWeight],
  );
  const operationalRulesWeight = 100 - mlWeight;
  const savedOperationalRulesWeight = 100 - savedMlWeight;
  const hasUnsavedChanges = mlWeight !== savedMlWeight;
  const isValidDraft =
    Number.isInteger(mlWeight) &&
    mlWeight >= 0 &&
    mlWeight <= 100 &&
    operationalRulesWeight >= 0 &&
    operationalRulesWeight <= 100 &&
    mlWeight + operationalRulesWeight === 100;
  const mlDriver = result.drivers.find((driver) => driver.source === "ml");
  const operationalDriver = result.drivers.find((driver) => driver.source === "operational_rules");
  const recommendation = recommendationForV2Result(result);

  useEffect(() => {
    const token = getStoredSessionToken();
    if (!token) return;
    void getRiskEngineV2Configuration({ data: { token } }).then((response) => {
      if (!response.ok) return;
      setSavedMlWeight(response.configuration.mlWeight);
      setMlWeight(response.configuration.mlWeight);
    });
  }, []);

  const handleDraftChange = (value: number) => {
    setMlWeight(value);
    setSaveStatus("idle");
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!hasUnsavedChanges || !isValidDraft || saveStatus === "saving") return;
    const token = getStoredSessionToken();
    if (!token) {
      setSaveStatus("error");
      setSaveError("Sessão não autorizada.");
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);
    try {
      const response = await saveRiskEngineV2Configuration({
        data: { token, mlWeight, operationalRulesWeight },
      });
      if (!response.ok) {
        setSaveStatus("error");
        setSaveError(response.error);
        return;
      }
      setSavedMlWeight(response.configuration.mlWeight);
      setSaveStatus("success");
    } catch {
      setSaveStatus("error");
      setSaveError("Não foi possível salvar os pesos.");
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-primary/25 bg-primary/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Risk Engine V2 · operação avaliada
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {evaluation.context.client.name} · {evaluation.context.farm.name} ·{" "}
              {evaluation.context.machine.type} {evaluation.context.machine.id} · operação{" "}
              {evaluation.context.operation.id} · {evaluation.context.farm.municipality}/
              {evaluation.context.farm.state}
            </p>
            {evaluation.hasIncompleteInputs && (
              <p className="mt-1 max-w-3xl text-xs text-warning-foreground">
                Localização {quality.location === "geocoded" ? "geocodificada" : "indisponível"};
                clima {quality.weather === "historical_api" ? "histórico real" : "imputado"};
                altitude {quality.altitude === "elevation_api" ? "real" : "imputada"}.
                COD_MOD e histórico de itens seguem imputados; água e terreno seguem sintéticos.
              </p>
            )}
          </div>
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Engine {result.engineVersion}
          </span>
        </div>
      </Card>

      <Card className="border-primary/20">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
          <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" /> Pesos definidos pela Sompo
          </div>
          <div className="mt-5 flex items-end justify-between">
            <div>
               <div className="text-sm font-medium">Peso climático</div>
               <div className="text-xs text-muted-foreground">Peso do score climático</div>
            </div>
            <div className="text-3xl font-semibold tabular-nums text-primary">{mlWeight}%</div>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[mlWeight]}
            onValueChange={([value]) => handleDraftChange(value)}
             aria-label="Peso climático no Risk Engine V2"
            className="mt-4"
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
             <span>0% Climático</span>
             <span>100% Climático</span>
          </div>
          <div className="mt-5 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                 <Wrench className="h-4 w-4 text-warning" /> Operacional
              </span>
              <span className="text-xl font-semibold tabular-nums">{operationalRulesWeight}%</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
               Peso operacional
            </p>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Os pesos definem quanto cada componente participa do Score Final. Eles não alteram o
             treinamento das fontes futuras de probabilidade.
          </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Composição atual
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                 <div className="text-xs text-muted-foreground">Climático</div>
                <div className="text-3xl font-semibold tabular-nums text-info">{mlWeight}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Operacional</div>
                <div className="text-3xl font-semibold tabular-nums text-warning-foreground">
                  {operationalRulesWeight}%
                </div>
              </div>
            </div>
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium text-foreground">
               Configuração ativa: Climático {savedMlWeight}% / Operacional {savedOperationalRulesWeight}%
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasUnsavedChanges || !isValidDraft || saveStatus === "saving"}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveStatus === "saving" ? "Salvando…" : "Salvar pesos"}
              </button>
              {hasUnsavedChanges && (
                <span className="text-xs font-medium text-warning-foreground">
                  Alterações não salvas
                </span>
              )}
              {!hasUnsavedChanges && saveStatus === "success" && (
                <span role="status" className="text-xs font-medium text-success">
                  Pesos salvos com sucesso
                </span>
              )}
            </div>
            {saveStatus === "error" && saveError && (
              <p role="alert" className="mt-2 text-xs font-medium text-danger">
                {saveError}
              </p>
            )}
          </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-info/30 bg-info/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-info">
                 Score climático
              </div>
              <div className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
                {fmt(result.ml.mlRelativeScore)}
                <span className="ml-2 text-xl font-medium text-muted-foreground">/ 100</span>
              </div>
            </div>
            <span className="rounded-full border border-info/30 bg-background px-2.5 py-1 text-xs font-medium text-info">
              Peso {mlWeight}%
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
             Score climático
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Baseado em clima, histórico e estrutura do risco.
          </p>
          <div className="mt-5 border-t border-info/20 pt-4">
             <h3 className="mb-4 text-sm font-semibold text-foreground">Componentes climáticos</h3>
            <MlComponents result={result} />
          </div>
        </Card>

        <Card className="border-warning/30 bg-warning/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-warning-foreground">
                Score operacional
              </div>
              <div className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
                {result.operationalRules.operationalRulesScore}
                <span className="ml-2 text-xl font-medium text-muted-foreground">/ 100</span>
              </div>
            </div>
            <span className="rounded-full border border-warning/30 bg-background px-2.5 py-1 text-xs font-medium text-warning-foreground">
              Peso {operationalRulesWeight}%
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
             Score operacional
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Baseado nas condições atuais da operação demonstrativa.
          </p>
          <div className="mt-5 border-t border-warning/20 pt-4">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Fatores operacionais
            </h3>
            <OperationalFactors result={result} />
          </div>
        </Card>
      </div>

      <Card className="border-2 border-primary/40 bg-primary/5">
        {hasUnsavedChanges && (
          <div className="mb-4 inline-flex rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning-foreground">
            Prévia com pesos não salvos
          </div>
        )}
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
              <Activity className="h-4 w-4" /> Score final de risco
            </div>
            <div className="mt-3 text-6xl font-semibold tabular-nums text-foreground">
              {result.finalScore}
              <span className="ml-2 text-2xl font-medium text-muted-foreground">/ 100</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Operação PostgreSQL com inputs ausentes imputados pelo modelo
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-background/80 p-4 md:min-w-64">
            <LevelBadge level={result.level} />
            <div className="mt-3 flex items-start gap-2 text-sm">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground">Componente dominante</div>
                <strong className="text-foreground">
                  {dominantLabels[result.dominantComponent]}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold">Composição ponderada</h2>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">
            Como os dois scores participam do resultado final.
          </p>
          <ContributionTable result={result} />
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="font-semibold text-foreground">Score Final</span>
            <strong className="tabular-nums text-primary">{result.finalScore}</strong>
          </div>
        </Card>
        <Card>
        <h2 className="text-sm font-semibold">Principais drivers</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {mlDriver && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                 Primeiro driver climático
              </div>
              <div className="mt-1 text-sm font-medium">
                {mlDriver.label} ·{" "}
                {mlDriver.direction === "decrease"
                  ? "reduz risco relativo"
                  : mlDriver.direction === "increase"
                    ? "aumenta risco relativo"
                    : "efeito neutro"}
              </div>
            </div>
          )}
          {operationalDriver && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Primeiro driver operacional
              </div>
              <div className="mt-1 text-sm font-medium">{operationalDriver.label}</div>
            </div>
          )}
        </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold">Recomendação administrativa</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          Orientação demonstrativa baseada no nível, componente dominante e principais drivers do
          cenário V2 atual.
        </p>
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
          Fator operacional dominante:{" "}
          <strong>
            {result.operationalRules.factors.find(
              (factor) => factor.id === result.operationalRules.dominantFactor,
            )?.label ?? "nenhum fator ativo"}
          </strong>
        </div>
        <RecommendationCard rec={recommendation} />
      </Card>
    </div>
  );
}
