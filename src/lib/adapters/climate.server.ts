// ============================================================
// AgroRisk · ClimateAdapter — Open-Meteo (sem chave de API)
// https://open-meteo.com/en/docs
// ============================================================

import { cacheOrFetch } from "../cache.server";
import type { WeatherData, WeatherCondition, HourlyForecast } from "../external-data.types";

const BASE_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 8_000;
const CACHE_TTL_S = 10 * 60; // 10 minutos

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
