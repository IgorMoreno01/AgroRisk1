import { geocodeMunicipality } from "../adapters/location.server";
import { getHistoricalClimate } from "../adapters/climate.server";
import { getElevationForRisk } from "../adapters/terrain.server";
import { getWaterGeo } from "../adapters/water-geo.server";
import {
  mapNearestWaterDistance,
  mapValidatedTerrainContext,
  type GeocodedLocation,
  type OperationRiskInputProvenance,
  type OperationRiskRelationalContext,
  type RiskInputSource,
} from "./operation-input.server";
import { OPERATION_RISK_INPUT_VERSION, type PreparedOperationRiskInput } from "./prepared-input";
import type { MlRiskInput } from "../ml-risk/types";
import { createRiskExternalRuntime } from "./external-runtime.server";
import type {
  ElevationData,
  HistoricalWeatherFeatures,
  WaterGeoData,
} from "../external-data.types";

export interface OperationRiskExternalServices {
  geocode: (municipality: string, state: string) => Promise<{
    source: "open-meteo-geocoding";
    latitude: number;
    longitude: number;
    municipality: string;
    state: string;
  } | null>;
  historicalWeather: (
    lat: number,
    lon: number,
    referenceDate: string,
  ) => Promise<import("../external-data.types").HistoricalWeatherFeatures | null>;
  elevation: (
    lat: number,
    lon: number,
  ) => Promise<import("../external-data.types").ElevationData | null>;
  water: (
    lat: number,
    lon: number,
  ) => Promise<import("../external-data.types").WaterGeoData | null>;
}

export const defaultPreparationServices: OperationRiskExternalServices = {
  geocode: geocodeMunicipality,
  historicalWeather: getHistoricalClimate,
  elevation: getElevationForRisk,
  water: getWaterGeo,
};

const missingMlInput = (context: OperationRiskRelationalContext): MlRiskInput => ({
  DT_REFERENCIA: context.operation.scheduledAt.slice(0, 10),
  COD_MOD: null,
  UF: context.farm.state || null,
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

const inputSource = (context: OperationRiskRelationalContext): RiskInputSource =>
  context.source === "postgres" ? "postgres" : "synthetic_demo";

export interface OperationRiskExternalPayload {
  location: GeocodedLocation | null;
  weather: HistoricalWeatherFeatures | null;
  elevation: ElevationData | null;
  water: WaterGeoData | null;
  waterDistance: ReturnType<typeof mapNearestWaterDistance>;
}

/** Fetches only reusable provider data; no operation/area-specific rules are included. */
export async function prepareOperationRiskExternalPayload(
  context: OperationRiskRelationalContext,
  services: OperationRiskExternalServices = defaultPreparationServices,
): Promise<OperationRiskExternalPayload> {
  const referenceDate = context.operation.scheduledAt.slice(0, 10);
  const runtime = createRiskExternalRuntime(services, "background");
  const location = await runtime.geocode(context.farm.municipality, context.farm.state);
  const [weather, elevation, water] = location
    ? await Promise.all([
        runtime.historicalWeather(location.latitude, location.longitude, referenceDate),
        runtime.elevation(location.latitude, location.longitude),
        runtime.water(location.latitude, location.longitude),
      ])
    : [null, null, null];

  return {
    location,
    weather,
    elevation,
    water,
    waterDistance: water?.source === "overpass" && water.nearestDistanceM !== null
      ? mapNearestWaterDistance(water.nearestDistanceM)
      : null,
  };
}

export function buildPreparedOperationRiskInput(
  context: OperationRiskRelationalContext,
  payload: OperationRiskExternalPayload,
): PreparedOperationRiskInput {
  const mlInput = missingMlInput(context);
  const referenceDate = mlInput.DT_REFERENCIA;
  const { location, weather, elevation, waterDistance } = payload;
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
  const terrain = context.source === "postgres"
    ? mapValidatedTerrainContext(context.terrainContext)
    : null;
  const source = inputSource(context);
  const climateSource = weather ? "historical_api" : "missing_imputed";
  const provenance: OperationRiskInputProvenance = {
    ml: {
      DT_REFERENCIA: "derived",
      COD_MOD: "missing_imputed",
      UF: source,
      PRECIPITACAO_D1_MM: climateSource,
      CHUVA_7D_MM: climateSource,
      CHUVA_30D_MM: climateSource,
      TEMP_MEDIA_D1_C: climateSource,
      TEMP_MAX_D1_C: climateSource,
      TEMP_MIN_D1_C: climateSource,
      UMIDADE_D1_PCT: climateSource,
      VENTO_D1_MS: climateSource,
      ALTITUDE_ML_M: elevation ? "elevation_api" : "missing_imputed",
      HIST_ITEM_SAFE_N_TOTAL: "missing_imputed",
      HIST_ITEM_SAFE_TEM_ANT: "missing_imputed",
      HIST_ITEM_SAFE_DIAS_DESDE_ULT: "missing_imputed",
      HIST_ITEM_SAFE_N_90D: "missing_imputed",
      HIST_ITEM_SAFE_N_365D: "missing_imputed",
    },
    operationalRules: {
      operationType: source,
      waterDistance: waterDistance ? "hydrography_api" : "synthetic_demo",
      terrain: terrain ? "postgres_context" : "synthetic_demo",
    },
    external: {
      location: location ? "geocoded" : "fallback_unavailable",
      weather: weather ? "historical_api" : "missing_imputed",
      altitude: elevation ? "elevation_api" : "missing_imputed",
      water: waterDistance ? "hydrography_api" : "synthetic_demo",
      terrain: terrain ? "postgres_context" : "synthetic_demo",
    },
    snapshot: { status: "valid" },
  };
  const now = new Date().toISOString();
  return {
    operationId: context.operation.id,
    referenceDate,
    mlInput,
    operationalRulesInput: {
      operationType: context.operation.type as PreparedOperationRiskInput["operationalRulesInput"]["operationType"],
      waterDistance: waterDistance ?? "acima_150",
      terrain: terrain ?? "normal",
    },
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    provenance: provenance as unknown as PreparedOperationRiskInput["provenance"],
    generatedAt: now,
    updatedAt: now,
    version: OPERATION_RISK_INPUT_VERSION,
  };
}

export async function prepareOperationRiskInputSnapshot(
  context: OperationRiskRelationalContext,
  services: OperationRiskExternalServices = defaultPreparationServices,
): Promise<PreparedOperationRiskInput> {
  const payload = await prepareOperationRiskExternalPayload(context, services);
  return buildPreparedOperationRiskInput(context, payload);
}

export type PreparationCoverage = {
  climateReal: boolean;
  altitudeReal: boolean;
  waterReal: boolean;
  terrainValidated: boolean;
  missingFields: number;
  syntheticFields: number;
};

export function summarizePreparationCoverage(
  snapshot: PreparedOperationRiskInput,
): PreparationCoverage {
  const provenance = snapshot.provenance as Partial<OperationRiskInputProvenance>;
  const sources = [
    ...Object.values(provenance.ml ?? {}),
    ...Object.values(provenance.operationalRules ?? {}),
    ...Object.values(provenance.external ?? {}),
  ];
  return {
    climateReal: provenance.external?.weather === "historical_api",
    altitudeReal: provenance.external?.altitude === "elevation_api",
    waterReal: provenance.external?.water === "hydrography_api",
    terrainValidated:
      provenance.external?.terrain === "postgres_context" ||
      provenance.external?.terrain === "derived_validated",
    missingFields: sources.filter((value) => value === "missing_imputed").length,
    syntheticFields: sources.filter((value) => value === "synthetic_demo").length,
  };
}
