import type { Area, Client, Machine, Operation } from "../mock-data";
import type { MlRiskInput } from "../ml-risk/types";
import { geocodeMunicipality, type GeocodedLocation } from "../adapters/location.server";
import { getHistoricalClimate } from "../adapters/climate.server";
import { getElevationForRisk } from "../adapters/terrain.server";
import { getWaterGeo } from "../adapters/water-geo.server";
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

export interface OperationRiskExternalServices {
  geocode: (municipality: string, state: string) => Promise<GeocodedLocation | null>;
  historicalWeather: (
    lat: number,
    lon: number,
    referenceDate: string,
  ) => Promise<HistoricalWeatherFeatures | null>;
  elevation: (lat: number, lon: number) => Promise<ElevationData | null>;
  water: (lat: number, lon: number) => Promise<WaterGeoData | null>;
}

const defaultExternalServices: OperationRiskExternalServices = {
  geocode: geocodeMunicipality,
  historicalWeather: getHistoricalClimate,
  elevation: getElevationForRisk,
  water: getWaterGeo,
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
  if (OPERATION_TYPES.has(value as OperationalActivityType)) {
    return value as OperationalActivityType;
  }
  throw new Error(`Tipo de operação inválido para o Risk Engine V2: ${value}`);
}

export function mapNearestWaterDistance(
  nearestDistanceM: number,
): OperationalWaterDistance | null {
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
  const classification = record.classification;
  return classification === "normal" ||
    classification === "umido" ||
    classification === "critico" ||
    classification === "baixa_aderencia"
    ? classification
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

const missingMlInput = (
  operation: Operation,
  farm: OperationRiskFarm,
): MlRiskInput => ({
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

export async function buildOperationRiskV2EvaluationInput(
  context: OperationRiskRelationalContext,
  weights: RiskEngineV2Weights,
  services: OperationRiskExternalServices = defaultExternalServices,
): Promise<Omit<OperationRiskEvaluation, "result">> {
  const entitySource: RiskInputSource =
    context.source === "postgres" ? "postgres" : "synthetic_demo";
  const mlInput = missingMlInput(context.operation, context.farm);
  const referenceDate = mlInput.DT_REFERENCIA;
  const location = context.source === "postgres"
    ? await services.geocode(context.farm.municipality, context.farm.state)
    : null;
  const [weather, elevation, waterData] = location
    ? await Promise.all([
        services.historicalWeather(location.latitude, location.longitude, referenceDate),
        services.elevation(location.latitude, location.longitude),
        services.water(location.latitude, location.longitude).catch(() => null),
      ])
    : [null, null, null];
  const realWaterDistanceM =
    waterData?.source === "overpass" ? waterData.nearestDistanceM : null;
  const mappedWaterDistance =
    realWaterDistanceM === null ? null : mapNearestWaterDistance(realWaterDistanceM);
  const mappedTerrain = context.source === "postgres"
    ? mapValidatedTerrainContext(context.terrainContext)
    : null;
  if (weather) {
    mlInput.PRECIPITACAO_D1_MM = weather.precipitationD1Mm;
    mlInput.CHUVA_7D_MM = weather.rain7dMm;
    mlInput.CHUVA_30D_MM = weather.rain30dMm;
    mlInput.TEMP_MEDIA_D1_C = weather.temperatureMeanD1C;
    mlInput.TEMP_MAX_D1_C = weather.temperatureMaxD1C;
    mlInput.TEMP_MIN_D1_C = weather.temperatureMinD1C;
    mlInput.UMIDADE_D1_PCT = weather.humidityMeanD1Pct;
    mlInput.VENTO_D1_MS = weather.windMeanD1Ms;
  }
  if (elevation) mlInput.ALTITUDE_ML_M = elevation.elevationM;
  const input: RiskEngineV2EvaluationInput = {
    mlInput,
    operationalRulesInput: {
      operationType: validateOperationType(context.operation.type),
      // Fallbacks temporários e neutros; nunca derivados de score, near_water, altitude ou declividade.
      waterDistance: mappedWaterDistance ?? "acima_150",
      terrain: mappedTerrain ?? "normal",
    },
    weights,
  };
  const provenance: OperationRiskInputProvenance = {
    ml: {
      DT_REFERENCIA: "derived",
      COD_MOD: "missing_imputed",
      UF: entitySource,
      PRECIPITACAO_D1_MM: weather ? "historical_api" : "missing_imputed",
      CHUVA_7D_MM: weather ? "historical_api" : "missing_imputed",
      CHUVA_30D_MM: weather ? "historical_api" : "missing_imputed",
      TEMP_MEDIA_D1_C: weather ? "historical_api" : "missing_imputed",
      TEMP_MAX_D1_C: weather ? "historical_api" : "missing_imputed",
      TEMP_MIN_D1_C: weather ? "historical_api" : "missing_imputed",
      UMIDADE_D1_PCT: weather ? "historical_api" : "missing_imputed",
      VENTO_D1_MS: weather ? "historical_api" : "missing_imputed",
      ALTITUDE_ML_M: elevation ? "elevation_api" : "missing_imputed",
      HIST_ITEM_SAFE_N_TOTAL: "missing_imputed",
      HIST_ITEM_SAFE_TEM_ANT: "missing_imputed",
      HIST_ITEM_SAFE_DIAS_DESDE_ULT: "missing_imputed",
      HIST_ITEM_SAFE_N_90D: "missing_imputed",
      HIST_ITEM_SAFE_N_365D: "missing_imputed",
    },
    operationalRules: {
      operationType: entitySource,
      waterDistance: mappedWaterDistance ? "hydrography_api" : "synthetic_demo",
      terrain: mappedTerrain ? "postgres_context" : "synthetic_demo",
    },
    external: {
      location: location ? "geocoded" : "fallback_unavailable",
      weather: weather ? "historical_api" : "missing_imputed",
      altitude: elevation ? "elevation_api" : "missing_imputed",
      water: mappedWaterDistance ? "hydrography_api" : "synthetic_demo",
      terrain: mappedTerrain ? "postgres_context" : "synthetic_demo",
    },
  };
  return {
    input,
    context,
    provenance,
    hasIncompleteInputs: true,
    externalData: {
      location,
      weather,
      elevation: elevation ? { source: elevation.source, elevationM: elevation.elevationM } : null,
      water: waterData && mappedWaterDistance
        ? { source: waterData.source, nearestDistanceM: waterData.nearestDistanceM }
        : null,
    },
  };
}

export async function evaluateOperationRiskV2(
  context: OperationRiskRelationalContext,
  weights: RiskEngineV2Weights,
  services: OperationRiskExternalServices = defaultExternalServices,
): Promise<OperationRiskEvaluation> {
  const evaluation = await buildOperationRiskV2EvaluationInput(context, weights, services);
  const result = evaluateRiskEngineV2(evaluation.input);
  const { sampleProbabilityInternal: _internal, ...publicMl } = result.ml;
  return {
    ...evaluation,
    result: { ...result, ml: publicMl },
  };
}
