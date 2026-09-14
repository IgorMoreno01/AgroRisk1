import type {
  Alert,
  Area,
  Client,
  HistoryEntry,
  Machine,
  Operation,
} from "../mock-data";
import type { PreparedOperationRiskInput } from "../risk-engine-v2/prepared-input";
import type {
  EffectiveRiskWeightConfiguration,
  RiskWeightValues,
  SaveRiskWeightConfigurationOptions,
  StoredRiskWeightConfiguration,
} from "./risk-weight-configuration";

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
  getGlobalRiskWeightConfiguration?(): Promise<StoredRiskWeightConfiguration | undefined>;
  saveGlobalRiskWeightConfiguration?(
    weights: RiskWeightValues,
    options: SaveRiskWeightConfigurationOptions,
  ): Promise<StoredRiskWeightConfiguration>;
  getClientRiskWeightOverride?(clientId: string): Promise<StoredRiskWeightConfiguration | undefined>;
  saveClientRiskWeightOverride?(
    clientId: string,
    weights: RiskWeightValues,
    options: SaveRiskWeightConfigurationOptions,
  ): Promise<StoredRiskWeightConfiguration>;
  deleteClientRiskWeightOverride?(clientId: string, expectedRevision?: number): Promise<void>;
  resolveEffectiveRiskWeights?(clientId?: string): Promise<EffectiveRiskWeightConfiguration>;
}

export type RiskWeightConfigurationRepository = Required<
  Pick<
    AgroRiskRepository,
    | "getGlobalRiskWeightConfiguration"
    | "saveGlobalRiskWeightConfiguration"
    | "getClientRiskWeightOverride"
    | "saveClientRiskWeightOverride"
    | "deleteClientRiskWeightOverride"
    | "resolveEffectiveRiskWeights"
  >
>;

export type AgroRiskDataSource = "mock" | "postgres";