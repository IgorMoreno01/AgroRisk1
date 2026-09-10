import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getRiskEngineV2DemoResult } from "../src/components/persona-v2-risk-panel";
import { evaluateRiskEngineV2Demo } from "../src/lib/risk-engine-v2/demo-scenario";
import { evaluateWithRiskEngineAdapter } from "../src/lib/risk-engine/engine-adapter.server";

const componentSource = readFileSync(
  new URL("../src/components/persona-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);
const routeSources = ["gestor", "operador", "consultor"].map((route) =>
  readFileSync(new URL(`../src/routes/${route}.tsx`, import.meta.url), "utf8"),
);
const adminSource = readFileSync(
  new URL("../src/components/admin-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);

describe("Risk Engine V2 · propagação entre personas", () => {
  test("Gestor, Operador e Consultor usam o mesmo componente e resultado V2", () => {
    expect(routeSources[0]).toContain('<PersonaV2RiskPanel persona="gestor"');
    expect(routeSources[1]).toContain('<PersonaV2RiskPanel persona="operador"');
    expect(routeSources[2]).toContain('<PersonaV2RiskPanel persona="consultor"');

    const results = routeSources.map(() => getRiskEngineV2DemoResult());
    expect(new Set(results.map((result) => result.finalScore)).size).toBe(1);
    expect(new Set(results.map((result) => result.level)).size).toBe(1);
    expect(new Set(results.map((result) => result.dominantComponent)).size).toBe(1);
  });

  test("nenhuma rota duplica o cenário ou recalcula o score V2", () => {
    for (const source of routeSources) {
      expect(source).not.toContain("evaluateRiskEngineV2Demo");
      expect(source).not.toContain("RISK_ENGINE_V2_DEMO_ML_INPUT");
      expect(source).not.toContain("RISK_ENGINE_V2_DEMO_OPERATIONAL_INPUT");
    }
    expect(componentSource.match(/getRiskEngineV2DemoResult\(\)/g)?.length).toBe(2);
    expect(componentSource).toContain("const result = getRiskEngineV2DemoResult()");
  });

  test("mantém semântica segura, drivers coerentes e identificação da demo", () => {
    const visibleSources = [componentSource, ...routeSources, adminSource].join("\n");
    expect(componentSource).toContain("Score relativo de risco do ML");
    expect(componentSource).toContain('driver.source === "ml"');
    expect(componentSource).toContain('driver.source === "operational_rules"');
    expect(componentSource).toContain("Cenário demonstrativo do MVP");
    expect(visibleSources).not.toContain("sampleProbabilityInternal");
    expect(visibleSources.toLowerCase()).not.toContain("probabilidade calibrada");
    expect(visibleSources.toLowerCase()).not.toContain("probabilidade de sinistro");
    expect(visibleSources.toLowerCase()).not.toContain("chance real de sinistro");
  });

  test("Sompo permanece funcional com o mesmo cenário V2", () => {
    expect(adminSource).toContain("evaluateRiskEngineV2Demo");
    expect(adminSource).toContain("Score final de risco");
    expect(evaluateRiskEngineV2Demo().finalScore).toBe(getRiskEngineV2DemoResult().finalScore);
  });

  test("V1 permanece disponível no adapter", () => {
    const operation = {
      weather: "seco" as const,
      waterDistance: "mais_100" as const,
      operationType: "Transporte" as const,
      terrain: "seco" as const,
    };
    const result = evaluateWithRiskEngineAdapter({
      mode: "v1",
      v1Input: operation,
      evaluateV1: () => ({ finalScore: 18, level: "baixo" }),
    });
    expect(result.mode).toBe("v1");
    expect(result.official.engine).toBe("v1");
  });
});