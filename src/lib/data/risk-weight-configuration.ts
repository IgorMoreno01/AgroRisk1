export interface RiskWeightValues {
  mlWeight: number;
  operationalRulesWeight: number;
}

export interface StoredRiskWeightConfiguration extends RiskWeightValues {
  clientId: string | null;
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface EffectiveRiskWeightConfiguration {
  weights: RiskWeightValues;
  source: "client" | "global" | "default";
  revision: number | null;
  updatedAt: string | null;
}

export interface SaveRiskWeightConfigurationOptions {
  expectedRevision: number | null;
  updatedBy?: string | null;
}

export class RiskWeightConfigurationConflictError extends Error {
  constructor(message = "A configuração foi alterada por outra solicitação.") {
    super(message);
    this.name = "RiskWeightConfigurationConflictError";
  }
}

export class RiskWeightClientNotFoundError extends Error {
  constructor(clientId: string) {
    super(`Cliente não encontrado: ${clientId}`);
    this.name = "RiskWeightClientNotFoundError";
  }
}

export function assertValidRiskWeightValues(weights: RiskWeightValues): void {
  const { mlWeight, operationalRulesWeight } = weights;
  if (
    !Number.isFinite(mlWeight) ||
    !Number.isFinite(operationalRulesWeight) ||
    !Number.isInteger(mlWeight) ||
    !Number.isInteger(operationalRulesWeight) ||
    mlWeight < 0 ||
    mlWeight > 100 ||
    operationalRulesWeight < 0 ||
    operationalRulesWeight > 100 ||
    mlWeight + operationalRulesWeight !== 100
  ) {
    throw new RangeError(
      "Os pesos ML e Regras devem ser inteiros finitos entre 0 e 100 e totalizar 100%.",
    );
  }
}

export function assertValidExpectedRevision(expectedRevision: number | null): void {
  if (
    expectedRevision !== null &&
    (!Number.isInteger(expectedRevision) || expectedRevision <= 0)
  ) {
    throw new RangeError("A revisão esperada deve ser um inteiro positivo ou null.");
  }
}

export function assertValidStoredRiskWeightConfiguration(
  configuration: StoredRiskWeightConfiguration,
): void {
  assertValidRiskWeightValues(configuration);
  if (!Number.isInteger(configuration.revision) || configuration.revision <= 0) {
    throw new RangeError("A revisão da configuração de pesos deve ser um inteiro positivo.");
  }
  if (!configuration.updatedAt) {
    throw new RangeError("A configuração de pesos persistida não possui data de atualização.");
  }
}