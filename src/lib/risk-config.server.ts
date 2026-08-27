import {
  DEFAULT_RISK_WEIGHTS,
  isValidRiskWeights,
  type RiskWeights,
} from "./risk-score";

export interface RiskConfiguration extends RiskWeights {
  updatedAt: string | null;
}

let currentConfiguration: RiskConfiguration = {
  ...DEFAULT_RISK_WEIGHTS,
  updatedAt: null,
};

export function getRiskConfiguration(): RiskConfiguration {
  return { ...currentConfiguration };
}

export function saveRiskConfiguration(weights: RiskWeights): RiskConfiguration {
  if (!isValidRiskWeights(weights)) {
    throw new Error("Os pesos devem ser inteiros entre 0 e 100 e totalizar 100%.");
  }

  currentConfiguration = {
    climate: weights.climate,
    operational: weights.operational,
    updatedAt: new Date().toISOString(),
  };
  return getRiskConfiguration();
}