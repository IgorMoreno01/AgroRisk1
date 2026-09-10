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

export interface RiskEngineV2Configuration {
  mlWeight: number;
  operationalRulesWeight: number;
  updatedAt: string | null;
}

const DEFAULT_RISK_ENGINE_V2_CONFIGURATION: RiskEngineV2Configuration = {
  mlWeight: 70,
  operationalRulesWeight: 30,
  updatedAt: null,
};

let currentRiskEngineV2Configuration: RiskEngineV2Configuration = {
  ...DEFAULT_RISK_ENGINE_V2_CONFIGURATION,
};

export function isValidRiskEngineV2Configuration(
  configuration: Pick<RiskEngineV2Configuration, "mlWeight" | "operationalRulesWeight">,
): boolean {
  const { mlWeight, operationalRulesWeight } = configuration;
  return (
    Number.isInteger(mlWeight) &&
    Number.isInteger(operationalRulesWeight) &&
    mlWeight >= 0 &&
    mlWeight <= 100 &&
    operationalRulesWeight >= 0 &&
    operationalRulesWeight <= 100 &&
    mlWeight + operationalRulesWeight === 100
  );
}

export function getRiskEngineV2Configuration(): RiskEngineV2Configuration {
  return { ...currentRiskEngineV2Configuration };
}

export function saveRiskEngineV2Configuration(
  configuration: Pick<RiskEngineV2Configuration, "mlWeight" | "operationalRulesWeight">,
): RiskEngineV2Configuration {
  if (!isValidRiskEngineV2Configuration(configuration)) {
    throw new Error("Os pesos ML e Regras devem ser inteiros entre 0 e 100 e totalizar 100%.");
  }

  currentRiskEngineV2Configuration = {
    ...configuration,
    updatedAt: new Date().toISOString(),
  };
  return getRiskEngineV2Configuration();
}