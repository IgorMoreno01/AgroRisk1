import { evaluateRiskEngineV2 } from "./evaluate";
import type { OperationalRulesInput } from "./operational-rules";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./types";
import type { MlRiskInput } from "../ml-risk/types";

/** Golden Vector 1: kept as the backwards-compatible shared persona demo. */
export const RISK_ENGINE_V2_DEMO_ML_INPUT: MlRiskInput = {
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

/** Validated operational-rules input paired with the Golden Vector 1. */
export const RISK_ENGINE_V2_DEMO_OPERATIONAL_INPUT: OperationalRulesInput = {
  waterDistance: "50_100",
  operationType: "Trabalho no campo",
  terrain: "umido",
};

export const DEFAULT_RISK_ENGINE_V2_ML_WEIGHT = 70;

export type RiskEngineV2DemoScenarioId = "low" | "medium" | "high";

export interface RiskEngineV2DemoScenario {
  id: RiskEngineV2DemoScenarioId;
  label: string;
  goldenVector: number;
  mlInput: MlRiskInput;
  operationalRulesInput: OperationalRulesInput;
}

export const RISK_ENGINE_V2_DEMO_SCENARIOS: Record<
  RiskEngineV2DemoScenarioId,
  RiskEngineV2DemoScenario
> = {
  low: {
    id: "low",
    label: "Baixo",
    goldenVector: 4,
    mlInput: {
      DT_REFERENCIA: "2020-11-28",
      COD_MOD: "50",
      UF: "SC",
      PRECIPITACAO_D1_MM: 7.999999999999999,
      CHUVA_7D_MM: 7.999999999999999,
      CHUVA_30D_MM: 51.800000000000004,
      TEMP_MEDIA_D1_C: 20.833333333333332,
      TEMP_MAX_D1_C: 27.7,
      TEMP_MIN_D1_C: 18.1,
      UMIDADE_D1_PCT: 82.875,
      VENTO_D1_MS: 3.220833333333333,
      ALTITUDE_ML_M: 878.74,
      HIST_ITEM_SAFE_N_TOTAL: 0,
      HIST_ITEM_SAFE_TEM_ANT: 0,
      HIST_ITEM_SAFE_DIAS_DESDE_ULT: null,
      HIST_ITEM_SAFE_N_90D: 0,
      HIST_ITEM_SAFE_N_365D: 0,
    },
    operationalRulesInput: {
      waterDistance: "acima_150",
      operationType: "Deslocamento interno",
      terrain: "umido",
    },
  },
  medium: {
    id: "medium",
    label: "Médio",
    goldenVector: 11,
    mlInput: {
      DT_REFERENCIA: "2020-02-04",
      COD_MOD: "50",
      UF: "SC",
      PRECIPITACAO_D1_MM: 0.2,
      CHUVA_7D_MM: 67.4,
      CHUVA_30D_MM: 147.59999999999997,
      TEMP_MEDIA_D1_C: 20.291666666666668,
      TEMP_MAX_D1_C: 27.5,
      TEMP_MIN_D1_C: 15.2,
      UMIDADE_D1_PCT: 76.04166666666667,
      VENTO_D1_MS: 1.3833333333333335,
      ALTITUDE_ML_M: 944.26,
      HIST_ITEM_SAFE_N_TOTAL: 0,
      HIST_ITEM_SAFE_TEM_ANT: 0,
      HIST_ITEM_SAFE_DIAS_DESDE_ULT: null,
      HIST_ITEM_SAFE_N_90D: 0,
      HIST_ITEM_SAFE_N_365D: 0,
    },
    operationalRulesInput: {
      waterDistance: "50_100",
      operationType: "Transporte",
      terrain: "umido",
    },
  },
  high: {
    id: "high",
    label: "Alto",
    goldenVector: 20,
    mlInput: {
      DT_REFERENCIA: "2020-10-27",
      COD_MOD: "60",
      UF: "MT",
      PRECIPITACAO_D1_MM: 0,
      CHUVA_7D_MM: 9.200000000000001,
      CHUVA_30D_MM: 82.4,
      TEMP_MEDIA_D1_C: 31.329166666666666,
      TEMP_MAX_D1_C: 41.9,
      TEMP_MIN_D1_C: 21.6,
      UMIDADE_D1_PCT: 60.458333333333336,
      VENTO_D1_MS: 1.6416666666666666,
      ALTITUDE_ML_M: 334.36,
      HIST_ITEM_SAFE_N_TOTAL: 0,
      HIST_ITEM_SAFE_TEM_ANT: 0,
      HIST_ITEM_SAFE_DIAS_DESDE_ULT: null,
      HIST_ITEM_SAFE_N_90D: 0,
      HIST_ITEM_SAFE_N_365D: 0,
    },
    operationalRulesInput: {
      waterDistance: "50_100",
      operationType: "Operação próxima de água",
      terrain: "critico",
    },
  },
};

export const evaluateRiskEngineV2Demo = (
  mlWeight = DEFAULT_RISK_ENGINE_V2_ML_WEIGHT,
): RiskEngineV2Result => {
  const weights: RiskEngineV2Weights = {
    ml: mlWeight,
    operationalRules: 100 - mlWeight,
  };

  return evaluateRiskEngineV2({
    mlInput: RISK_ENGINE_V2_DEMO_ML_INPUT,
    operationalRulesInput: RISK_ENGINE_V2_DEMO_OPERATIONAL_INPUT,
    weights,
  });
};

export const evaluateRiskEngineV2DemoScenario = (
  scenarioId: RiskEngineV2DemoScenarioId,
  mlWeight = DEFAULT_RISK_ENGINE_V2_ML_WEIGHT,
): RiskEngineV2Result => {
  const scenario = RISK_ENGINE_V2_DEMO_SCENARIOS[scenarioId];
  const weights: RiskEngineV2Weights = {
    ml: mlWeight,
    operationalRules: 100 - mlWeight,
  };

  return evaluateRiskEngineV2({
    mlInput: scenario.mlInput,
    operationalRulesInput: scenario.operationalRulesInput,
    weights,
  });
};
