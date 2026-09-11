import { describe, expect, test } from "bun:test";
import {
  deriveHistoricalWeatherFeatures,
  type OpenMeteoHistoricalResponse,
} from "../src/lib/adapters/climate.server";

const iso = (day: number) => `2026-08-${String(day).padStart(2, "0")}`;

function payload(): OpenMeteoHistoricalResponse {
  const days = Array.from({ length: 30 }, (_, index) => iso(index + 1));
  return {
    daily: {
      time: days,
      precipitation_sum: days.map((_, index) => index + 1),
      temperature_2m_mean: days.map((_, index) => 20 + index / 10),
      temperature_2m_max: days.map((_, index) => 30 + index / 10),
      temperature_2m_min: days.map((_, index) => 10 + index / 10),
    },
    hourly: {
      time: days.flatMap((date) =>
        Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, "0")}:00`),
      ),
      relative_humidity_2m: days.flatMap((_, index) =>
        Array.from({ length: 24 }, () => 61 + index),
      ),
      wind_speed_10m: days.flatMap(() => Array.from({ length: 24 }, () => 18)),
    },
  };
}

describe("ClimateAdapter histórico sem leakage", () => {
  test("D usa somente D-1 e acumula exatamente 7D/30D anteriores", () => {
    const result = deriveHistoricalWeatherFeatures(payload(), "2026-08-31")!;
    expect(result.precipitationD1Mm).toBe(30);
    expect(result.rain7dMm).toBe(24 + 25 + 26 + 27 + 28 + 29 + 30);
    expect(result.rain30dMm).toBe(465);
    expect(result.temperatureMeanD1C).toBe(22.9);
    expect(result.temperatureMaxD1C).toBe(32.9);
    expect(result.temperatureMinD1C).toBe(12.9);
    expect(result.humidityMeanD1Pct).toBe(90);
    expect(result.windMeanD1Ms).toBe(5);
  });

  test("ignora qualquer observação posterior ou igual à referência", () => {
    const data = payload();
    data.daily.time.push("2026-08-31", "2026-09-01");
    data.daily.precipitation_sum.push(9999, 9999);
    data.daily.temperature_2m_mean.push(9999, 9999);
    data.daily.temperature_2m_max.push(9999, 9999);
    data.daily.temperature_2m_min.push(9999, 9999);
    const result = deriveHistoricalWeatherFeatures(data, "2026-08-31")!;
    expect(result.rain7dMm).toBe(189);
    expect(result.rain30dMm).toBe(465);
  });

  test("histórico diário incompleto não produz acumulado parcial", () => {
    const data = payload();
    const missingIndex = data.daily.time.indexOf("2026-08-27");
    for (const values of [
      data.daily.time,
      data.daily.precipitation_sum,
      data.daily.temperature_2m_mean,
      data.daily.temperature_2m_max,
      data.daily.temperature_2m_min,
    ]) values.splice(missingIndex, 1);
    expect(deriveHistoricalWeatherFeatures(data, "2026-08-31")).toBeNull();
  });

  test("histórico horário incompleto não produz média parcial", () => {
    const data = payload();
    const missingIndex = data.hourly.time.indexOf("2026-08-30T12:00");
    data.hourly.time.splice(missingIndex, 1);
    data.hourly.relative_humidity_2m.splice(missingIndex, 1);
    data.hourly.wind_speed_10m.splice(missingIndex, 1);
    expect(deriveHistoricalWeatherFeatures(data, "2026-08-31")).toBeNull();
  });
});