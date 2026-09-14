import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateOperationRiskV2,
  type OperationRiskExternalServices,
  type OperationRiskRelationalContext,
} from "../src/lib/risk-engine-v2/operation-input.server";
import {
  OPERATION_RISK_INPUT_VERSION,
  type PreparedOperationRiskInput,
} from "../src/lib/risk-engine-v2/prepared-input";
import { buildPreparedOperationRiskInput } from "../src/lib/risk-engine-v2/prepare-operation-input.server";

const context: OperationRiskRelationalContext = {
  source: "postgres",
  client: {
    id: "client-1", name: "Cliente", city: "Sorriso", state: "MT",
    location: "Sorriso / MT", mainOperation: "Soja", machineCount: 1,
    machines: 1, avgScore: 0, level: "baixo",
  },
  farm: { id: "farm-1", name: "Fazenda", municipality: "Sorriso", state: "MT" },
  area: {
    id: "area-1", name: "Talhão", clientId: "client-1", client: "Cliente",
    type: "Campo aberto", condition: "", nearWater: "baixa", envRisk: "baixo",
    score: 0, crop: "Soja", hectares: 10,
  },
  machine: {
    id: "machine-1", code: "M1", name: "Trator", model: "X", type: "Trator",
    clientId: "client-1", client: "Cliente", areaId: "area-1", area: "Talhão",
    operatorId: "operator-1", operator: "Operador", status: "ativa", score: 0,
    level: "baixo", lastAlert: "", lastUpdate: "",
  },
  operation: {
    id: "operation-1", machineId: "machine-1", machine: "machine-1",
    operatorId: "operator-1", clientId: "client-1", areaId: "area-1",
    area: "Talhão", type: "Colheita", scheduledAt: "2026-09-10T13:45:00.000Z",
    start: "13:45", duration: "2h", status: "Agendada", score: 0,
    factors: [], recommendationId: "",
  },
};

const missingServices: OperationRiskExternalServices = {
  geocode: async () => { throw new Error("must not be called"); },
  historicalWeather: async () => { throw new Error("must not be called"); },
  elevation: async () => { throw new Error("must not be called"); },
  water: async () => { throw new Error("must not be called"); },
};

const prepared: PreparedOperationRiskInput = {
  operationId: "operation-1",
  referenceDate: "2026-09-10",
  mlInput: {
    DT_REFERENCIA: "2026-09-10", COD_MOD: null, UF: "MT",
    PRECIPITACAO_D1_MM: 2, CHUVA_7D_MM: 14, CHUVA_30D_MM: 60,
    TEMP_MEDIA_D1_C: 24, TEMP_MAX_D1_C: 31, TEMP_MIN_D1_C: 18,
    UMIDADE_D1_PCT: 71, VENTO_D1_MS: 4, ALTITUDE_ML_M: 812,
    HIST_ITEM_SAFE_N_TOTAL: null, HIST_ITEM_SAFE_TEM_ANT: null,
    HIST_ITEM_SAFE_DIAS_DESDE_ULT: null, HIST_ITEM_SAFE_N_90D: null,
    HIST_ITEM_SAFE_N_365D: null,
  },
  operationalRulesInput: {
    operationType: "Colheita", waterDistance: "100_150", terrain: "normal",
  },
  latitude: -15.6, longitude: -55.7,
  provenance: {
    ml: {
      DT_REFERENCIA: "derived", COD_MOD: "missing_imputed", UF: "postgres",
      PRECIPITACAO_D1_MM: "historical_api", CHUVA_7D_MM: "historical_api",
      CHUVA_30D_MM: "historical_api", TEMP_MEDIA_D1_C: "historical_api",
      TEMP_MAX_D1_C: "historical_api", TEMP_MIN_D1_C: "historical_api",
      UMIDADE_D1_PCT: "historical_api", VENTO_D1_MS: "historical_api",
      ALTITUDE_ML_M: "elevation_api", HIST_ITEM_SAFE_N_TOTAL: "missing_imputed",
      HIST_ITEM_SAFE_TEM_ANT: "missing_imputed", HIST_ITEM_SAFE_DIAS_DESDE_ULT: "missing_imputed",
      HIST_ITEM_SAFE_N_90D: "missing_imputed", HIST_ITEM_SAFE_N_365D: "missing_imputed",
    },
    operationalRules: {
      operationType: "postgres", waterDistance: "hydrography_api", terrain: "synthetic_demo",
    },
    external: {
      location: "geocoded", weather: "historical_api", altitude: "elevation_api",
      water: "hydrography_api", terrain: "synthetic_demo",
    },
    snapshot: { status: "valid" },
  },
  generatedAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  version: OPERATION_RISK_INPUT_VERSION,
};

