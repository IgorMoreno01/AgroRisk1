import type {
  Alert,
  Area,
  Client,
  HistoryEntry,
  Machine,
  Operation,
} from "../mock-data";

export interface AgroRiskRepository {
  listClients(): Promise<Client[]>;
  listAreas(): Promise<Area[]>;
  listMachines(): Promise<Machine[]>;
  listOperations(): Promise<Operation[]>;
  listAlerts(): Promise<Alert[]>;
  listOperationHistory(): Promise<HistoryEntry[]>;
  getClient(id: string): Promise<Client | undefined>;
  getArea(id: string): Promise<Area | undefined>;
  getMachine(id: string): Promise<Machine | undefined>;
  getOperation(id: string): Promise<Operation | undefined>;
}

export type AgroRiskDataSource = "mock" | "postgres";