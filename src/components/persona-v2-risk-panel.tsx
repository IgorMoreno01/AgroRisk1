import { Activity, ArrowDownRight, ArrowUpRight, ShieldCheck, Target } from "lucide-react";
import { Card, SectionTitle } from "@/components/app-layout";
import { RecommendationCard } from "@/components/recommendation-card";
import { RiskBadge } from "@/components/risk-badge";
import { operations } from "@/lib/mock-data";
import { recommendationsForOperation } from "@/lib/recommendations";
import { evaluateRiskEngineV2Demo } from "@/lib/risk-engine-v2/demo-scenario";
import type { RiskEngineV2Result } from "@/lib/risk-engine-v2/types";

export type RiskPersona = "gestor" | "operador" | "consultor";

const personaCopy = {
  gestor: {
    title: "Risk Engine V2 · visão gerencial",
    description: "Resumo para priorização e acompanhamento do risco operacional.",
    resultTitle: "Resumo executivo de risco",
    factorsTitle: "Principais drivers",
    recommendationTitle: "Recomendação prioritária",
  },
  operador: {
    title: "Risk Engine V2 · operação atual",
    description: "Leitura operacional para orientar a próxima ação com segurança.",
    resultTitle: "Score final da operação",
    factorsTitle: "Principais fatores",
    recommendationTitle: "Próxima ação recomendada",
  },
  consultor: {
    title: "Risk Engine V2 · visão preventiva",
    description: "Leitura simplificada para explicar o risco e orientar o cliente.",
    resultTitle: "Resumo de risco para o cliente",
    factorsTitle: "O que influencia o risco",
    recommendationTitle: "Recomendação preventiva",
  },
} as const;

const dominantLabels = {
  ml: "Modelo ML",
  operational_rules: "Regras operacionais",
  balanced: "ML e regras equilibrados",
} as const;

const directionLabel = (direction?: "increase" | "decrease" | "neutral") => {
  if (direction === "increase") return "eleva o risco relativo";
  if (direction === "decrease") return "reduz o risco relativo";
  return "tem efeito neutro";
};

export function getRiskEngineV2DemoResult(): RiskEngineV2Result {
  return evaluateRiskEngineV2Demo();
}

function ScoreMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background/70 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function DriverCard({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>
    </div>
  );
}

export function PersonaV2RiskPanel({ persona }: { persona: RiskPersona }) {
  const result = getRiskEngineV2DemoResult();
  const copy = personaCopy[persona];
  const scenario =
    operations.find((operation) => operation.status === "Em andamento") ?? operations[0];
  const recommendation = recommendationsForOperation(scenario, persona)[0];
  const mlDriver = result.drivers.find((driver) => driver.source === "ml");
  const operationalDriver = result.drivers.find(
    (driver) => driver.source === "operational_rules",
  );

  return (
    <section
      aria-label={`Resultado demonstrativo do Risk Engine V2 para ${persona}`}
      className="mt-6 space-y-4"
    >
      <Card className="border-primary/25 bg-primary/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              {copy.title}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Cenário demonstrativo do MVP; não representa uma operação produtiva real e algumas
              fontes podem utilizar dados simulados/fallback.
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Engine {result.engineVersion}
          </span>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <Card>
          <SectionTitle
            title={copy.resultTitle}
            description="Resultado único do motor, com os pesos definidos no cenário Sompo."
            action={<RiskBadge level={result.level} />}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <ScoreMetric label="Score final" value={result.finalScore} />
            {persona !== "operador" && (
              <ScoreMetric
                label="Score relativo de risco do ML"
                value={result.ml.mlRelativeScore.toFixed(2)}
              />
            )}
            {persona !== "operador" && (
              <ScoreMetric
                label="Score regras operacionais"
                value={result.operationalRules.operationalRulesScore}
              />
            )}
            {persona === "operador" && (
              <ScoreMetric label="Nível" value={result.level} />
            )}
            {persona === "operador" && (
              <ScoreMetric
                label="Principal componente"
                value={dominantLabels[result.dominantComponent]}
              />
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
            <Activity className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">Componente dominante:</span>
            <strong className="text-foreground">
              {dominantLabels[result.dominantComponent]}
            </strong>
          </div>
        </Card>

        <Card>
          <SectionTitle title={copy.factorsTitle} />
          <div className="space-y-2">
            {mlDriver && (
              <DriverCard
                label={mlDriver.label}
                description={`Sinal do modelo que ${directionLabel(mlDriver.direction)}.`}
              />
            )}
            {operationalDriver && (
              <DriverCard
                label={operationalDriver.label}
                description="Fator identificado pelas regras operacionais."
              />
            )}
          </div>
          {persona === "operador" && (
            <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed text-foreground">
              Contexto operacional: confirme as condições do entorno antes de prosseguir e siga a
              ação recomendada.
            </p>
          )}
        </Card>
      </div>

      {persona !== "operador" && (
        <Card>
          <SectionTitle
            title={persona === "gestor" ? "Decomposição resumida do ML" : "Como os fatores atuam"}
            description="Contribuições locais no logit; não são percentuais e não precisam somar 100."
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {result.ml.components.map((component) => {
              const Icon = component.direction === "decrease" ? ArrowDownRight : ArrowUpRight;
              return (
                <div key={component.component} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{component.label}</span>
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {component.contribution >= 0 ? "+" : ""}
                      {component.contribution.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {directionLabel(component.direction)}.
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle
          title={copy.recommendationTitle}
          description="Ação produzida pela lógica de recomendações já existente no MVP."
        />
        {recommendation ? (
          <RecommendationCard rec={recommendation} showAction={persona === "operador"} />
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4" />
            Nenhuma recomendação ativa para este cenário.
          </div>
        )}
      </Card>
    </section>
  );
}