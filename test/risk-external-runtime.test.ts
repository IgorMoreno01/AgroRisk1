import { describe, expect, test } from "bun:test";
import {
  clearRiskExternalRuntimeCache,
  createRiskExternalRuntime,
  getRiskExternalCacheStats,
  purgeRiskExternalCache,
} from "../src/lib/risk-engine-v2/external-runtime.server";

const weather = {
  source: "open-meteo-historical" as const,
  referenceDate: "2026-09-10",
  precipitationD1Mm: 1,
  rain7dMm: 2,
  rain30dMm: 3,
  temperatureMeanD1C: 24,
  temperatureMaxD1C: 30,
  temperatureMinD1C: 18,
  humidityMeanD1Pct: 70,
  windMeanD1Ms: 3,
};

function services(overrides: Partial<{
  weather: () => Promise<typeof weather>;
  water: (lat: number) => Promise<null>;
}> = {}) {
  return {
    geocode: async () => null,
    historicalWeather: overrides.weather ?? (async () => weather),
    elevation: async () => null,
    water: overrides.water ?? (async (_lat: number) => null),
  };
}

const flush = async () => {
  for (let index = 0; index < 4; index++) await Promise.resolve();
};

describe("runtime externo compartilhado do Risk Engine V2", () => {
  test("deduplica coordenadas arredondadas e data entre operações", async () => {
    let calls = 0;
    const source = services({
      weather: async () => {
        calls++;
        return weather;
      },
    });
    const first = createRiskExternalRuntime(source);
    const second = createRiskExternalRuntime(source);
    const results = await Promise.all([
      first.historicalWeather(-15.6000001, -47.7000001, "2026-09-10"),
      second.historicalWeather(-15.6000002, -47.7000002, "2026-09-10"),
    ]);
    expect(calls).toBe(1);
    expect(results[0]).toEqual(results[1]);
  });

  test("não deduplica pontos distintos próximos na precisão de seis casas", async () => {
    let calls = 0;
    const runtime = createRiskExternalRuntime(services({
      water: async () => {
        calls++;
        return null;
      },
    }));
    await Promise.all([
      runtime.water(-15.600100, -47.700100),
      runtime.water(-15.600200, -47.700200),
    ]);
    expect(calls).toBe(2);
  });

  test("faz cache negativo curto sem propagar indisponibilidade", async () => {
    let calls = 0;
    const runtime = createRiskExternalRuntime(services({
      water: async () => {
        calls++;
        throw new Error("timeout");
      },
    }));
    expect(await runtime.water(-15.6, -47.7)).toBeNull();
    expect(await runtime.water(-15.6, -47.7)).toBeNull();
    expect(calls).toBe(1);
  });

  test("propaga erro inesperado em vez de convertê-lo em null", async () => {
    const runtime = createRiskExternalRuntime(services({
      water: async () => {
        throw new Error("payload inválido");
      },
    }));
    await expect(runtime.water(-15.61, -47.71)).rejects.toThrow("payload inválido");
  });

  test("limita cache global e remove entradas expiradas", async () => {
    clearRiskExternalRuntimeCache();
    const runtime = createRiskExternalRuntime(services({
      weather: async () => weather,
    }));
    for (let index = 0; index < 2_005; index++) {
      await runtime.historicalWeather(-10 - index / 1_000, -40, "2026-09-10");
    }
    expect(getRiskExternalCacheStats().size).toBeLessThanOrEqual(2_000);
    purgeRiskExternalCache(Date.now() + 11 * 60_000);
    expect(getRiskExternalCacheStats().size).toBe(0);
  });

  test("mantém weather, elevation e water em paralelo após geocode", async () => {
    const started = new Set<string>();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runtime = createRiskExternalRuntime({
      geocode: async () => null,
      historicalWeather: async () => { started.add("weather"); await gate; return weather; },
      elevation: async () => { started.add("elevation"); await gate; return null; },
      water: async () => { started.add("water"); await gate; return null; },
    });
    const pending = Promise.all([
      runtime.historicalWeather(-15.6, -47.7, "2026-09-10"),
      runtime.elevation(-15.6, -47.7),
      runtime.water(-15.6, -47.7),
    ]);
    await flush();
    expect(started).toEqual(new Set(["weather", "elevation", "water"]));
    release();
    await pending;
  });

  test("prioriza limit=1 antes do segundo trabalho background", async () => {
    const started: number[] = [];
    let invocation = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const source = services({
      water: async (lat) => {
        invocation++;
        started.push(Math.round(Math.abs(lat) * 1000));
        await gate;
        return null;
      },
    });
    const background = createRiskExternalRuntime(source, "background");
    const interactive = createRiskExternalRuntime(source, "interactive");
    const first = background.water(-15.601, -47.7);
    const second = background.water(-15.602, -47.7);
    const priority = interactive.water(-15.603, -47.7);
    await flush();
    expect(started).toEqual([15601, 15603]);
    release();
    await Promise.all([first, second, priority]);
  });

  test("promove a mesma chave background enfileirada para interactive", async () => {
    const started: number[] = [];
    let releaseBlocker!: () => void;
    const blockerGate = new Promise<void>((resolve) => { releaseBlocker = resolve; });
    const source = services({
      water: async (lat) => {
        const point = Math.round(Math.abs(lat) * 1000);
        started.push(point);
        if (point === 15701) await blockerGate;
        return null;
      },
    });
    const background = createRiskExternalRuntime(source, "background");
    const interactive = createRiskExternalRuntime(source, "interactive");
    const blocker = background.water(-15.701, -47.701);
    const queued = background.water(-15.702, -47.702);
    await flush();
    expect(started).toEqual([15701]);
    const promoted = interactive.water(-15.702, -47.702);
    await flush();
    expect(started).toEqual([15701, 15702]);
    releaseBlocker();
    await Promise.all([blocker, queued, promoted]);
    expect(started).toEqual([15701, 15702]);
  });

  test("libera background após no máximo três despachos interactive", async () => {
    const started: number[] = [];
    const interactiveReleases: Array<() => void> = [];
    let releaseBlocker!: () => void;
    let releaseRefresh!: () => void;
    const blockerGate = new Promise<void>((resolve) => { releaseBlocker = resolve; });
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const source = services({
      water: async (lat) => {
        const point = Math.round(Math.abs(lat) * 1000);
        started.push(point);
        if (point === 15800) {
          await blockerGate;
        } else if (point === 15801) {
          await refreshGate;
        } else if (point >= 15811) {
          await new Promise<void>((resolve) => interactiveReleases.push(resolve));
        }
        return null;
      },
    });
    const background = createRiskExternalRuntime(source, "background");
    const interactive = createRiskExternalRuntime(source, "interactive");
    const blocker = background.water(-15.800, -47.800);
    const refresh = background.water(-15.801, -47.801);
    const first = interactive.water(-15.811, -47.811);
    const second = interactive.water(-15.812, -47.812);
    const third = interactive.water(-15.813, -47.813);
    const fourth = interactive.water(-15.814, -47.814);
    await flush();
    expect(started).toEqual([15800, 15811]);
    interactiveReleases.shift()!();
    await flush();
    interactiveReleases.shift()!();
    await flush();
    interactiveReleases.shift()!();
    await flush();
    expect(started).toEqual([15800, 15811, 15812, 15813, 15801]);
    releaseBlocker();
    releaseRefresh();
    await flush();
    interactiveReleases.shift()!();
    await Promise.all([blocker, refresh, first, second, third, fourth]);
  });
});