describe("runtime desacoplado dos inputs preparados", () => {
  test("não chama APIs quando calcula com snapshot ausente", async () => {
    const evaluation = await evaluateOperationRiskV2(
      context, { ml: 70, operationalRules: 30 }, missingServices,
    );
    expect(evaluation.provenance.external.weather).toBe("missing_imputed");
    expect(evaluation.input.operationalRulesInput.waterDistance).toBe("acima_150");
  });

  test("snapshot válido alimenta o motor e não persiste resultado", async () => {
    const evaluation = await evaluateOperationRiskV2(
      { ...context, preparedInput: prepared }, { ml: 70, operationalRules: 30 }, missingServices,
    );
    expect(evaluation.input.mlInput).toEqual(prepared.mlInput);
    expect(evaluation.input.operationalRulesInput).toEqual(prepared.operationalRulesInput);
    expect(prepared).not.toHaveProperty("finalScore");
    expect(prepared).not.toHaveProperty("level");
    expect(evaluation.result.finalScore).toBeGreaterThanOrEqual(0);
  });

  test("snapshot de outra data usa missing/fallback sem chamar APIs", async () => {
    const evaluation = await evaluateOperationRiskV2(
      {
        ...context,
        preparedInput: { ...prepared, referenceDate: "2026-09-09" },
      },
      { ml: 70, operationalRules: 30 },
      missingServices,
    );
    expect(evaluation.input.mlInput.PRECIPITACAO_D1_MM).toBeNull();
    expect(evaluation.input.operationalRulesInput.terrain).toBe("normal");
    expect(evaluation.provenance.external.location).toBe("fallback_unavailable");
    expect(evaluation.provenance.snapshot.status).toBe("reference_mismatch");
  });

  test("classifica snapshot com versão incompatível", async () => {
    const evaluation = await evaluateOperationRiskV2(
      { ...context, preparedInput: { ...prepared, version: "risk-input-v0" } },
      { ml: 70, operationalRules: 30 },
    );
    expect(evaluation.provenance.snapshot.status).toBe("version_mismatch");
  });

  test("classifica snapshot com input inválido", async () => {
    const evaluation = await evaluateOperationRiskV2(
      {
        ...context,
        preparedInput: {
          ...prepared,
          mlInput: { ...prepared.mlInput, TEMP_MAX_D1_C: "invalid" as never },
        },
      },
      { ml: 70, operationalRules: 30 },
    );
    expect(evaluation.provenance.snapshot.status).toBe("invalid_input");
  });

  test("classifica snapshot de outra operação como stale", async () => {
    const evaluation = await evaluateOperationRiskV2(
      { ...context, preparedInput: { ...prepared, operationId: "operation-old" } },
      { ml: 70, operationalRules: 30 },
    );
    expect(evaluation.provenance.snapshot.status).toBe("stale");
  });

  test("payload externo compartilhado não mistura terrain entre contextos", () => {
    const payload = {
      location: null,
      weather: null,
      elevation: null,
      water: null,
      waterDistance: null,
    };
    const critical = buildPreparedOperationRiskInput(
      {
        ...context,
        terrainContext: {
          dataNature: "validated_operational_terrain",
          classification: "critico",
        },
      },
      payload,
    );
    const normal = buildPreparedOperationRiskInput(context, payload);
    expect(critical.operationalRulesInput.terrain).toBe("critico");
    expect(normal.operationalRulesInput.terrain).toBe("normal");
    expect(critical.operationId).toBe(normal.operationId);
  });

  test("mesmo snapshot permite recalcular pesos sem regenerar inputs", async () => {
    const withPrepared = { ...context, preparedInput: prepared };
    const first = await evaluateOperationRiskV2(withPrepared, { ml: 70, operationalRules: 30 });
    const second = await evaluateOperationRiskV2(withPrepared, { ml: 40, operationalRules: 60 });
    expect(first.input.mlInput).toEqual(second.input.mlInput);
    expect(first.result.weights).toEqual({ ml: 70, operationalRules: 30 });
    expect(second.result.weights).toEqual({ ml: 40, operationalRules: 60 });
    expect(first.result.ml.mlRelativeScore).toBe(second.result.ml.mlRelativeScore);
    expect(first.result.operationalRules.operationalRulesScore)
      .toBe(second.result.operationalRules.operationalRulesScore);
    expect(first.result.finalScore).not.toBe(second.result.finalScore);
  });

  test("upsert SQL mantém contrato 10 colunas/10 valores e latitude/longitude", () => {
    const source = readFileSync(
      resolve("src/lib/data/postgres-repository.server.ts"),
      "utf8",
    );
    const statement = source.match(
      /INSERT INTO agrorisk\.operation_risk_input_snapshots \(([\s\S]*?)\)\s*VALUES \(([\s\S]*?)\)\s*ON CONFLICT/,
    );
    expect(statement).not.toBeNull();
    const columns = statement?.[1]?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    const values = statement?.[2]?.match(/\$\{/g) ?? [];
    expect(columns).toHaveLength(10);
    expect(values).toHaveLength(10);
    expect(columns).toContain("latitude");
    expect(columns).toContain("longitude");
    expect(statement?.[2]).toContain("snapshot.latitude");
    expect(statement?.[2]).toContain("snapshot.longitude");
  });
});