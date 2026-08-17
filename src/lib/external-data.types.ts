// ============================================================
// AgroRisk · Tipos internos normalizados para APIs externas
// Os adapters sempre retornam esses tipos — nunca os shapes brutos das APIs.
// ============================================================

// ---------- Clima (Open-Meteo) ----------
export type WeatherCondition =
  | "clear"
  | "partly_cloudy"
  | "overcast"
  | "drizzle"
  | "rain_light"
  | "rain_moderate"
  | "rain_heavy"
  | "thunderstorm"
  | "fog"
  | "snow"
  | "unknown";

export interface HourlyForecast {
  hour: number; // 0–23
  temperature: number; // °C
  precipitationProbability: number; // 0–100 %
  windSpeed: number; // km/h
}

export interface WeatherData {
  source: "open-meteo" | "mock";
  lat: number;
  lon: number;
  fetchedAt: string; // ISO 8601
  current: {
    temperature: number; // °C
    humidity: number; // %
    precipitation: number; // mm/h
    windSpeed: number; // km/h
    windDirection: number; // graus (0–360)
    windDirectionLabel: string; // "N", "NE", "L", etc.
    condition: WeatherCondition;
    conditionLabel: string; // Português
    weatherCode: number; // WMO code
  };
  hourlyForecast: HourlyForecast[]; // próximas 6h
}

// ---------- Hidrografia (Overpass / OpenStreetMap) ----------
export type WaterFeatureType =
  | "river"
  | "stream"
  | "lake"
  | "reservoir"
  | "dam"
  | "canal"
  | "wetland"
  | "other";

export interface WaterFeature {
  id: number;
  type: WaterFeatureType;
  typeLabel: string; // Português
  name: string;
  distanceM: number; // distância aproximada ao ponto consultado (metros)
  lat?: number;
  lon?: number;
}

export interface WaterGeoData {
  source: "overpass" | "mock";
  lat: number;
  lon: number;
  radiusM: number;
  fetchedAt: string;
  features: WaterFeature[];
  nearestDistanceM: number | null; // null se não houver feições
  nearestName: string | null;
}

// ---------- Rotas (openrouteservice) ----------
export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS: number;
}

export interface Route {
  distanceM: number;
  durationS: number;
  durationLabel: string; // "2h 15min"
  distanceLabel: string; // "14,3 km"
  steps: RouteStep[];
}

export interface RouteData {
  source: "openrouteservice" | "mock";
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  fetchedAt: string;
  primary: Route;
  alternative: Route | null;
}

// ---------- Terreno / Elevação (OpenTopography) ----------
export interface SlopePoint {
  lat: number;
  lon: number;
  elevationM: number;
}

export type SlopeClass = "flat" | "gentle" | "moderate" | "steep" | "very_steep";

export interface ElevationData {
  source: "opentopography" | "open-elevation" | "mock";
  lat: number;
  lon: number;
  fetchedAt: string;
  elevationM: number;
  slopePercent: number | null; // null se não calculado
  slopeClass: SlopeClass;
  slopeLabel: string; // Português
  nearbyPoints: SlopePoint[];
}
