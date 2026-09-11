import type { Area, Client, Machine, Operation } from "../mock-data";
import type { MlRiskInput } from "../ml-risk/types";
import { evaluateRiskEngineV2, type RiskEngineV2EvaluationInput } from "./evaluate";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./types";

export type RiskInputSource =
  | "postgres"
  | "derived"
  | "missing_imputed"
  | "synthetic_demo";

export interface OperationRiskFarm {
  id: string;
  name: string;
  municipality: string;
  state: string;
}

export interface OperationRiskRelationalContext {
  source: "postgres" | "mock";
  operation: Operation;
  machine: Machine;
  area: Area;
  farm: OperationRiskFarm;
  client: Client;
}

export interface OperationRiskInputProvenance {
  ml: Record<keyof MlRiskInput, RiskInputSource>;
  operationalRules: {
    waterDistance: RiskInputSource;
    operationType: RiskInputSource;
    terrain: RiskInputSource;
  };
}

export interface OperationRiskEvaluation {
  input: RiskEngineV2EvaluationInput;
  result: PublicRiskEngineV2Result;
  context: OperationRiskRelationalContext;
  provenance: OperationRiskInputProvenance;
  hasIncompleteInputs: boolean;
}

export type PublicRiskEngineV2Result = Omit<RiskEngineV2Result, "ml"> & {
  ml: Omit<RiskEngineV2Result["ml"], "sampleProbabilityInternal">;
};

export function buildFallbackOperationRiskContext(
  operation: Operation,
  machine: Machine,
  area: Area,
  client: Client,
): OperationRiskRelationalContext {
  return {
    source: "mock",
    operation,
    machine,
    area,
    farm: {
      id: `synthetic-${area.id}`,
      name: area.client,
      municipality: client.city,
      state: client.state,
    },
    client,
  };
}

const missingMlInput = (
  operation: Operation,
  farm: OperationRiskFarm,
): MlRiskInput => ({
  DT_REFERENCIA: operation.scheduledAt.slice(0, 10),
  COD_MOD: null,
  UF: farm.state || null,
  PRECIPITACAO_D1_MM: null,
  CHUVA_7D_MM: null,
  CHUVA_30D_MM: null,
  TEMP_MEDIA_D1_C: null,
  TEMP_MAX_D1_C: null,
  TEMP_MIN_D1_C: null,
  UMIDADE_D1_PCT: null,
  VENTO_D1_MS: null,
  ALTITUDE_ML_M: null,
  HIST_ITEM_SAFE_N_TOTAL: null,
  HIST_ITEM_SAFE_TEM_ANT: null,
  HIST_ITEM_SAFE_DIAS_DESDE_ULT: null,
  HIST_ITEM_SAFE_N_90D: null,
  HIST_ITEM_SAFE_N_365D: null,
});

export function buildOperationRiskV2EvaluationInput(
  context: OperationRiskRelationalContext,
  weights: RiskEngineV2Weights,
): Omit<OperationRiskEvaluation, "result"> {
  const entitySource: RiskInputSource =
    context.source === "postgres" ? "postgres" : "synthetic_demo";
  const mlInput = missingMlInput(context.operation, context.farm);
  const input: RiskEngineV2EvaluationInput = {
    mlInput,
    operationalRulesInput: {
      operationType: context.operation.type,
      // Temporários e neutros: não são derivados de score, near_water ou declividade.
      waterDistance: "acima_150",
      terrain: "normal",
    },
    weights,
  };
  const provenance: OperationRiskInputProvenance = {
    ml: {
      DT_REFERENCIA: "derived",
      COD_MOD: "missing_imputed",
      UF: entitySource,
      PRECIPITACAO_D1_MM: "missing_imputed",
      CHUVA_7D_MM: "missing_imputed",
      CHUVA_30D_MM: "missing_imputed",
      TEMP_MEDIA_D1_C: "missing_imputed",
      TEMP_MAX_D1_C: "missing_imputed",
      TEMP_MIN_D1_C: "missing_imputed",
      UMIDADE_D1_PCT: "missing_imputed",
      VENTO_D1_MS: "missing_imputed",
      ALTITUDE_ML_M: "missing_imputed",
      HIST_ITEM_SAFE_N_TOTAL: "missing_imputed",
      HIST_ITEM_SAFE_TEM_ANT: "missing_imputed",
      HIST_ITEM_SAFE_DIAS_DESDE_ULT: "missing_imputed",
      HIST_ITEM_SAFE_N_90D: "missing_imputed",
      HIST_ITEM_SAFE_N_365D: "missing_imputed",
    },
    operationalRules: {
      operationType: entitySource,
      waterDistance: "synthetic_demo",
      terrain: "synthetic_demo",
    },
  };
  return { input, context, provenance, hasIncompleteInputs: true };
}

export function evaluateOperationRiskV2(
  context: OperationRiskRelationalContext,
  weights: RiskEngineV2Weights,
): OperationRiskEvaluation {
  const evaluation = buildOperationRiskV2EvaluationInput(context, weights);
  const result = evaluateRiskEngineV2(evaluation.input);
  const { sampleProbabilityInternal: _internal, ...publicMl } = result.ml;
  return {
    ...evaluation,
    result: { ...result, ml: publicMl },
  };
}
