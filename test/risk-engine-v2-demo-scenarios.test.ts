import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  evaluateRiskEngineV2DemoScenario,
  RISK_ENGINE_V2_DEMO_SCENARIOS,
} from "../src/lib/risk-engine-v2/demo-scenario";

const goldenCsv = readFileSync(
  new URL("../attached_assets/agrorisk_golden_vectors_v1_1789008155364.csv", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("../src/components/admin-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);

describe("Risk Engine V2 · cenários demonstrativos", () => {
  test.each([
    ["low", 4],
    ["medium", 11],
    ["high", 20],
  ] as const)("%s usa o Golden Vector %i real e retorna resultado válido", (id, vector) => {
    const scenario = RISK_ENGINE_V2_DEMO_SCENARIOS[id];
    const csvRow = goldenCsv.trim().split(/\r?\n/)[vector];
    const result = evaluateRiskEngineV2DemoScenario(id);

    expect(scenario.goldenVector).toBe(vector);
    expect(csvRow).toContain(scenario.mlInput.DT_REFERENCIA);
    expect(csvRow).toContain(`,${scenario.mlInput.COD_MOD},${scenario.mlInput.UF},`);
    expect(result.engineVersion).toBe("2.0");
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(100);
  });

  test("produz cenários plausíveis nas faixas solicitadas e em ordem crescente", () => {
    const low = evaluateRiskEngineV2DemoScenario("low");
    const medium = evaluateRiskEngineV2DemoScenario("medium");
    const high = evaluateRiskEngineV2DemoScenario("high");

    expect(low.finalScore).toBeLessThan(medium.finalScore);
    expect(medium.finalScore).toBeLessThan(high.finalScore);
    expect(low.finalScore).toBeGreaterThanOrEqual(25);
    expect(low.finalScore).toBeLessThanOrEqual(35);
    expect(medium.finalScore).toBeGreaterThanOrEqual(50);
    expect(medium.finalScore).toBeLessThanOrEqual(65);
    expect(high.finalScore).toBeGreaterThanOrEqual(80);
    expect(high.finalScore).toBeLessThanOrEqual(90);
    expect(high.operationalRules.operationalRulesScore).toBeLessThan(100);
  });

  test("pesos configuráveis alteram naturalmente o score final", () => {
    const defaultResult = evaluateRiskEngineV2DemoScenario("medium", 70);
    const changedResult = evaluateRiskEngineV2DemoScenario("medium", 40);
    expect(changedResult.finalScore).not.toBe(defaultResult.finalScore);
    expect(changedResult.weights).toEqual({ ml: 40, operationalRules: 60 });
  });

  test("Admin possui seletor e não exibe probabilidade absoluta", () => {
    expect(panelSource).toContain("Cenário demonstrativo");
    expect(RISK_ENGINE_V2_DEMO_SCENARIOS.low.label).toBe("Baixo");
    expect(RISK_ENGINE_V2_DEMO_SCENARIOS.medium.label).toBe("Médio");
    expect(RISK_ENGINE_V2_DEMO_SCENARIOS.high.label).toBe("Alto");
    expect(panelSource).toContain("evaluateRiskEngineV2DemoScenario");
    expect(panelSource).not.toContain("sampleProbabilityInternal");
    expect(panelSource.toLowerCase()).not.toContain("probabilidade calibrada");
    expect(panelSource.toLowerCase()).not.toContain("probabilidade de sinistro");
  });
});