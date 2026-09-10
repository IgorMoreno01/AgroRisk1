import { describe, expect, test } from "bun:test";
import {
  evaluateRiskEngineV2,
  type RiskEngineV2EvaluationInput,
} from "../src/lib/risk-engine-v2/evaluate";

const GOLDEN_VECTOR_1 = {
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
} as const;

const EXPECTED_SAMPLE_PROBABILITY = 0.05127686556740283;
const EXPECTED_ML_RELATIVE_SCORE = 10.628174153148267;
const EXPECTED_OPERATIONAL_RULES_SCORE = 52;

const validInput = (): RiskEngineV2EvaluationInput => ({
  mlInput: GOLDEN_VECTOR_1,
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

describe("Risk Engine V2 · orquestrador isolado", () => {
  test("executa o fluxo completo com o primeiro Golden Vector", () => {
    const result = evaluateRiskEngineV2(validInput());
    const expectedMlContribution =
      (EXPECTED_ML_RELATIVE_SCORE * 70) / 100;
    const expectedOperationalContribution =
      (EXPECTED_OPERATIONAL_RULES_SCORE * 30) / 100;
    const expectedFinalScore = Math.round(
      expectedMlContribution + expectedOperationalContribution,
    );

    expect(result.engineVersion).toBe("2.0");
    expect(result.ml.modelVersion).toBe("1.0");
    expect(result.operationalRules.rulesVersion).toBe("1.0");

    expect(
      Math.abs(
        result.ml.sampleProbabilityInternal! -
          EXPECTED_SAMPLE_PROBABILITY,
      ),
    ).toBeLessThanOrEqual(1e-12);
    expect(
      Math.abs(
        result.ml.mlRelativeScore - EXPECTED_ML_RELATIVE_SCORE,
      ),
    ).toBeLessThanOrEqual(1e-10);
    expect(result.operationalRules.operationalRulesScore).toBe(
      EXPECTED_OPERATIONAL_RULES_SCORE,
    );

    expect(result.contributions).toHaveLength(2);
    expect(result.contributions[0]).toMatchObject({
      component: "ml",
      sourceScore: result.ml.mlRelativeScore,
      weight: 70,
    });
    expect(
      Math.abs(
        result.contributions[0].weightedContribution -
          expectedMlContribution,
      ),
    ).toBeLessThanOrEqual(1e-10);
    expect(result.contributions[1]).toEqual({
      component: "operational_rules",
      sourceScore: EXPECTED_OPERATIONAL_RULES_SCORE,
      weight: 30,
      weightedContribution: expectedOperationalContribution,
    });

    expect(result.finalScore).toBe(expectedFinalScore);
    expect(result.finalScore).toBe(23);
    expect(result.level).toBe("baixo");
    expect(result.dominantComponent).toBe("operational_rules");
  });

  test("mantém explicabilidade ML vazia e drivers operacionais ativos", () => {
    const result = evaluateRiskEngineV2(validInput());

    expect(result.ml.components).toEqual([]);
    expect(
      result.drivers.filter((driver) => driver.source === "ml"),
    ).toEqual([]);
    expect(
      result.drivers.map(({ source, code, contribution }) => ({
        source,
        code,
        contribution,
      })),
    ).toEqual([
      {
        source: "operational_rules",
        code: "water_proximity",
        contribution: 12,
      },
      {
        source: "operational_rules",
        code: "terrain",
        contribution: 7,
      },
      {
        source: "operational_rules",
        code: "operation_type",
        contribution: 6,
      },
    ]);
  });

  test("propaga erro de pesos inválidos do combinador", () => {
    const invalidInput = validInput();
    invalidInput.weights = {
      ml: 70,
      operationalRules: 40,
    };

    expect(() => evaluateRiskEngineV2(invalidInput)).toThrow(
      "Os pesos de ML e regras operacionais devem somar 100.",
    );
  });
});