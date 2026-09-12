// ============================================================
// AgroRisk · ClimateAdapter — Open-Meteo (sem chave de API)
// https://open-meteo.com/en/docs
// ============================================================

import { cacheGet, cacheOrFetch, cacheSet } from "../cache.server";
import type {
  HistoricalWeatherFeatures,
  WeatherData,
  WeatherCondition,
  HourlyForecast,
} from "../external-data.types";

const BASE_URL = "https://api.open-meteo.com/v1/forecast";
const HISTORICAL_URL = "https://archive-api.open-meteo.com/v1/archive";
const TIMEOUT_MS = 8_000;
const CACHE_TTL_S = 10 * 60; // 10 minutos
const historicalInFlight = new Map<string, Promise<OpenMeteoHistoricalResponse | null>>();
const currentInFlight = new Map<string, Promise<WeatherData>>();

// WMO weather codes → condição interna
function wmoToCondition(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code <= 3) return "partly_cloudy";
  if (code <= 9) return "overcast";
  if (code <= 19) return "fog";
  if (code <= 29) return "drizzle";
  if (code <= 39) return "fog";
  if (code <= 49) return "fog";
  if (code <= 59) return "drizzle";
  if (code <= 67) return code <= 63 ? "rain_light" : "rain_moderate";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain_light";
  if (code <= 84) return "rain_moderate";
  if (code <= 86) return "rain_heavy";
  if (code <= 99) return "thunderstorm";
  return "unknown";
}

const CONDITION_LABELS: Record<WeatherCondition, string> = {
  clear: "Céu limpo",
  partly_cloudy: "Parcialmente nublado",
  overcast: "Nublado",
  drizzle: "Chuvisco",
  rain_light: "Chuva leve",
  rain_moderate: "Chuva moderada",
  rain_heavy: "Chuva forte",
  thunderstorm: "Tempestade",
  fog: "Névoa",
  snow: "Neve",
  unknown: "Desconhecido",
};

function degreesToLabel(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "L", "ESE", "SE", "SSE",
                "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return dirs[Math.round(deg / 22.5) % 16];
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
  };
}

