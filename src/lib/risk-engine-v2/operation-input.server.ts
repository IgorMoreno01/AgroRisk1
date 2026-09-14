import type { Area, Client, Machine, Operation } from "../mock-data";
import type { MlRiskInput } from "../ml-risk/types";
import type {
  ElevationData,
  HistoricalWeatherFeatures,
  WaterGeoData,
} from "../external-data.types";
import { evaluateRiskEngineV2, type RiskEngineV2EvaluationInput } from "./evaluate";
import type {
  OperationalActivityType,
  OperationalTerrain,
  OperationalWaterDistance,
} from "./operational-rules";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./types";
import {
  OPERATION_RISK_INPUT_VERSION,
  type PreparedOperationRiskInput,
} from "./prepared-input";

export type RiskInputSource =
  | "postgres"
  | "derived"
  | "missing_imputed"
  | "synthetic_demo"
  | "geocoded"
  | "historical_api"
  | "elevation_api"
  | "hydrography_api"
  | "postgres_context"
  | "derived_validated"
  | "fallback_unavailable";

/** Compatibility type for preparation-focused tests; runtime evaluation never accepts services. */
export type OperationRiskExternalServices =
  import("./prepare-operation-input.server").OperationRiskExternalServices;

export interface GeocodedLocation {
  source: "open-meteo-geocoding";
  latitude: number;
  longitude: number;
  municipality: string;
  state: string;
}

export interface OperationRiskFarm {
  id: string;
  name: string;
  municipality: string;
  state: string;
}

export type SerializableJson =
  | string
  | number
  | boolean
  | null
  | SerializableJson[]
  | { [key: string]: SerializableJson };

export interface OperationRiskRelationalContext {
  source: "postgres" | "mock";
  operation: Operation;
  machine: Machine;
  area: Area;
  farm: OperationRiskFarm;
  client: Client;
  terrainContext?: SerializableJson;
  preparedInput?: PreparedOperationRiskInput;
}

export interface OperationRiskInputProvenance {
  ml: Record<keyof MlRiskInput, RiskInputSource>;
  operationalRules: {
    waterDistance: RiskInputSource;
    operationType: RiskInputSource;
    terrain: RiskInputSource;
  };
  external: {
    location: "geocoded" | "fallback_unavailable";
    weather: "historical_api" | "missing_imputed";
    altitude: "elevation_api" | "missing_imputed";
    water: "hydrography_api" | "synthetic_demo";
    terrain: "postgres_context" | "derived_validated" | "synthetic_demo";
  };
  snapshot: {
    status: "absent" | "stale" | "reference_mismatch" | "version_mismatch" | "invalid_input" | "valid";
    operationId?: string;
    referenceDate?: string;
    version?: string;
  };
}

export interface OperationRiskEvaluation {
  input: RiskEngineV2EvaluationInput;
  result: PublicRiskEngineV2Result;
  context: OperationRiskRelationalContext;
  provenance: OperationRiskInputProvenance;
  hasIncompleteInputs: boolean;
  externalData: {
    location: GeocodedLocation | null;
    weather: HistoricalWeatherFeatures | null;
    elevation: Pick<ElevationData, "source" | "elevationM"> | null;
    water: Pick<WaterGeoData, "source" | "nearestDistanceM"> | null;
  };
}

export type PublicRiskEngineV2Result = Omit<RiskEngineV2Result, "ml"> & {
  ml: Omit<RiskEngineV2Result["ml"], "sampleProbabilityInternal">;
};

const OPERATION_TYPES = new Set<OperationalActivityType>([
  "Trabalho no campo",
  "Transporte",
  "Operação próxima de água",
  "Deslocamento interno",
  "Pulverização",
  "Colheita",
]);

export function validateOperationType(value: string): OperationalActivityType {
  if (OPERATION_TYPES.has(value as OperationalActivityType)) return value as OperationalActivityType;
  throw new Error(`Tipo de operação inválido para o Risk Engine V2: ${value}`);
}

export function mapNearestWaterDistance(nearestDistanceM: number): OperationalWaterDistance | null {
  if (!Number.isFinite(nearestDistanceM) || nearestDistanceM < 0) return null;
  if (nearestDistanceM > 150) return "acima_150";
  if (nearestDistanceM >= 100) return "100_150";
  if (nearestDistanceM >= 50) return "50_100";
  return "abaixo_50";
}

export function mapValidatedTerrainContext(value: unknown): OperationalTerrain | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.dataNature !== "validated_operational_terrain") return null;
  return record.classification === "normal" || record.classification === "umido" ||
    record.classification === "critico" || record.classification === "baixa_aderencia"
    ? record.classification
    : null;
}

export function buildFallbackOperationRiskContext(
  operation: Operation,
  machine: Machine,
  area: Area,
  client: Client,
): OperationRiskRelationalContext {
  return {
    source: "mock",
    operation,
    machine,
    area,
    farm: {
      id: `synthetic-${area.id}`,
      name: area.client,
      municipality: client.city,
      state: client.state,
    },
    client,
  };
}

