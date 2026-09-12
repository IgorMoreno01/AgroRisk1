import type { MlRiskInput } from "../ml-risk/types";
import type {
  OperationalActivityType,
  OperationalTerrain,
  OperationalWaterDistance,
} from "./operational-rules";

/**
 * Versioned, score-free contract persisted per operation.  Changing Sompo
 * weights never requires changing this record.
 */
export const OPERATION_RISK_INPUT_VERSION = "risk-engine-v2-inputs-1";

export type PreparedInputJson =
  | string
  | number
  | boolean
  | null
  | PreparedInputJson[]
  | { [key: string]: PreparedInputJson };

export interface PreparedOperationalRulesInput {
  waterDistance: OperationalWaterDistance;
  operationType: OperationalActivityType;
  terrain: OperationalTerrain;
}

export interface PreparedOperationRiskInput {
  operationId: string;
  referenceDate: string;
  mlInput: MlRiskInput;
  operationalRulesInput: PreparedOperationalRulesInput;
  latitude: number | null;
  longitude: number | null;
  provenance: { [key: string]: PreparedInputJson };
  generatedAt: string;
  updatedAt: string;
  version: string;
}