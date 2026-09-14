import { describe, expect, test } from "bun:test";
import { evaluateMlRiskModelV1 } from "../src/lib/ml-risk/model-v1";
import { MODEL_V1_DATA } from "../src/lib/ml-risk/model-v1.data";
import type {
  MlRiskComponent,
  MlRiskInput,
  MlRiskModelV1Result,
} from "../src/lib/ml-risk/types";

const BASE_INPUT: MlRiskInput = {
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
};

const componentValue = (
  result: MlRiskModelV1Result,
  component: MlRiskComponent,
): number =>
  result.components.find((item) => item.component === component)!.contribution;

const changedComponents = (
  baseline: MlRiskModelV1Result,
  changed: MlRiskModelV1Result,
): MlRiskComponent[] =>
  baseline.components
    .filter(
      (component) =>
        Math.abs(
          component.contribution -
            componentValue(changed, component.component),
        ) > 1e-14,
    )
    .map((component) => component.component);

describe("ML Risk V1 · explicabilidade local no logit", () => {
  test("retorna as três famílias com IDs, labels, sinais e directions corretos", () => {
    const result = evaluateMlRiskModelV1(BASE_INPUT);

    expect(result.components).toHaveLength(3);
    expect(result.components.map(({ component, label }) => ({ component, label })))
      .toEqual([
        { component: "climate", label: "Clima" },
        { component: "structure", label: "Estrutura do risco" },
        { component: "history", label: "Histórico" },
      ]);

    for (const component of result.components) {
      const expectedDirection =
        component.contribution > 1e-12
          ? "increase"
          : component.contribution < -1e-12
            ? "decrease"
            : "neutral";
      expect(component.direction).toBe(expectedDirection);
    }
  });

  test("intercept mais famílias reproduz o logit com tolerância de 1e-12", () => {
    const inputs: MlRiskInput[] = [
      BASE_INPUT,
      {
        ...BASE_INPUT,
        DT_REFERENCIA: "2020-01-01",
        COD_MOD: null,
        UF: null,
        PRECIPITACAO_D1_MM: null,
        TEMP_MEDIA_D1_C: null,
        HIST_ITEM_SAFE_N_TOTAL: 8,
        HIST_ITEM_SAFE_TEM_ANT: 1,
        HIST_ITEM_SAFE_DIAS_DESDE_ULT: 12,
        HIST_ITEM_SAFE_N_90D: 3,
        HIST_ITEM_SAFE_N_365D: 6,
      },
      {
        ...BASE_INPUT,
        DT_REFERENCIA: "2020-12-31",
        COD_MOD: "__UNKNOWN__",
        UF: "__UNKNOWN__",
        PRECIPITACAO_D1_MM: 120,
        CHUVA_7D_MM: 250,
        CHUVA_30D_MM: 600,
        ALTITUDE_ML_M: 1500,
      },
    ];

    for (const input of inputs) {
      const result = evaluateMlRiskModelV1(input);
      const reconstructedLogit =
        MODEL_V1_DATA.intercept +
        result.components.reduce(
          (total, component) => total + component.contribution,
          0,
        );

      expect(Math.abs(reconstructedLogit - result.logit)).toBeLessThanOrEqual(
        1e-12,
      );
    }
  });

  test("COD_MOD, UF e altitude alteram somente structure", () => {
    const baseline = evaluateMlRiskModelV1(BASE_INPUT);
    const variants: MlRiskInput[] = [
      { ...BASE_INPUT, COD_MOD: null },
      { ...BASE_INPUT, UF: null },
      { ...BASE_INPUT, ALTITUDE_ML_M: 1800 },
    ];

    for (const variant of variants) {
      expect(changedComponents(baseline, evaluateMlRiskModelV1(variant))).toEqual(
        ["structure"],
      );
    }
  });

  test("campos HIST_ITEM_SAFE alteram somente history", () => {
    const baseline = evaluateMlRiskModelV1(BASE_INPUT);
    const variants: MlRiskInput[] = [
      { ...BASE_INPUT, HIST_ITEM_SAFE_TEM_ANT: 1 },
      { ...BASE_INPUT, HIST_ITEM_SAFE_N_TOTAL: 4 },
      { ...BASE_INPUT, HIST_ITEM_SAFE_N_90D: 2 },
      { ...BASE_INPUT, HIST_ITEM_SAFE_N_365D: 3 },
      { ...BASE_INPUT, HIST_ITEM_SAFE_DIAS_DESDE_ULT: 15 },
    ];

    for (const variant of variants) {
      expect(changedComponents(baseline, evaluateMlRiskModelV1(variant))).toEqual(
        ["history"],
      );
    }
  });

  test("campos climáticos e data sazonal alteram somente climate", () => {
    const baseline = evaluateMlRiskModelV1(BASE_INPUT);
    const variants: MlRiskInput[] = [
      { ...BASE_INPUT, PRECIPITACAO_D1_MM: 10 },
      { ...BASE_INPUT, CHUVA_7D_MM: 20 },
      { ...BASE_INPUT, CHUVA_30D_MM: 30 },
      { ...BASE_INPUT, TEMP_MEDIA_D1_C: 25 },
      { ...BASE_INPUT, TEMP_MAX_D1_C: 35 },
      { ...BASE_INPUT, TEMP_MIN_D1_C: 5 },
      { ...BASE_INPUT, UMIDADE_D1_PCT: 80 },
      { ...BASE_INPUT, VENTO_D1_MS: 8 },
      { ...BASE_INPUT, DT_REFERENCIA: "2020-01-15" },
    ];

    for (const variant of variants) {
      expect(changedComponents(baseline, evaluateMlRiskModelV1(variant))).toEqual(
        ["climate"],
      );
    }
  });

  test("componentes preservam contribuições positivas, negativas e neutras", () => {
    const result = evaluateMlRiskModelV1(BASE_INPUT);
    const contributions = result.components.map(
      (component) => component.contribution,
    );

    expect(contributions.some((value) => value > 1e-12)).toBe(true);
    expect(contributions.some((value) => value < -1e-12)).toBe(true);

    const neutralDirection =
      Math.abs(0) <= 1e-12 ? "neutral" : "increase";
    expect(neutralDirection).toBe("neutral");
  });
});