const missingMlInput = (operation: Operation, farm: OperationRiskFarm): MlRiskInput => ({
  DT_REFERENCIA: operation.scheduledAt.slice(0, 10),
  COD_MOD: null,
  UF: farm.state || null,
  PRECIPITACAO_D1_MM: null,
  CHUVA_7D_MM: null,
  CHUVA_30D_MM: null,
  TEMP_MEDIA_D1_C: null,
  TEMP_MAX_D1_C: null,
  TEMP_MIN_D1_C: null,
  UMIDADE_D1_PCT: null,
  VENTO_D1_MS: null,
  ALTITUDE_ML_M: null,
  HIST_ITEM_SAFE_N_TOTAL: null,
  HIST_ITEM_SAFE_TEM_ANT: null,
  HIST_ITEM_SAFE_DIAS_DESDE_ULT: null,
  HIST_ITEM_SAFE_N_90D: null,
  HIST_ITEM_SAFE_N_365D: null,
});

const missingProvenance = (
  source: RiskInputSource,
  status: OperationRiskInputProvenance["snapshot"]["status"],
  snapshot?: PreparedOperationRiskInput,
): OperationRiskInputProvenance => ({
  ml: {
    DT_REFERENCIA: "derived", COD_MOD: "missing_imputed", UF: source,
    PRECIPITACAO_D1_MM: "missing_imputed", CHUVA_7D_MM: "missing_imputed",
    CHUVA_30D_MM: "missing_imputed", TEMP_MEDIA_D1_C: "missing_imputed",
    TEMP_MAX_D1_C: "missing_imputed", TEMP_MIN_D1_C: "missing_imputed",
    UMIDADE_D1_PCT: "missing_imputed", VENTO_D1_MS: "missing_imputed",
    ALTITUDE_ML_M: "missing_imputed", HIST_ITEM_SAFE_N_TOTAL: "missing_imputed",
    HIST_ITEM_SAFE_TEM_ANT: "missing_imputed", HIST_ITEM_SAFE_DIAS_DESDE_ULT: "missing_imputed",
    HIST_ITEM_SAFE_N_90D: "missing_imputed", HIST_ITEM_SAFE_N_365D: "missing_imputed",
  },
  operationalRules: { operationType: source, waterDistance: "synthetic_demo", terrain: "synthetic_demo" },
  external: {
    location: "fallback_unavailable", weather: "missing_imputed", altitude: "missing_imputed",
    water: "synthetic_demo", terrain: "synthetic_demo",
  },
  snapshot: {
    status,
    operationId: snapshot?.operationId,
    referenceDate: snapshot?.referenceDate,
    version: snapshot?.version,
  },
});

const ML_KEYS = Object.keys(missingMlInput({
  id: "", machineId: "", machine: "", operatorId: "", clientId: "", areaId: "",
  area: "", type: "Colheita", scheduledAt: "2000-01-01T00:00:00.000Z",
  start: "", duration: "", status: "Agendada", score: 0, factors: [], recommendationId: "",
}, { id: "", name: "", municipality: "", state: "" }));
const SOURCE_VALUES = new Set([
  "postgres", "derived", "missing_imputed", "synthetic_demo", "geocoded",
  "historical_api", "elevation_api", "hydrography_api", "postgres_context",
  "derived_validated", "fallback_unavailable",
]);

function isStrictProvenance(value: Record<string, unknown>): boolean {
  const ml = value.ml as Record<string, unknown> | undefined;
  const rules = value.operationalRules as Record<string, unknown> | undefined;
  const external = value.external as Record<string, unknown> | undefined;
  const snapshot = value.snapshot as Record<string, unknown> | undefined;
  if (!ml || !rules || !external || !snapshot) return false;
  return Object.keys(ml).length === ML_KEYS.length &&
    Object.keys(rules).length === 3 &&
    Object.keys(external).length === 5 &&
    Object.keys(snapshot).every((key) => ["status", "operationId", "referenceDate", "version"].includes(key)) &&
    ML_KEYS.every((key) => typeof ml[key] === "string" && SOURCE_VALUES.has(ml[key] as string)) &&
    ["waterDistance", "operationType", "terrain"].every((key) =>
      typeof rules[key] === "string" && SOURCE_VALUES.has(rules[key] as string)) &&
    ["location", "weather", "altitude", "water", "terrain"].every((key) =>
      typeof external[key] === "string" && SOURCE_VALUES.has(external[key] as string)) &&
    typeof snapshot.status === "string" &&
    new Set(["valid", "absent", "stale", "reference_mismatch", "version_mismatch", "invalid_input"])
      .has(snapshot.status);
}

