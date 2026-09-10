import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { evaluateRiskEngineV2DemoScenario } from "../src/lib/risk-engine-v2/demo-scenario";
import { evaluateWithRiskEngineAdapter } from "../src/lib/risk-engine/engine-adapter.server";

const panelSource = readFileSync(
  new URL("../src/components/admin-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);

describe("Admin · hierarquia executiva do Risk Engine V2", () => {
  test("exibe scores ML, operacional e final em escala de 100", () => {
    expect(panelSource).toContain("Score ML");
    expect(panelSource).toContain("Score operacional");
    expect(panelSource).toContain("Score final de risco");
    expect(panelSource.match(/\/ 100/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test("exibe os breakdowns reais de ML e regras operacionais", () => {
    expect(panelSource).toContain("result.ml.components.map");
    expect(panelSource).toContain("result.operationalRules.factors.map");
    expect(panelSource).toContain("factor.points");
    expect(panelSource).toContain("factor.maxPoints");
    expect(panelSource).toContain("Total bruto");
  });

  test("preserva pesos, salvamento e recálculo do score", () => {
    const original = evaluateRiskEngineV2DemoScenario("medium", 70);
    const changed = evaluateRiskEngineV2DemoScenario("medium", 0);
    expect(original.weights.ml + original.weights.operationalRules).toBe(100);
    expect(changed.finalScore).not.toBe(original.finalScore);
    expect(panelSource).toContain("Salvar pesos");
    expect(panelSource).toContain("Configuração ativa");
  });

  test("mantém demo e semântica sem probabilidade real", () => {
    expect(panelSource).toContain("Cenário demonstrativo do MVP");
    expect(panelSource).not.toContain("sampleProbabilityInternal");
    expect(panelSource.toLowerCase()).not.toContain("probabilidade real");
    expect(panelSource.toLowerCase()).not.toContain("chance de sinistro");
    expect(panelSource.toLowerCase()).not.toContain("probabilidade calibrada");
  });

  test("V1 continua disponível pelo adapter", () => {
    const result = evaluateWithRiskEngineAdapter({
      mode: "v1",
      v1Input: {},
      evaluateV1: () => ({ finalScore: 20, level: "baixo" }),
    });
    expect(result.mode).toBe("v1");
    expect(result.official.engine).toBe("v1");
  });

  test("outras personas não recebem elementos da configuração Sompo", () => {
    for (const route of ["gestor", "operador", "consultor"]) {
      const source = readFileSync(new URL(`../src/routes/${route}.tsx`, import.meta.url), "utf8");
      expect(source).not.toContain("Pesos definidos pela Sompo");
      expect(source).not.toContain("OperationalFactors");
    }
  });
});