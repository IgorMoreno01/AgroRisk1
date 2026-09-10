import { evaluateRiskEngineV2 } from "./evaluate";
import type { OperationalRulesInput } from "./operational-rules";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./types";
import type { MlRiskInput } from "../ml-risk/types";

/** Golden Vector 1: fixture deliberately kept explicit for reviewable demos. */
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