function validatePreparedInput(
  snapshot: PreparedOperationRiskInput | undefined,
  context: OperationRiskRelationalContext,
): { snapshot?: PreparedOperationRiskInput; status: OperationRiskInputProvenance["snapshot"]["status"] } {
  if (!snapshot) return { status: "absent" };
  const candidate = snapshot as unknown as {
    mlInput?: Record<string, unknown>;
    operationalRulesInput?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
  };
  if (snapshot.operationId !== context.operation.id) return { status: "stale" };
  const referenceDate = context.operation.scheduledAt.slice(0, 10);
  if (snapshot.referenceDate !== referenceDate || snapshot.mlInput?.DT_REFERENCIA !== referenceDate) {
    return { status: "reference_mismatch" };
  }
  if (snapshot.version !== OPERATION_RISK_INPUT_VERSION) return { status: "version_mismatch" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.referenceDate) ||
      !candidate.mlInput || !candidate.operationalRulesInput || !candidate.provenance) {
    return { status: "invalid_input" };
  }
  if (
    Object.keys(candidate.mlInput).length !== ML_KEYS.length ||
    ML_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(candidate.mlInput, key)) ||
    typeof candidate.mlInput.DT_REFERENCIA !== "string" ||
    (candidate.mlInput.COD_MOD !== null && typeof candidate.mlInput.COD_MOD !== "string") ||
    (candidate.mlInput.UF !== null && typeof candidate.mlInput.UF !== "string") ||
    ML_KEYS.slice(3).some((key) => {
      const value = candidate.mlInput?.[key];
      return value !== null && (typeof value !== "number" || !Number.isFinite(value));
    }) ||
    !isStrictProvenance(candidate.provenance)
  ) return { status: "invalid_input" };
  const provenanceSnapshot = candidate.provenance.snapshot as Record<string, unknown>;
  if (provenanceSnapshot.status !== "valid") return { status: "invalid_input" };
  try {
    validateOperationType(snapshot.operationalRulesInput.operationType);
  } catch {
    return { status: "invalid_input" };
  }
  if (Object.keys(snapshot.operationalRulesInput).length !== 3 ||
      !["acima_150", "100_150", "50_100", "abaixo_50"].includes(snapshot.operationalRulesInput.waterDistance) ||
      !["normal", "umido", "critico", "baixa_aderencia"].includes(snapshot.operationalRulesInput.terrain)) {
    return { status: "invalid_input" };
  }
  if (
    (snapshot.latitude !== null && (!Number.isFinite(snapshot.latitude) || typeof snapshot.latitude !== "number")) ||
    (snapshot.longitude !== null && (!Number.isFinite(snapshot.longitude) || typeof snapshot.longitude !== "number"))
  ) return { status: "invalid_input" };
  return { snapshot, status: "valid" };
}

export async function buildOperationRiskV2EvaluationInput(
  context: OperationRiskRelationalContext,
  weights: RiskEngineV2Weights,
  /** Preparation/test-only seam. Runtime dashboard callers omit this argument. */
  services?: OperationRiskExternalServices,
): Promise<Omit<OperationRiskEvaluation, "result">> {
  const source = context.source === "postgres" ? "postgres" : "synthetic_demo";
  const fallback = missingMlInput(context.operation, context.farm);
  const preparedInput = services
    ? await (await import("./prepare-operation-input.server"))
      .prepareOperationRiskInputSnapshot(context, services)
    : context.preparedInput;
  const validation = validatePreparedInput(preparedInput, context);
  const prepared = validation.snapshot;
  const mlInput = prepared?.mlInput ?? fallback;
  const operationalRulesInput = prepared?.operationalRulesInput ?? {
    operationType: validateOperationType(context.operation.type),
    waterDistance: "acima_150" as const,
    terrain: "normal" as const,
  };
  const provenance = prepared
    ? prepared.provenance as unknown as OperationRiskInputProvenance
    : missingProvenance(source, validation.status, context.preparedInput);
  return {
    input: { mlInput, operationalRulesInput, weights },
    context,
    provenance,
    hasIncompleteInputs: !prepared || Object.values(mlInput).some((value) => value === null),
    externalData: {
      location: prepared && prepared.latitude !== null && prepared.longitude !== null
        ? {
            source: "open-meteo-geocoding",
            latitude: prepared.latitude,
            longitude: prepared.longitude,
            municipality: context.farm.municipality,
            state: context.farm.state,
          }
        : null,
      weather: null,
      elevation: null,
      water: null,
    },
  };
}

export async function evaluateOperationRiskV2(
  context: OperationRiskRelationalContext,
  weights: RiskEngineV2Weights,
): Promise<OperationRiskEvaluation> {
  const evaluation = await buildOperationRiskV2EvaluationInput(context, weights);
  const result = evaluateRiskEngineV2(evaluation.input);
  const { sampleProbabilityInternal: _internal, ...publicMl } = result.ml;
  return { ...evaluation, result: { ...result, ml: publicMl } };
}