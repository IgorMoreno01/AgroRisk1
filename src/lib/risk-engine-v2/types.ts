/**
 * Contratos isolados do futuro Risk Engine V2.
 *
 * Este arquivo define somente tipos. Não calcula score, não carrega modelo
 * e não altera os contratos do Risk Engine V1.
 */

export type RiskLevelV2 = "baixo" | "medio" | "alto";

export interface RiskEngineV2Weights {
  /**
   * Pesos de composição do Risk Engine, não parâmetros de treinamento do ML.
   * A soma ml + operationalRules será validada em runtime em etapa posterior.
   */
  ml: number;
  operationalRules: number;
}

/**
 * Famílias internas do modelo ML. Não são pesos ou percentuais configuráveis
 * pela Sompo; o clima já está contido no modelo.
 */
export type MlRiskComponent = "climate" | "structure" | "history";

export interface MlRiskComponentContribution {
  component: MlRiskComponent;
  /**
   * Contribuição matemática da decomposição do modelo. Não representa
   * percentual e não precisa somar 100.
   */
  contribution: number;
  direction: "increase" | "decrease" | "neutral";
  label: string;
}

export interface MlRiskResult {
  modelVersion: string;
  /**
   * Score relativo de 0 a 100, associado ao percentil da população de
   * referência. Não é probabilidade absoluta de sinistro.
   */
  mlRelativeScore: number;
  /**
   * Valor técnico interno da regressão treinada em amostra case-control.
   * Não deve ser exibido como probabilidade populacional ou incidência real.
   */
  sampleProbabilityInternal?: number;
  components: MlRiskComponentContribution[];
}

/**
 * Categorias externas ao ML na primeira versão do V2.
 *
 * Clima fica dentro do ML. Histórico e inclinação ficam deliberadamente fora
 * desta versão para evitar double counting e introdução de sinal sem histórico
 * real suficiente.
 */
export type OperationalRuleCategory =
  | "water_proximity"
  | "operation_type"
  | "terrain"
  | "sompo_policy";

export interface OperationalRuleFactor {
  id: string;
  category: OperationalRuleCategory;
  label: string;
  detail?: string;
  points: number;
  maxPoints: number;
  active: boolean;
}

export interface OperationalRulesResult {
  rulesVersion: string;
  /** Score de regras operacionais na escala 0–100. */
  operationalRulesScore: number;
  factors: OperationalRuleFactor[];
  dominantFactor?: string;
}

export type RiskEngineV2Component = "ml" | "operational_rules";

export interface RiskEngineV2ComponentContribution {
  component: RiskEngineV2Component;
  sourceScore: number;
  weight: number;
  weightedContribution: number;
}

export interface RiskDriver {
  source: RiskEngineV2Component;
  code: string;
  label: string;
  contribution?: number;
  direction?: "increase" | "decrease" | "neutral";
}

export interface RiskEngineV2Result {
  engineVersion: string;
  ml: MlRiskResult;
  operationalRules: OperationalRulesResult;
  weights: RiskEngineV2Weights;
  contributions: RiskEngineV2ComponentContribution[];
  finalScore: number;
  level: RiskLevelV2;
  dominantComponent: RiskEngineV2Component | "balanced";
  drivers: RiskDriver[];
}

/**
 * Entrada de orquestração: recebe resultados já calculados. Os inputs brutos
 * do ML serão definidos somente quando o artefato portátil for integrado.
 */
export interface RiskEngineV2Input {
  ml: MlRiskResult;
  operationalRules: OperationalRulesResult;
  weights: RiskEngineV2Weights;
}