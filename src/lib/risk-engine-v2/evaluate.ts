import { evaluateMlRiskModelV1 } from "../ml-risk/model-v1";
import type { MlRiskInput } from "../ml-risk/types";
import { combineRiskEngineV2 } from "./combine-scores";
import {
  evaluateOperationalRulesV2,
  type OperationalRulesInput,
} from "./operational-rules";
import type {
  MlRiskResult,
  RiskEngineV2Result,
  RiskEngineV2Weights,
} from "./types";

export interface RiskEngineV2EvaluationInput {
  mlInput: MlRiskInput;
  operationalRulesInput: OperationalRulesInput;
  weights: RiskEngineV2Weights;
}

export const evaluateRiskEngineV2 = (
  input: RiskEngineV2EvaluationInput,
): RiskEngineV2Result => {
  const mlModelResult = evaluateMlRiskModelV1(input.mlInput);

  const ml: MlRiskResult = {
    modelVersion: mlModelResult.modelVersion,
    sampleProbabilityInternal: mlModelResult.sampleProbabilityInternal,
    mlRelativeScore: mlModelResult.mlRelativeScore,
    components: mlModelResult.components,
  };

  const operationalRules = evaluateOperationalRulesV2(
    input.operationalRulesInput,
  );

  return combineRiskEngineV2({
    ml,
    operationalRules,
    weights: input.weights,
  });
};