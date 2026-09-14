import { describe, expect, test } from "bun:test";
import {
  buildOperationRiskV2EvaluationInput,
  evaluateOperationRiskV2,
  mapNearestWaterDistance,
  mapValidatedTerrainContext,
  validateOperationType,
  type OperationRiskExternalServices,
  type OperationRiskRelationalContext,
} from "../src/lib/risk-engine-v2/operation-input.server";
import { buildAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";

const context: OperationRiskRelationalContext = {
  source: "postgres",
  client: {
    id: "CL-REAL", name: "Cliente Real", city: "Cidade Cliente", state: "MT",
    location: "Cidade Cliente / MT", mainOperation: "Agrícola", machineCount: 1,
    machines: 1, avgScore: 99, level: "alto",
  },
  farm: { id: "FA-REAL", name: "Fazenda Real", municipality: "Sorriso", state: "GO" },
  area: {
    id: "AR-REAL", name: "Talhão 1", clientId: "CL-REAL", client: "Cliente Real",
    type: "Campo aberto", condition: "", nearWater: "baixa", envRisk: "baixo",
    score: 95, crop: "Soja", hectares: 100,
  },
  machine: {
    id: "MQ-REAL", code: "M-1", name: "Máquina 1", model: "Modelo X", type: "Trator",
    clientId: "CL-REAL", client: "Cliente Real", areaId: "AR-REAL", area: "Talhão 1",
    operatorId: "OPR-REAL", operator: "Operador", status: "ativa", score: 95,
    level: "alto", lastAlert: "", lastUpdate: "",
  },
  operation: {
    id: "OP-REAL", machineId: "MQ-REAL", machine: "MQ-REAL", operatorId: "OPR-REAL",
    clientId: "CL-REAL", areaId: "AR-REAL", area: "Talhão 1", type: "Colheita",
    scheduledAt: "2026-09-10T13:45:00.000Z", start: "13:45", duration: "2h",
    status: "Em andamento", score: 99, factors: [], recommendationId: "",
  },
};

const availableServices: OperationRiskExternalServices = {
  geocode: async () => ({
    source: "open-meteo-geocoding",
    latitude: -15.6,
    longitude: -47.7,
    municipality: "Sorriso",
    state: "Goiás",
  }),
  historicalWeather: async (_lat, _lon, referenceDate) => ({
    source: "open-meteo-historical",
    referenceDate,
    precipitationD1Mm: 2,
    rain7dMm: 14,
    rain30dMm: 60,
    temperatureMeanD1C: 24,
    temperatureMaxD1C: 31,
    temperatureMinD1C: 18,
    humidityMeanD1Pct: 71,
    windMeanD1Ms: 4,
  }),
  elevation: async () => ({
    source: "opentopography",
    lat: -15.6,
    lon: -47.7,
    fetchedAt: "2026-09-11T00:00:00.000Z",
    elevationM: 812,
    slopePercent: null,
    slopeClass: "flat",
    slopeLabel: "Plano",
    nearbyPoints: [],
  }),
  water: async () => ({
    source: "overpass",
    lat: -15.6,
    lon: -47.7,
    radiusM: 5_000,
    fetchedAt: "2026-09-11T00:00:00.000Z",
    features: [],
    nearestDistanceM: 125,
    nearestName: "Rio real",
  }),
};

describe("mapper central operação PostgreSQL → Risk Engine V2", () => {
  test.each([
    [151, "acima_150"],
    [150, "100_150"],
    [100, "100_150"],
    [99.99, "50_100"],
    [50, "50_100"],
    [49.99, "abaixo_50"],
  ] as const)("mapeia %p metros para %s", (distance, expected) => {
    expect(mapNearestWaterDistance(distance)).toBe(expected);
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "não classifica distância hidrográfica inválida: %p",
    (distance) => {
      expect(mapNearestWaterDistance(distance)).toBeNull();
    },
  );

  test("usa data, UF da fazenda e tipo da operação", async () => {
    const mapped = await buildOperationRiskV2EvaluationInput(
      context, { ml: 70, operationalRules: 30 }, availableServices,
    );
    expect(mapped.input.mlInput.DT_REFERENCIA).toBe("2026-09-10");
    expect(mapped.input.mlInput.UF).toBe("GO");
    expect(mapped.input.operationalRulesInput.operationType).toBe("Colheita");
  });

  test("preserva features não integradas como null para a imputação oficial", async () => {
    const mapped = await buildOperationRiskV2EvaluationInput(
      context, { ml: 70, operationalRules: 30 }, availableServices,
    );
    expect(mapped.input.mlInput.COD_MOD).toBeNull();
    expect(mapped.input.mlInput.PRECIPITACAO_D1_MM).toBe(2);
    expect(mapped.input.mlInput.ALTITUDE_ML_M).toBe(812);
    expect(mapped.input.mlInput.HIST_ITEM_SAFE_N_TOTAL).toBeNull();
    expect(mapped.provenance.ml.COD_MOD).toBe("missing_imputed");
    expect(mapped.provenance.external.location).toBe("geocoded");
    expect(mapped.provenance.external.weather).toBe("historical_api");
    expect(mapped.provenance.external.altitude).toBe("elevation_api");
  });

  test("usa água real e mantém terreno sem semântica como synthetic_demo", async () => {
    const first = await buildOperationRiskV2EvaluationInput(
      context, { ml: 70, operationalRules: 30 }, availableServices,
    );
    const second = await buildOperationRiskV2EvaluationInput(
      context, { ml: 70, operationalRules: 30 }, availableServices,
    );
    expect(first.input).toEqual(second.input);
    expect(first.input.operationalRulesInput.waterDistance).toBe("100_150");
    expect(first.provenance.operationalRules.waterDistance).toBe("hydrography_api");
    expect(first.provenance.operationalRules.terrain).toBe("synthetic_demo");
    expect(first.provenance.external.water).toBe("hydrography_api");
    expect(first.provenance.external.terrain).toBe("synthetic_demo");
  });

  test("falha ou mock hidrográfico não inventa distância real", async () => {
    const forWater = (water: OperationRiskExternalServices["water"]) => ({
      ...availableServices,
      water,
    });
    const rejected = await buildOperationRiskV2EvaluationInput(
      context, { ml: 70, operationalRules: 30 }, forWater(async () => {
        throw new Error("hydrography unavailable");
      }),
    );
    const mocked = await buildOperationRiskV2EvaluationInput(
      context, { ml: 70, operationalRules: 30 }, forWater(async () => ({
        source: "mock",
        lat: -15.6,
        lon: -47.7,
        radiusM: 5_000,
        fetchedAt: "2026-09-11T00:00:00Z",
        features: [],
        nearestDistanceM: 25,
        nearestName: "Córrego simulado",
      })),
    );
    for (const mapped of [rejected, mocked]) {
      expect(mapped.input.operationalRulesInput.waterDistance).toBe("acima_150");
      expect(mapped.provenance.operationalRules.waterDistance).toBe("synthetic_demo");
      expect(mapped.provenance.external.water).toBe("synthetic_demo");
      expect(mapped.externalData.water).toBeNull();
    }
  });

  test("terreno só é convertido com contexto operacional explicitamente validado", () => {
    expect(mapValidatedTerrainContext({
      dataNature: "validated_operational_terrain",
      classification: "baixa_aderencia",
    })).toBe("baixa_aderencia");
    expect(mapValidatedTerrainContext({
      dataNature: "synthetic_operational_area",
      classification: "not_provided",
      altitudeM: 900,
      slopePercent: 30,
    })).toBeNull();
    expect(mapValidatedTerrainContext({
      altitudeM: 900,
      slopePercent: 30,
    })).toBeNull();
  });

  test("aplica terrain_context somente quando a classificação persistida é validada", async () => {
    const mapped = await buildOperationRiskV2EvaluationInput(
      {
        ...context,
        terrainContext: {
          dataNature: "validated_operational_terrain",
          classification: "critico",
        },
      },
      { ml: 70, operationalRules: 30 },
      availableServices,
    );
    expect(mapped.input.operationalRulesInput.terrain).toBe("critico");
    expect(mapped.provenance.operationalRules.terrain).toBe("postgres_context");
    expect(mapped.provenance.external.terrain).toBe("postgres_context");

    const mockMapped = await buildOperationRiskV2EvaluationInput(
      {
        ...context,
        source: "mock",
        terrainContext: {
          dataNature: "validated_operational_terrain",
          classification: "critico",
        },
      },
      { ml: 70, operationalRules: 30 },
      availableServices,
    );
    expect(mockMapped.input.operationalRulesInput.terrain).toBe("normal");
    expect(mockMapped.provenance.operationalRules.terrain).toBe("synthetic_demo");
  });

  test("operationType é validado no domínio aceito sem criar score manual", () => {
    expect(validateOperationType("Colheita")).toBe("Colheita");
    expect(() => validateOperationType("Tipo desconhecido")).toThrow(
      "Tipo de operação inválido",
    );
  });

  test("nível vem do motor e pesos Sompo continuam aplicados", async () => {
    const evaluation = await evaluateOperationRiskV2(
      context, { ml: 40, operationalRules: 60 }, availableServices,
    );
    expect(evaluation.result.weights).toEqual({ ml: 40, operationalRules: 60 });
    expect(evaluation.result.level).toMatch(/^(baixo|medio|alto)$/);
    expect(evaluation.input).not.toHaveProperty("level");
    expect(evaluation.result.finalScore).not.toBe(context.operation.score);
    expect(JSON.stringify(evaluation)).not.toContain("sampleProbabilityInternal");
  });

  test("carteira mista omite máquina sem operação sem degradar as avaliações válidas", async () => {
    const orphan = {
      ...context.machine,
      id: "MQ-SEM-OPERACAO",
      code: "M-2",
    };
    const snapshot = await buildAdminDashboardSnapshot({
      clients: [context.client],
      areas: [context.area],
      machines: [context.machine, orphan],
      operations: [context.operation],
      alerts: [],
      riskContexts: [context],
    }, "postgres", false, { ml: 70, operationalRules: 30 }, undefined, availableServices);
    expect(snapshot.machineRows.map((row) => row.machine.id)).toEqual(["MQ-REAL"]);
    expect(snapshot.areaRows).toHaveLength(1);
    expect(snapshot.clientRows).toHaveLength(1);
    expect(snapshot.degraded).toBeFalse();
  });

  test("falhas externas mantêm clima e altitude missing_imputed", async () => {
    const unavailable: OperationRiskExternalServices = {
      geocode: availableServices.geocode,
      historicalWeather: async () => null,
      elevation: async () => null,
      water: async () => null,
    };
    const mapped = await buildOperationRiskV2EvaluationInput(
      context, { ml: 70, operationalRules: 30 }, unavailable,
    );
    expect(mapped.input.mlInput.PRECIPITACAO_D1_MM).toBeNull();
    expect(mapped.input.mlInput.ALTITUDE_ML_M).toBeNull();
    expect(mapped.provenance.external.weather).toBe("missing_imputed");
    expect(mapped.provenance.external.altitude).toBe("missing_imputed");
  });
});