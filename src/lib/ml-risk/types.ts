export interface MlRiskInput {
  DT_REFERENCIA: string;
  COD_MOD: string | null;
  UF: string | null;
  PRECIPITACAO_D1_MM: number | null;
  CHUVA_7D_MM: number | null;
  CHUVA_30D_MM: number | null;
  TEMP_MEDIA_D1_C: number | null;
  TEMP_MAX_D1_C: number | null;
  TEMP_MIN_D1_C: number | null;
  UMIDADE_D1_PCT: number | null;
  VENTO_D1_MS: number | null;
  ALTITUDE_ML_M: number | null;
  HIST_ITEM_SAFE_N_TOTAL: number | null;
  HIST_ITEM_SAFE_TEM_ANT: number | null;
  HIST_ITEM_SAFE_DIAS_DESDE_ULT: number | null;
  HIST_ITEM_SAFE_N_90D: number | null;
  HIST_ITEM_SAFE_N_365D: number | null;
}

export type MlRiskComponent = "climate" | "structure" | "history";

export interface MlRiskComponentContribution {
  component: MlRiskComponent;
  /**
   * Soma algébrica local dos termos da família no logit.
   * Não representa probabilidade, percentual causal ou importância global.
   */
  contribution: number;
  direction: "increase" | "decrease" | "neutral";
  label: string;
}

export interface MlRiskModelV1Result {
  modelVersion: string;
  /** Diagnóstico matemático interno, não destinado à UI. */
  logit: number;
  /**
   * Probabilidade produzida sobre a amostra case-control.
   * Não representa incidência populacional de sinistro.
   */
  sampleProbabilityInternal: number;
  /**
   * Percentil empírico de 0 a 100 contra a validação de 2019.
   * Não representa probabilidade absoluta.
   */
  mlRelativeScore: number;
  /** Decomposição local dos termos do logit, sem o intercept. */
  components: MlRiskComponentContribution[];
}