async function fetchFromOpenMeteo(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code",
    hourly: "temperature_2m,precipitation_probability,wind_speed_10m",
    forecast_days: "1",
    timezone: "auto",
    wind_speed_unit: "kmh",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = (await res.json()) as OpenMeteoResponse;

    const currentHour = new Date().getHours();
    const hourlyForecast: HourlyForecast[] = data.hourly.time
      .map((t, i) => ({
        hour: new Date(t).getHours(),
        temperature: data.hourly.temperature_2m[i],
        precipitationProbability: data.hourly.precipitation_probability[i] ?? 0,
        windSpeed: data.hourly.wind_speed_10m[i],
      }))
      .filter((h) => h.hour >= currentHour)
      .slice(0, 6);

    const c = data.current;
    const condition = wmoToCondition(c.weather_code);

    return {
      source: "open-meteo",
      lat,
      lon,
      fetchedAt: new Date().toISOString(),
      current: {
        temperature: c.temperature_2m,
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation,
        windSpeed: c.wind_speed_10m,
        windDirection: c.wind_direction_10m,
        windDirectionLabel: degreesToLabel(c.wind_direction_10m),
        condition,
        conditionLabel: CONDITION_LABELS[condition],
        weatherCode: c.weather_code,
      },
      hourlyForecast,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback mock para quando a API estiver indisponível */
function mockWeatherData(lat: number, lon: number): WeatherData {
  return {
    source: "mock",
    lat,
    lon,
    fetchedAt: new Date().toISOString(),
    current: {
      temperature: 26,
      humidity: 72,
      precipitation: 0,
      windSpeed: 14,
      windDirection: 45,
      windDirectionLabel: "NE",
      condition: "partly_cloudy",
      conditionLabel: "Parcialmente nublado",
      weatherCode: 2,
    },
    hourlyForecast: [],
  };
}

/**
 * Retorna dados climáticos normalizados para a coordenada.
 * Cache de 10 minutos. Fallback para mock em caso de erro.
 */
export async function getClimate(lat: number, lon: number): Promise<WeatherData> {
  const key = `climate:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  try {
    return await cacheOrFetch(key, CACHE_TTL_S, () => fetchFromOpenMeteo(lat, lon));
  } catch (err) {
    console.warn("[ClimateAdapter] fallback para mock:", (err as Error).message);
    return mockWeatherData(lat, lon);
  }
}

/**
 * Retorna somente clima atual real. Falhas são propagadas para que a interface
 * nunca apresente o fallback demonstrativo como condição observada.
 */
export async function getCurrentClimate(lat: number, lon: number): Promise<WeatherData> {
  const key = `climate-current-strict:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  const cached = cacheGet<WeatherData>(key);
  if (cached !== undefined) return cached;
  const pending = currentInFlight.get(key);
  if (pending) return pending;
  const request = fetchFromOpenMeteo(lat, lon).then((weather) => {
    cacheSet(key, weather, CACHE_TTL_S);
    return weather;
  });
  currentInFlight.set(key, request);
  try {
    return await request;
  } finally {
    currentInFlight.delete(key);
  }
}

export interface OpenMeteoHistoricalResponse {
  daily: {
    time: string[];
    precipitation_sum: Array<number | null>;
    temperature_2m_mean: Array<number | null>;
    temperature_2m_max: Array<number | null>;
    temperature_2m_min: Array<number | null>;
  };
  hourly: {
    time: string[];
    relative_humidity_2m: Array<number | null>;
    wind_speed_10m: Array<number | null>;
  };
}

function shiftIsoDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const sumFinite = (values: Array<number | null>): number | null => {
  if (values.some((value) => value === null || !Number.isFinite(value))) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
};

export function deriveHistoricalWeatherFeatures(
  payload: OpenMeteoHistoricalResponse,
  referenceDate: string,
): HistoricalWeatherFeatures | null {
  const d1 = shiftIsoDate(referenceDate, -1);
  const d1Index = payload.daily.time.indexOf(d1);
  if (d1Index < 0) return null;
  const expectedDates = (days: number) =>
    Array.from({ length: days }, (_, index) => shiftIsoDate(referenceDate, index - days));
  const precipitationFor = (days: number) =>
    expectedDates(days).map((date) => {
      const index = payload.daily.time.indexOf(date);
      return index < 0 ? null : payload.daily.precipitation_sum[index];
    });
  const rain7dMm = sumFinite(precipitationFor(7));
  const rain30dMm = sumFinite(precipitationFor(30));
  const expectedHours = new Set(
    Array.from({ length: 24 }, (_, hour) => `${d1}T${String(hour).padStart(2, "0")}:00`),
  );
  const d1HourlyIndexes = payload.hourly.time.flatMap((time, index) =>
    expectedHours.has(time) ? [index] : [],
  );
  if (d1HourlyIndexes.length !== 24) return null;
  const humidityD1 = d1HourlyIndexes.map((index) => payload.hourly.relative_humidity_2m[index]);
  const windD1Kmh = d1HourlyIndexes.map((index) => payload.hourly.wind_speed_10m[index]);
  const [precipitationD1Mm, temperatureMeanD1C, temperatureMaxD1C, temperatureMinD1C] = [
    payload.daily.precipitation_sum[d1Index],
    payload.daily.temperature_2m_mean[d1Index],
    payload.daily.temperature_2m_max[d1Index],
    payload.daily.temperature_2m_min[d1Index],
  ];
  if (
    rain7dMm === null || rain30dMm === null ||
    humidityD1.some((value) => value === null || !Number.isFinite(value)) ||
    windD1Kmh.some((value) => value === null || !Number.isFinite(value)) ||
    [precipitationD1Mm, temperatureMeanD1C, temperatureMaxD1C, temperatureMinD1C]
      .some((value) => value === null || !Number.isFinite(value))
  ) return null;
  return {
    source: "open-meteo-historical",
    referenceDate,
    precipitationD1Mm: precipitationD1Mm!,
    rain7dMm,
    rain30dMm,
    temperatureMeanD1C: temperatureMeanD1C!,
    temperatureMaxD1C: temperatureMaxD1C!,
    temperatureMinD1C: temperatureMinD1C!,
    humidityMeanD1Pct:
      humidityD1.reduce<number>((total, value) => total + (value ?? 0), 0) / humidityD1.length,
    windMeanD1Ms:
      (windD1Kmh.reduce<number>((total, value) => total + (value ?? 0), 0) / windD1Kmh.length) / 3.6,
  };
}

async function fetchHistoricalClimateSeries(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<OpenMeteoHistoricalResponse> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: startDate,
    end_date: endDate,
    daily:
      "precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min",
    hourly: "relative_humidity_2m,wind_speed_10m",
    timezone: "auto",
    wind_speed_unit: "kmh",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${HISTORICAL_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Open-Meteo Historical HTTP ${response.status}`);
    return (await response.json()) as OpenMeteoHistoricalResponse;
  } finally {
    clearTimeout(timer);
  }
}

export async function getHistoricalClimate(
  lat: number,
  lon: number,
  referenceDate: string,
): Promise<HistoricalWeatherFeatures | null> {
  const yesterday = shiftIsoDate(new Date().toISOString().slice(0, 10), -1);
  if (referenceDate > shiftIsoDate(yesterday, 1)) return null;
  const year = referenceDate.slice(0, 4);
  const startDate = shiftIsoDate(`${year}-01-01`, -30);
  const endDate = `${year}-12-31` < yesterday ? `${year}-12-31` : yesterday;
  const key = `climate-history-series:${lat.toFixed(3)}:${lon.toFixed(3)}:${year}`;
  const cached = cacheGet<OpenMeteoHistoricalResponse | null>(key);
  if (cached !== undefined) {
    return cached ? deriveHistoricalWeatherFeatures(cached, referenceDate) : null;
  }
  const pending = historicalInFlight.get(key);
  if (pending) {
    const series = await pending;
    return series ? deriveHistoricalWeatherFeatures(series, referenceDate) : null;
  }
  const request: Promise<OpenMeteoHistoricalResponse | null> = (async () => {
    try {
      const series = await fetchHistoricalClimateSeries(lat, lon, startDate, endDate);
      cacheSet(key, series, 24 * 60 * 60);
      return series;
    } catch (error) {
      console.warn("[ClimateAdapter] histórico indisponível:", (error as Error).message);
      cacheSet(key, null, 5 * 60);
      return null;
    }
  })();
  historicalInFlight.set(key, request);
  try {
    const series = await request;
    return series ? deriveHistoricalWeatherFeatures(series, referenceDate) : null;
  } finally {
    historicalInFlight.delete(key);
  }
}
