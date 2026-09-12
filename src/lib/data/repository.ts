import type {
  Alert,
  Area,
  Client,
  HistoryEntry,
  Machine,
  Operation,
} from "../mock-data";
import type { PreparedOperationRiskInput } from "../risk-engine-v2/prepared-input";

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
  /** Prepared inputs are optional for compatibility with scoped test stores. */
  getOperationRiskInputSnapshot?(operationId: string): Promise<PreparedOperationRiskInput | undefined>;
  upsertOperationRiskInputSnapshot?(snapshot: PreparedOperationRiskInput): Promise<void>;
}

export type AgroRiskDataSource = "mock" | "postgres";