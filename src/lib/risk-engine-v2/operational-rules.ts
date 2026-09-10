import type {
  OperationalRuleFactor,
  OperationalRulesResult,
} from "./types";

export type OperationalWaterDistance =
  | "acima_150"
  | "100_150"
  | "50_100"
  | "abaixo_50";

/**
 * Atividade atual executada pela máquina. Não representa COD_MOD, que é uma
 * modalidade estrutural histórica usada exclusivamente pelo modelo ML.
 */
export type OperationalActivityType =
  | "Trabalho no campo"
  | "Transporte"
  | "Operação próxima de água"
  | "Deslocamento interno"
  | "Pulverização"
  | "Colheita";

export type OperationalTerrain =
  | "normal"
  | "umido"
  | "critico"
  | "baixa_aderencia";

export interface OperationalRulesInput {
  waterDistance: OperationalWaterDistance;
  operationType: OperationalActivityType;
  terrain: OperationalTerrain;
}

const RULES_VERSION = "1.0";
const BASE_MAX_POINTS = 48;

const WATER_POINTS: Record<OperationalWaterDistance, number> = {
  acima_150: 0,
  "100_150": 6,
  "50_100": 12,
  abaixo_50: 18,
};

const OPERATION_POINTS: Record<OperationalActivityType, number> = {
  "Trabalho no campo": 6,
  Transporte: 9,
  "Pulverização": 8,
  Colheita: 8,
  "Deslocamento interno": 4,
  "Operação próxima de água": 15,
};

const TERRAIN_POINTS: Record<OperationalTerrain, number> = {
  normal: 0,
  umido: 7,
  critico: 13,
  baixa_aderencia: 15,
};

const factor = (
  id: "water_proximity" | "operation_type" | "terrain",
  label: string,
  detail: string,
  points: number,
  maxPoints: number,
): OperationalRuleFactor => ({
  id,
  category: id,
  label,
  detail,
  points,
  maxPoints,
  active: points > 0,
});

/**
 * Em empate, a ordem deste array define a precedência:
 * water_proximity, operation_type, terrain e, futuramente, sompo_policy.
 */
const dominantFactor = (
  factors: readonly OperationalRuleFactor[],
): string | undefined =>
  factors.reduce<OperationalRuleFactor | undefined>(
    (dominant, current) =>
      dominant === undefined || current.points > dominant.points
        ? current
        : dominant,
    undefined,
  )?.id;

export const evaluateOperationalRulesV2 = (
  input: OperationalRulesInput,
): OperationalRulesResult => {
  const factors = [
    factor(
      "water_proximity",
      "Proximidade de água",
      input.waterDistance,
      WATER_POINTS[input.waterDistance],
      18,
    ),
    factor(
      "operation_type",
      "Tipo de operação",
      input.operationType,
      OPERATION_POINTS[input.operationType],
      15,
    ),
    factor(
      "terrain",
      "Condição do terreno",
      input.terrain,
      TERRAIN_POINTS[input.terrain],
      15,
    ),
  ];

  const rawPoints = factors.reduce(
    (total, currentFactor) => total + currentFactor.points,
    0,
  );

  return {
    rulesVersion: RULES_VERSION,
    operationalRulesScore: Math.round(
      (rawPoints / BASE_MAX_POINTS) * 100,
    ),
    factors,
    dominantFactor: dominantFactor(factors),
  };
};