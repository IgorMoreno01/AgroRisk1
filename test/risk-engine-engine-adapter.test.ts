import { describe, expect, test } from "bun:test";
import {
  evaluateWithRiskEngineAdapter,
  type RiskEngineV1ComparableResult,
} from "../src/lib/risk-engine/engine-adapter.server";
import type { RiskEngineV2EvaluationInput } from "../src/lib/risk-engine-v2/evaluate";

interface V1TestInput {
  finalScore: number;
  level: string;
}

interface V1TestResult extends RiskEngineV1ComparableResult {
  marker: "v1";
}

const evaluateV1 = (input: V1TestInput): V1TestResult => ({
  ...input,
  marker: "v1",
});

const preparedV2Input = (): RiskEngineV2EvaluationInput => ({
  mlInput: {
    DT_REFERENCIA: "2020-07-27",
    COD_MOD: "50",
    UF: "SP",
    PRECIPITACAO_D1_MM: 0,
    CHUVA_7D_MM: 0,
    CHUVA_30D_MM: 0.6000000000000001,
    TEMP_MEDIA_D1_C: 19.933333333333334,
    TEMP_MAX_D1_C: 30.6,
    TEMP_MIN_D1_C: 11.1,
    UMIDADE_D1_PCT: 54.625,
    VENTO_D1_MS: 0.975,
    ALTITUDE_ML_M: 534.36,
    HIST_ITEM_SAFE_N_TOTAL: 0,
    HIST_ITEM_SAFE_TEM_ANT: 0,
    HIST_ITEM_SAFE_DIAS_DESDE_ULT: null,
    HIST_ITEM_SAFE_N_90D: 0,
    HIST_ITEM_SAFE_N_365D: 0,
  },
  operationalRulesInput: {
    waterDistance: "50_100",
    operationType: "Trabalho no campo",
    terrain: "umido",
  },
  weights: {
    ml: 70,
    operationalRules: 30,
  },
});

describe("Risk Engine · adapter server-side V1/V2", () => {
  test("V1 não exige v2Input e permanece o resultado oficial", () => {
    const result = evaluateWithRiskEngineAdapter({
      mode: "v1",
      v1Input: { finalScore: 44, level: "medio" },
      evaluateV1,
    });

    expect(result).toEqual({
      mode: "v1",
      official: {
        engine: "v1",
        result: {
          finalScore: 44,
          level: "medio",
          marker: "v1",
        },
      },
    });
  });

  test("V2 exige input explicitamente preparado", () => {
    expect(() =>
      evaluateWithRiskEngineAdapter({
        mode: "v2",
        v1Input: { finalScore: 44, level: "medio" },
        evaluateV1,
      }),
    ).toThrow("Risk Engine V2 requer v2Input explicitamente preparado.");
  });

  test("V2 executa o orquestrador e não executa V1", () => {
    const result = evaluateWithRiskEngineAdapter({
      mode: "v2",
      v1Input: { finalScore: 999, level: "não deve executar" },
      evaluateV1: () => {
        throw new Error("V1 não deveria executar em modo V2");
      },
      v2Input: preparedV2Input(),
    });

    expect(result.mode).toBe("v2");
    expect(result.official.engine).toBe("v2");
    expect(result.official.result).toMatchObject({
      engineVersion: "2.0",
      finalScore: 23,
      level: "baixo",
    });
  });

  test("shadow omitido fica desligado e não executa V2", () => {
    const invalidV2Input = preparedV2Input();
    invalidV2Input.weights = {
      ml: 70,
      operationalRules: 40,
    };

    const result = evaluateWithRiskEngineAdapter({
      mode: "v1",
      v1Input: { finalScore: 44, level: "medio" },
      evaluateV1,
      v2Input: invalidV2Input,
    });

    expect(result.mode).toBe("v1");
    expect(result.official.engine).toBe("v1");
    expect(result).not.toHaveProperty("shadow");
  });

  test("shadow mantém V1 oficial e retorna comparação separada", () => {
    const result = evaluateWithRiskEngineAdapter({
      mode: "v1",
      shadow: true,
      v1Input: { finalScore: 44, level: "medio" },
      evaluateV1,
      v2Input: preparedV2Input(),
    });

    expect(result.mode).toBe("v1");
    expect(result.official).toEqual({
      engine: "v1",
      result: {
        finalScore: 44,
        level: "medio",
        marker: "v1",
      },
    });
    expect(result.shadow).toEqual({
      status: "available",
      comparison: {
        v1FinalScore: 44,
        v2FinalScore: 23,
        difference: -21,
        v1Level: "medio",
        v2Level: "baixo",
      },
    });
  });

  test("shadow sem v2Input não interrompe o fluxo V1", () => {
    const result = evaluateWithRiskEngineAdapter({
      mode: "v1",
      shadow: true,
      v1Input: { finalScore: 44, level: "medio" },
      evaluateV1,
    });

    expect(result.official.engine).toBe("v1");
    expect(result.shadow).toEqual({
      status: "not_available",
    });
  });
});