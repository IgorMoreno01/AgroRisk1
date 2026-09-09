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
};