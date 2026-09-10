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
import { recommendationsForOperation } from "@/lib/recommendations";
import { operations } from "@/lib/mock-data";
import {
  DEFAULT_RISK_ENGINE_V2_ML_WEIGHT,
  evaluateRiskEngineV2DemoScenario,
  RISK_ENGINE_V2_DEMO_SCENARIOS,
  type RiskEngineV2DemoScenarioId,
} from "@/lib/risk-engine-v2/demo-scenario";
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
  ml: "Modelo ML",
  operational_rules: "Regras operacionais",
  balanced: "Equilibrado",
} as const;

const fmt = (value: number) => value.toFixed(2);

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

function Metric({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</div>
    </div>
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
                {item.component === "ml" ? "ML" : "Regras operacionais"}
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

export function AdminV2RiskPanel() {
  const [scenarioId, setScenarioId] = useState<RiskEngineV2DemoScenarioId>("low");
  const [mlWeight, setMlWeight] = useState(DEFAULT_RISK_ENGINE_V2_ML_WEIGHT);
  const [savedMlWeight, setSavedMlWeight] = useState(DEFAULT_RISK_ENGINE_V2_ML_WEIGHT);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const result = useMemo(
    () => evaluateRiskEngineV2DemoScenario(scenarioId, mlWeight),
    [mlWeight, scenarioId],
  );
  const selectedScenario = RISK_ENGINE_V2_DEMO_SCENARIOS[scenarioId];
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
  const scenario =
    operations.find((operation) => operation.status === "Em andamento") ?? operations[0];
  const recommendations = recommendationsForOperation(scenario, "admin");
  const mlDriver = result.drivers.find((driver) => driver.source === "ml");
  const operationalDriver = result.drivers.find((driver) => driver.source === "operational_rules");

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
              <ShieldCheck className="h-4 w-4 text-primary" /> Risk Engine V2 · cenário
              demonstrativo
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Cenário demonstrativo do MVP; algumas fontes podem utilizar dados simulados/fallback.
            </p>
          </div>
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Engine {result.engineVersion}
          </span>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Cenário demonstrativo</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Selecione uma faixa para revisar o comportamento do mesmo Risk Engine V2.
            </p>
          </div>
          <div className="inline-flex w-full rounded-lg border border-border bg-muted/30 p-1 sm:w-auto">
            {(Object.keys(RISK_ENGINE_V2_DEMO_SCENARIOS) as RiskEngineV2DemoScenarioId[]).map(
              (id) => {
                const scenarioOption = RISK_ENGINE_V2_DEMO_SCENARIOS[id];
                const active = scenarioId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setScenarioId(id)}
                    className={cn(
                      "min-w-0 flex-1 rounded-md px-4 py-2 text-sm font-semibold transition sm:flex-none",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background hover:text-foreground",
                    )}
                  >
                    {scenarioOption.label}
                  </button>
                );
              },
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <Card>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" /> Composição do motor
          </div>
          <div className="mt-5 flex items-end justify-between">
            <div>
              <div className="text-sm font-medium">Peso ML</div>
              <div className="text-xs text-muted-foreground">Peso do score ML</div>
            </div>
            <div className="text-3xl font-semibold tabular-nums text-primary">{mlWeight}%</div>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[mlWeight]}
            onValueChange={([value]) => handleDraftChange(value)}
            aria-label="Peso ML no Risk Engine V2"
            className="mt-4"
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>0% ML</span>
            <span>100% ML</span>
          </div>
          <div className="mt-5 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Wrench className="h-4 w-4 text-warning" /> Regras operacionais
              </span>
              <span className="text-xl font-semibold tabular-nums">{operationalRulesWeight}%</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Peso das regras operacionais
            </p>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Os pesos atuam somente na composição do Risk Engine. Não alteram o treinamento. O clima
            já está dentro do ML para evitar dupla contagem.
          </p>
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium text-foreground">
              Configuração ativa: ML {savedMlWeight}% / Regras {savedOperationalRulesWeight}%
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
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-primary" /> Resultado para revisão
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Golden Vector {selectedScenario.goldenVector} + entrada operacional validada
              </p>
            </div>
            <LevelBadge level={result.level} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <Metric
              label="Score ML global"
              value={fmt(result.ml.mlRelativeScore)}
              tone="text-info"
            />
            <Metric
              label="Regras operacionais"
              value={String(result.operationalRules.operationalRulesScore)}
              tone="text-warning-foreground"
            />
            <Metric
              label="Score final do Risk Engine"
              value={String(result.finalScore)}
              tone="text-primary"
            />
            <Metric label="Nível" value={result.level} />
          </div>
          <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>Score relativo de risco do ML</span>
            <span>Score externo ao ML</span>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Scale className="h-3.5 w-3.5" /> Componente dominante:{" "}
            <strong className="text-foreground">{dominantLabels[result.dominantComponent]}</strong>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold">Decomposição do sinal ML</h2>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">
            Contribuições assinadas do modelo, em unidades internas.
          </p>
          <MlComponents result={result} />
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Composição ponderada</h2>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">
            Como cada score entra no resultado final.
          </p>
          <ContributionTable result={result} />
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold">Sinais que orientam a revisão</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {mlDriver && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Primeiro driver ML
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

      <Card>
        <h2 className="text-sm font-semibold">Recomendação administrativa</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          A recomendação segue a lógica administrativa existente; o fator operacional dominante
          apenas contextualiza a leitura.
        </p>
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
          Fator operacional dominante:{" "}
          <strong>
            {result.operationalRules.factors.find(
              (factor) => factor.id === result.operationalRules.dominantFactor,
            )?.label ?? "nenhum fator ativo"}
          </strong>
        </div>
        {recommendations.slice(0, 1).map((recommendation) => (
          <RecommendationCard key={recommendation.id} rec={recommendation} />
        ))}
      </Card>
    </div>
  );
}
