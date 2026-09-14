import type {
  RiskDriver,
  RiskEngineV2Component,
  RiskEngineV2Input,
  RiskEngineV2Result,
  RiskEngineV2Weights,
  RiskLevelV2,
} from "./types";

const ENGINE_VERSION = "2.0";
const NUMERIC_TOLERANCE = 1e-9;

const assertFiniteRange = (
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} deve ser um número finito.`);
  }

  if (value < minimum || value > maximum) {
    throw new RangeError(
      `${label} deve estar entre ${minimum} e ${maximum}.`,
    );
  }
};

const validateWeights = (weights: RiskEngineV2Weights): void => {
  assertFiniteRange(weights.ml, "Peso ML", 0, 100);
  assertFiniteRange(
    weights.operationalRules,
    "Peso das regras operacionais",
    0,
    100,
  );

  const total = weights.ml + weights.operationalRules;
  if (Math.abs(total - 100) > NUMERIC_TOLERANCE) {
    throw new RangeError(
      "Os pesos de ML e regras operacionais devem somar 100.",
    );
  }
};

const riskLevelFromScore = (score: number): RiskLevelV2 =>
  score >= 71 ? "alto" : score >= 41 ? "medio" : "baixo";

const dominantComponentFromContributions = (
  mlContribution: number,
  operationalContribution: number,
): RiskEngineV2Component | "balanced" => {
  if (
    Math.abs(mlContribution - operationalContribution) <=
    NUMERIC_TOLERANCE
  ) {
    return "balanced";
  }

  return mlContribution > operationalContribution
    ? "ml"
    : "operational_rules";
};

const stableSortByDescending = <T>(
  items: readonly T[],
  value: (item: T) => number,
): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        value(right.item) - value(left.item) ||
        left.index - right.index,
    )
    .map(({ item }) => item);

const mlDrivers = (input: RiskEngineV2Input): RiskDriver[] =>
  stableSortByDescending(
    input.ml.components.map((component) => ({
      source: "ml" as const,
      code: component.component,
      label: component.label,
      contribution: component.contribution,
      direction: component.direction,
    })),
    (driver) => Math.abs(driver.contribution),
  );

const operationalDrivers = (input: RiskEngineV2Input): RiskDriver[] =>
  stableSortByDescending(
    input.operationalRules.factors
      .filter((factor) => factor.active)
      .map((factor) => ({
        source: "operational_rules" as const,
        code: factor.id,
        label: factor.label,
        contribution: factor.points,
      })),
    (driver) => driver.contribution,
  );

const combineDrivers = (
  input: RiskEngineV2Input,
  dominantComponent: RiskEngineV2Component | "balanced",
): RiskDriver[] => {
  const fromMl = mlDrivers(input);
  const fromOperationalRules = operationalDrivers(input);

  return dominantComponent === "operational_rules"
    ? [...fromOperationalRules, ...fromMl]
    : [...fromMl, ...fromOperationalRules];
};

export const combineRiskEngineV2 = (
  input: RiskEngineV2Input,
): RiskEngineV2Result => {
  validateWeights(input.weights);
  assertFiniteRange(input.ml.mlRelativeScore, "Score ML", 0, 100);
  assertFiniteRange(
    input.operationalRules.operationalRulesScore,
    "Score das regras operacionais",
    0,
    100,
  );

  const mlContribution =
    (input.ml.mlRelativeScore * input.weights.ml) / 100;
  const operationalContribution =
    (input.operationalRules.operationalRulesScore *
      input.weights.operationalRules) /
    100;
  const finalScore = Math.round(
    mlContribution + operationalContribution,
  );
  const dominantComponent = dominantComponentFromContributions(
    mlContribution,
    operationalContribution,
  );

  return {
    engineVersion: ENGINE_VERSION,
    ml: input.ml,
    operationalRules: input.operationalRules,
    weights: input.weights,
    contributions: [
      {
        component: "ml",
        sourceScore: input.ml.mlRelativeScore,
        weight: input.weights.ml,
        weightedContribution: mlContribution,
      },
      {
        component: "operational_rules",
        sourceScore: input.operationalRules.operationalRulesScore,
        weight: input.weights.operationalRules,
        weightedContribution: operationalContribution,
      },
    ],
    finalScore,
    level: riskLevelFromScore(finalScore),
    dominantComponent,
    drivers: combineDrivers(input, dominantComponent),
  };
};