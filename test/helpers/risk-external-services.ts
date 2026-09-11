import type { OperationRiskExternalServices } from "../../src/lib/risk-engine-v2/operation-input.server";

export const testRiskExternalServices: OperationRiskExternalServices = {
  geocode: async (municipality, state) => ({
    source: "open-meteo-geocoding",
    latitude: -15,
    longitude: -50,
    municipality,
    state,
  }),
  historicalWeather: async (_lat, _lon, referenceDate) => ({
    source: "open-meteo-historical",
    referenceDate,
    precipitationD1Mm: 1,
    rain7dMm: 7,
    rain30dMm: 30,
    temperatureMeanD1C: 24,
    temperatureMaxD1C: 31,
    temperatureMinD1C: 18,
    humidityMeanD1Pct: 70,
    windMeanD1Ms: 5,
  }),
  elevation: async (lat, lon) => ({
    source: "open-elevation",
    lat,
    lon,
    fetchedAt: "2026-09-11T00:00:00Z",
    elevationM: 600,
    slopePercent: null,
    slopeClass: "flat",
    slopeLabel: "Plano",
    nearbyPoints: [],
  }),
};