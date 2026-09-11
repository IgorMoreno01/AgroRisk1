import type { Area, Client, Machine, Operation } from "../mock-data";
import type { MlRiskInput } from "../ml-risk/types";
import { geocodeMunicipality, type GeocodedLocation } from "../adapters/location.server";
import { getHistoricalClimate } from "../adapters/climate.server";
import { getElevationForRisk } from "../adapters/terrain.server";
import type { ElevationData, HistoricalWeatherFeatures } from "../external-data.types";
import { evaluateRiskEngineV2, type RiskEngineV2EvaluationInput } from "./evaluate";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./types";

export type RiskInputSource =
  | "postgres"
  | "derived"
  | "missing_imputed"
  | "synthetic_demo"
  | "geocoded"
  | "historical_api"
  | "elevation_api"
  | "fallback_unavailable";

export interface OperationRiskFarm {
  id: string;
  name: string;
  municipality: string;
  state: string;
}

export interface OperationRiskRelationalContext {
  source: "postgres" | "mock";
  operation: Operation;
  machine: Machine;
  area: Area;
  farm: OperationRiskFarm;
  client: Client;
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
}

const defaultExternalServices: OperationRiskExternalServices = {
  geocode: geocodeMunicipality,
  historicalWeather: getHistoricalClimate,
  elevation: getElevationForRisk,
};

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
  const [weather, elevation] = location
    ? await Promise.all([
        services.historicalWeather(location.latitude, location.longitude, referenceDate),
        services.elevation(location.latitude, location.longitude),
      ])
    : [null, null];
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
      operationType: context.operation.type,
      // Temporários e neutros: não são derivados de score, near_water ou declividade.
      waterDistance: "acima_150",
      terrain: "normal",
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
      waterDistance: "synthetic_demo",
      terrain: "synthetic_demo",
    },
    external: {
      location: location ? "geocoded" : "fallback_unavailable",
      weather: weather ? "historical_api" : "missing_imputed",
      altitude: elevation ? "elevation_api" : "missing_imputed",
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
