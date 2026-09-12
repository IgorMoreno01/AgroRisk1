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

const preparedSnapshots = new Map<string, PreparedOperationRiskInput>();

export const mockRepository: AgroRiskRepository = {
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
};