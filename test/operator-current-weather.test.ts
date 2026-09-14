import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getCurrentClimate } from "../src/lib/adapters/climate.server";
import { requestOperatorCurrentWeather } from "../src/components/operator-current-weather";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("condições atuais do Operador", () => {
  test("componente exibe os três valores atuais e trata loading e falha localmente", () => {
    const component = readFileSync("src/components/operator-current-weather.tsx", "utf8");
    expect(component).toContain("Temperatura atual");
    expect(component).toContain("Precipitação atual");
    expect(component).toContain("Vento atual");
    expect(component).toContain('"Carregando..."');
    expect(component).toContain('"Indisponível"');
    expect(component).not.toContain("evaluationContext");
    expect(component).not.toContain("prepared");
  });

  test("requests atuais equivalentes são deduplicadas e retornam valores do provider", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      await Bun.sleep(10);
      return new Response(JSON.stringify({
        current: {
          temperature_2m: 24.6,
          relative_humidity_2m: 60,
          precipitation: 1.2,
          wind_speed_10m: 13.4,
          wind_direction_10m: 90,
          weather_code: 2,
        },
        hourly: {
          time: [],
          temperature_2m: [],
          precipitation_probability: [],
          wind_speed_10m: [],
        },
      }), { status: 200 });
    }) as typeof fetch;

    const [first, second] = await Promise.all([
      getCurrentClimate(-10.1234, -45.9876),
      getCurrentClimate(-10.1234, -45.9876),
    ]);
    expect(requests).toBe(1);
    expect(first.current).toMatchObject({
      temperature: 24.6,
      precipitation: 1.2,
      windSpeed: 13.4,
    });
    expect(second).toEqual(first);
  });

  test("falha do provider é propagada sem fallback mock", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    await expect(getCurrentClimate(-11.2233, -46.7788)).rejects.toThrow("offline");
  });

  test("effect remontado compartilha a mesma Promise em andamento", async () => {
    let requests = 0;
    const request = async () => {
      requests += 1;
      await Bun.sleep(10);
      return {
        source: "open-meteo" as const,
        lat: -10,
        lon: -45,
        fetchedAt: new Date().toISOString(),
        current: {
          temperature: 25,
          humidity: 60,
          precipitation: 0,
          windSpeed: 10,
          windDirection: 90,
          windDirectionLabel: "L",
          condition: "clear" as const,
          conditionLabel: "Céu limpo",
          weatherCode: 0,
        },
        hourlyForecast: [],
      };
    };
    const [first, remounted] = await Promise.all([
      requestOperatorCurrentWeather("remount:go", request),
      requestOperatorCurrentWeather("remount:go", request),
    ]);
    expect(requests).toBe(1);
    expect(remounted).toEqual(first);
  });

  test("timeout agregado é finito", async () => {
    await expect(requestOperatorCurrentWeather(
      "timeout:go",
      () => new Promise(() => undefined),
      10,
    )).rejects.toThrow("Tempo limite do clima excedido.");
  });
});