import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RISK_ENGINE_V2_ML_WEIGHT,
  evaluateRiskEngineV2Demo,
} from "../src/lib/risk-engine-v2/demo-scenario";
import { readFileSync } from "node:fs";

describe("Risk Engine V2 · cenário demonstrativo do Admin", () => {
  test("usa Golden Vector 1, entrada operacional validada e pesos 70/30", () => {
    const result = evaluateRiskEngineV2Demo();
    expect(DEFAULT_RISK_ENGINE_V2_ML_WEIGHT).toBe(70);
    expect(result.weights).toEqual({ ml: 70, operationalRules: 30 });
    expect(result.ml.mlRelativeScore).toBeCloseTo(10.628174153148267, 10);
    expect(result.operationalRules.operationalRulesScore).toBe(52);
    expect(result.finalScore).toBe(23);
    expect(result.ml.sampleProbabilityInternal).toBeDefined();
  });

  test("altera apenas a composição do motor quando o peso ML muda", () => {
    const defaultResult = evaluateRiskEngineV2Demo();
    const result = evaluateRiskEngineV2Demo(40);
    expect(result.weights).toEqual({ ml: 40, operationalRules: 60 });
    expect(result.ml.mlRelativeScore).toBeCloseTo(10.628174153148267, 10);
    expect(result.operationalRules.operationalRulesScore).toBe(52);
    expect(result.contributions[0].sourceScore).toBe(result.ml.mlRelativeScore);
    expect(result.contributions[1].sourceScore).toBe(52);
    expect(result.finalScore).not.toBe(defaultResult.finalScore);
  });

  test("painel apresenta os campos do V2 sem tratar score como probabilidade", () => {
    const panelSource = readFileSync(
      new URL("../src/components/admin-v2-risk-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(panelSource).toContain("Score ML global");
    expect(panelSource).toContain("Score relativo de risco do ML");
    expect(panelSource).toContain("Regras operacionais");
    expect(panelSource).toContain("Score externo ao ML");
    expect(panelSource).toContain("Score final do Risk Engine");
    expect(panelSource).toContain("result.level");
    expect(panelSource).toContain("result.ml.components");
    expect(panelSource).toContain("result.contributions");
    expect(panelSource).toContain('driver.source === "ml"');
    expect(panelSource).toContain('driver.source === "operational_rules"');
    expect(panelSource).toContain("Cenário demonstrativo do MVP");
    expect(panelSource.toLowerCase()).not.toContain("probabilidade calibrada");
  });
});
