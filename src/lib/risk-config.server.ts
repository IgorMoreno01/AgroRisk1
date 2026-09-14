import {
  DEFAULT_RISK_WEIGHTS,
  isValidRiskWeights,
  type RiskWeights,
} from "./risk-score";
import { postgresRepository } from "./data/postgres-repository.server";
import type { AgroRiskRepository, RiskWeightConfigurationRepository } from "./data/repository";
import type { RiskEngineV2Weights } from "./risk-engine-v2/types";
import {
  assertValidRiskWeightValues,
  type EffectiveRiskWeightConfiguration,
  type RiskWeightValues,
  type SaveRiskWeightConfigurationOptions,
  type StoredRiskWeightConfiguration,
} from "./data/risk-weight-configuration";

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

export interface PersistedRiskEngineV2Configuration extends RiskEngineV2Configuration {
  revision: number | null;
  source: "global" | "default";
}

const DEFAULT_RISK_ENGINE_V2_CONFIGURATION: RiskEngineV2Configuration = {
  mlWeight: 70,
  operationalRulesWeight: 30,
  updatedAt: null,
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
  return { ...DEFAULT_RISK_ENGINE_V2_CONFIGURATION };
}

export async function getPersistedRiskEngineV2Configuration(
  repository: RiskWeightConfigurationRepository = postgresRepository as RiskWeightConfigurationRepository,
): Promise<PersistedRiskEngineV2Configuration> {
  const effective = await repository.resolveEffectiveRiskWeights();
  return {
    ...effective.weights,
    updatedAt: effective.updatedAt,
    revision: effective.revision,
    source: effective.source === "client" ? "global" : effective.source,
  };
}

export async function getGlobalRiskWeightConfiguration(
  repository: RiskWeightConfigurationRepository = postgresRepository as RiskWeightConfigurationRepository,
): Promise<StoredRiskWeightConfiguration | undefined> {
  return repository.getGlobalRiskWeightConfiguration();
}

export async function saveGlobalRiskWeightConfiguration(
  weights: RiskWeightValues,
  options: SaveRiskWeightConfigurationOptions,
  repository: RiskWeightConfigurationRepository = postgresRepository as RiskWeightConfigurationRepository,
): Promise<StoredRiskWeightConfiguration> {
  assertValidRiskWeightValues(weights);
  return repository.saveGlobalRiskWeightConfiguration(weights, options);
}

export async function getClientRiskWeightOverride(
  clientId: string,
  repository: RiskWeightConfigurationRepository = postgresRepository as RiskWeightConfigurationRepository,
): Promise<StoredRiskWeightConfiguration | undefined> {
  return repository.getClientRiskWeightOverride(clientId);
}

export async function saveClientRiskWeightOverride(
  clientId: string,
  weights: RiskWeightValues,
  options: SaveRiskWeightConfigurationOptions,
  repository: RiskWeightConfigurationRepository = postgresRepository as RiskWeightConfigurationRepository,
): Promise<StoredRiskWeightConfiguration> {
  assertValidRiskWeightValues(weights);
  return repository.saveClientRiskWeightOverride(clientId, weights, options);
}

export async function deleteClientRiskWeightOverride(
  clientId: string,
  expectedRevision?: number,
  repository: RiskWeightConfigurationRepository = postgresRepository as RiskWeightConfigurationRepository,
): Promise<void> {
  return repository.deleteClientRiskWeightOverride(clientId, expectedRevision);
}

export async function resolveEffectiveRiskWeights(
  clientId?: string,
  repository: RiskWeightConfigurationRepository = postgresRepository as RiskWeightConfigurationRepository,
): Promise<EffectiveRiskWeightConfiguration> {
  return repository.resolveEffectiveRiskWeights(clientId);
}

export interface RiskWeightConfigurationScope {
  clientId: string | null;
  mlWeight: number;
  operationalRulesWeight: number;
  source: EffectiveRiskWeightConfiguration["source"];
  revision: number | null;
  updatedAt: string | null;
  hasOverride: boolean;
}

export async function getRiskWeightConfigurationScope(
  clientId?: string,
  repository: RiskWeightConfigurationRepository =
    postgresRepository as RiskWeightConfigurationRepository,
): Promise<RiskWeightConfigurationScope> {
  const effective = await repository.resolveEffectiveRiskWeights(clientId);
  assertValidRiskWeightValues(effective.weights);
  return {
    clientId: clientId ?? null,
    ...effective.weights,
    source: effective.source,
    revision: effective.revision,
    updatedAt: effective.updatedAt,
    hasOverride: effective.source === "client",
  };
}

export interface ResolvedRiskEngineV2Weights {
  weights: RiskEngineV2Weights;
  source: EffectiveRiskWeightConfiguration["source"];
  revision: number | null;
  cacheSignature: string;
}

export async function resolveRiskEngineV2Weights(
  clientId: string | undefined,
  repository: AgroRiskRepository = postgresRepository,
): Promise<ResolvedRiskEngineV2Weights> {
  const effective = repository.resolveEffectiveRiskWeights
    ? await repository.resolveEffectiveRiskWeights(clientId)
    : {
        weights: {
          mlWeight: DEFAULT_RISK_ENGINE_V2_CONFIGURATION.mlWeight,
          operationalRulesWeight:
            DEFAULT_RISK_ENGINE_V2_CONFIGURATION.operationalRulesWeight,
        },
        source: "default" as const,
        revision: null,
        updatedAt: null,
      };
  assertValidRiskWeightValues(effective.weights);
  const weights = {
    ml: effective.weights.mlWeight,
    operationalRules: effective.weights.operationalRulesWeight,
  };
  return {
    weights,
    source: effective.source,
    revision: effective.revision,
    cacheSignature: [
      clientId ?? "global",
      effective.source,
      effective.revision ?? "default",
      weights.ml,
      weights.operationalRules,
    ].join(":"),
  };
}

export async function saveRiskEngineV2Configuration(
  configuration: Pick<RiskEngineV2Configuration, "mlWeight" | "operationalRulesWeight">,
  repository: RiskWeightConfigurationRepository = postgresRepository as RiskWeightConfigurationRepository,
  expectedRevision?: number | null,
): Promise<PersistedRiskEngineV2Configuration> {
  if (!isValidRiskEngineV2Configuration(configuration)) {
    throw new Error("Os pesos ML e Regras devem ser inteiros entre 0 e 100 e totalizar 100%.");
  }
  const current = expectedRevision === undefined
    ? await repository.getGlobalRiskWeightConfiguration()
    : undefined;
  const saved = await repository.saveGlobalRiskWeightConfiguration(configuration, {
    expectedRevision: expectedRevision === undefined
      ? current?.revision ?? null
      : expectedRevision,
  });
  return {
    mlWeight: saved.mlWeight,
    operationalRulesWeight: saved.operationalRulesWeight,
    updatedAt: saved.updatedAt,
    revision: saved.revision,
    source: "global",
  };
}