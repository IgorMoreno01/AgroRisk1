import {
  alerts,
  areas,
  clients,
  getArea,
  getClient,
  getMachine,
  machines,
  operationHistory,
  operations,
} from "../mock-data";
import type { AgroRiskRepository } from "./repository";
import type { PreparedOperationRiskInput } from "../risk-engine-v2/prepared-input";
import {
  assertValidRiskWeightValues,
  assertValidExpectedRevision,
  RiskWeightClientNotFoundError,
  RiskWeightConfigurationConflictError,
  type EffectiveRiskWeightConfiguration,
  type StoredRiskWeightConfiguration,
} from "./risk-weight-configuration";

const DEFAULT_RISK_WEIGHTS = { mlWeight: 70, operationalRulesWeight: 30 } as const;

export function createMockRepository(): AgroRiskRepository {
  const preparedSnapshots = new Map<string, PreparedOperationRiskInput>();
  let globalConfiguration: StoredRiskWeightConfiguration | undefined;
  const clientOverrides = new Map<string, StoredRiskWeightConfiguration>();
  let nextRevision = 1;

  const ensureClient = (clientId: string) => {
    if (!getClient(clientId)) throw new RiskWeightClientNotFoundError(clientId);
  };

  const nextConfiguration = (
    clientId: string | null,
    weights: { mlWeight: number; operationalRulesWeight: number },
    expectedRevision: number | null,
    current: StoredRiskWeightConfiguration | undefined,
    updatedBy: string | null | undefined,
  ): StoredRiskWeightConfiguration => {
    assertValidRiskWeightValues(weights);
    assertValidExpectedRevision(expectedRevision);
    if (
      (current === undefined && expectedRevision !== null) ||
      (current !== undefined && current.revision !== expectedRevision)
    ) {
      throw new RiskWeightConfigurationConflictError();
    }
    return {
      clientId,
      ...weights,
      revision: nextRevision++,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy ?? null,
    };
  };

  return {
    async listClients() { return clients; },
    async listAreas() { return areas; },
    async listMachines() { return machines; },
    async listOperations() { return operations; },
    async listAlerts() { return alerts; },
    async listOperationHistory() { return operationHistory; },
    async getClient(id) { return getClient(id); },
    async getArea(id) { return getArea(id); },
    async getMachine(id) { return getMachine(id); },
    async getOperation(id) { return operations.find((operation) => operation.id === id); },
    async getOperationRiskInputSnapshot(operationId) {
      return preparedSnapshots.get(operationId);
    },
    async upsertOperationRiskInputSnapshot(snapshot) {
      preparedSnapshots.set(snapshot.operationId, snapshot);
    },
    async getGlobalRiskWeightConfiguration() {
      return globalConfiguration ? { ...globalConfiguration } : undefined;
    },
    async saveGlobalRiskWeightConfiguration(weights, options) {
      globalConfiguration = nextConfiguration(
        null, weights, options.expectedRevision, globalConfiguration, options.updatedBy,
      );
      return { ...globalConfiguration };
    },
    async getClientRiskWeightOverride(clientId) {
      ensureClient(clientId);
      const override = clientOverrides.get(clientId);
      return override ? { ...override } : undefined;
    },
    async saveClientRiskWeightOverride(clientId, weights, options) {
      ensureClient(clientId);
      const configuration = nextConfiguration(
        clientId, weights, options.expectedRevision, clientOverrides.get(clientId), options.updatedBy,
      );
      clientOverrides.set(clientId, configuration);
      return { ...configuration };
    },
    async deleteClientRiskWeightOverride(clientId, expectedRevision) {
      ensureClient(clientId);
      const current = clientOverrides.get(clientId);
      if (expectedRevision !== undefined && current?.revision !== expectedRevision) {
        throw new RiskWeightConfigurationConflictError();
      }
      clientOverrides.delete(clientId);
    },
    async resolveEffectiveRiskWeights(clientId): Promise<EffectiveRiskWeightConfiguration> {
      if (clientId) {
        ensureClient(clientId);
        const override = clientOverrides.get(clientId);
        if (override) {
          return {
            weights: {
              mlWeight: override.mlWeight,
              operationalRulesWeight: override.operationalRulesWeight,
            },
            source: "client",
            revision: override.revision,
            updatedAt: override.updatedAt,
          };
        }
      }
      if (globalConfiguration) {
        return {
          weights: {
            mlWeight: globalConfiguration.mlWeight,
            operationalRulesWeight: globalConfiguration.operationalRulesWeight,
          },
          source: "global",
          revision: globalConfiguration.revision,
          updatedAt: globalConfiguration.updatedAt,
        };
      }
      return {
        weights: { ...DEFAULT_RISK_WEIGHTS },
        source: "default",
        revision: null,
        updatedAt: null,
      };
    },
  };
}

export const mockRepository = createMockRepository();