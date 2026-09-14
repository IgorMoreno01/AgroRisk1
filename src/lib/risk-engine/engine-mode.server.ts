export type RiskEngineMode = "v1" | "v2";

const V2_FLAG_VALUES = new Set(["true", "1", "yes"]);

export const resolveRiskEngineMode = (
  envValue?: string,
): RiskEngineMode =>
  V2_FLAG_VALUES.has(envValue?.trim().toLowerCase() ?? "")
    ? "v2"
    : "v1";

/**
 * Leitura server-side tardia para evitar captura da variável no bundle client
 * ou no momento de avaliação do módulo.
 */
export const readRiskEngineMode = (): RiskEngineMode =>
  resolveRiskEngineMode(process.env["USE_ML_RISK_ENGINE"]);