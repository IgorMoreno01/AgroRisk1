import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { recommendationForV2Result } from "../src/components/admin-v2-risk-panel";
import { evaluateRiskEngineV2DemoScenario } from "../src/lib/risk-engine-v2/demo-scenario";
import { evaluateWithRiskEngineAdapter } from "../src/lib/risk-engine/engine-adapter.server";

const panelSource = readFileSync(
  new URL("../src/components/admin-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);

describe("Admin · hierarquia executiva do Risk Engine V2", () => {
  test("exibe scores ML, operacional e final em escala de 100", () => {
    expect(panelSource).toContain("SCORE ML");
    expect(panelSource).toContain("SCORE OPERACIONAL");
    expect(panelSource).toContain("SCORE FINAL");
    expect(panelSource.match(/\/ 100/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test("exibe os breakdowns reais dos componentes climático e operacional", () => {
    expect(panelSource).toContain("result.ml.components.map");
    expect(panelSource).toContain("result.operationalRules.factors.map");
    expect(panelSource).toContain("factor.points");
    expect(panelSource).toContain("factor.maxPoints");
    expect(panelSource).not.toContain("Total bruto");
    expect(panelSource).toContain("Score Operacional");
  });

  test("preserva pesos, salvamento e recálculo do score", () => {
    const original = evaluateRiskEngineV2DemoScenario("medium", 70);
    const changed = evaluateRiskEngineV2DemoScenario("medium", 0);
    expect(original.weights.ml + original.weights.operationalRules).toBe(100);
    expect(changed.finalScore).not.toBe(original.finalScore);
    expect(panelSource).toContain("Salvar pesos");
    expect(panelSource).toContain("Configuração ativa");
    expect(panelSource).toContain("Prévia com pesos não salvos");
  });

  test("recomendação administrativa acompanha nível e drivers do V2", () => {
    const lowResult = evaluateRiskEngineV2DemoScenario("low");
    const mediumResult = evaluateRiskEngineV2DemoScenario("medium");
    const highResult = evaluateRiskEngineV2DemoScenario("high");
    const low = recommendationForV2Result(lowResult);
    const medium = recommendationForV2Result(mediumResult);
    const high = recommendationForV2Result(highResult);

    expect(new Set([low.title, medium.title, high.title]).size).toBe(3);
    expect(low.priority).toBe("baixa");
    expect(medium.priority).toBe("média");
    expect(high.priority).toBe("alta");
    expect(low.factor).toBe("Condição do terreno");
    expect(medium.factor).toBe("Proximidade de água");
    expect(high.factor).toBe("Tipo de operação");
    expect(panelSource).toContain("recommendationForV2Result(result)");
    expect(panelSource).toContain('result.level === "alto"');
    expect(panelSource).toContain('result.level === "medio"');
    expect(panelSource).toContain('driver.source === "ml"');
    expect(panelSource).toContain('driver.source === "operational_rules"');
    expect(panelSource).toContain("proximidade de água");
    expect(panelSource).toContain("condição do terreno");
    expect(panelSource).toContain("tipo da operação");
    expect(panelSource).not.toContain("recommendationsForOperation");
  });

  test("identifica inputs incompletos e mantém semântica sem probabilidade real", () => {
    expect(panelSource).toContain("evaluation.hasIncompleteInputs");
    expect(panelSource).toContain("Detalhes da disponibilidade dos dados");
    expect(panelSource).toContain("Parte dos sinais necessários para a avaliação");
    expect(panelSource).not.toContain("quality.weather");
    expect(panelSource).not.toContain("quality.altitude");
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