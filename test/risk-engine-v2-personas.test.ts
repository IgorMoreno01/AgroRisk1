import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { evaluateWithRiskEngineAdapter } from "../src/lib/risk-engine/engine-adapter.server";

const componentSource = readFileSync(
  new URL("../src/components/persona-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);
const routeSources = ["gestor", "operador", "consultor"].map((route) =>
  readFileSync(new URL(`../src/routes/${route}.tsx`, import.meta.url), "utf8"),
);
const runtimeSources = [
  "../src/lib/admin-dashboard.server.ts",
  "../src/lib/operador-dashboard.server.ts",
  "../src/lib/consultor-dashboard.server.ts",
  "../src/components/admin-v2-risk-panel.tsx",
  "../src/components/persona-v2-risk-panel.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

describe("Risk Engine V2 · propagação entre personas", () => {
  test("Gestor e Consultor recebem resultado/contexto central; Operador usa o snapshot", () => {
    expect(routeSources[0]).toContain('persona="gestor"');
    expect(routeSources[0]).toContain("evaluation={snapshot.operationRows[0].evaluation}");
    expect(routeSources[1]).toContain("scoreContext.finalScore");
    expect(routeSources[1]).toContain("snapshot.nextAction");
    expect(routeSources[2]).toContain('persona="consultor"');
    expect(routeSources[2]).toContain("evaluation={topMachine.evaluation}");
  });

  test("Golden Vector e cenários baixo/médio/alto não alimentam runtime", () => {
    for (const source of runtimeSources) {
      expect(source).not.toContain("evaluateRiskEngineV2Demo");
      expect(source).not.toContain("RISK_ENGINE_V2_DEMO_SCENARIOS");
      expect(source).not.toContain("Golden Vector");
    }
    expect(componentSource).toContain('clima {quality.weather === "historical_api" ? "histórico real" : "imputado"}');
    expect(componentSource).toContain('altitude {quality.altitude === "elevation_api" ? "real" : "imputada"}');
    expect(componentSource).toContain("evaluation.context.farm.name");
  });

  test("não apresenta probabilidade absoluta", () => {
    const visibleSources = [componentSource, ...routeSources].join("\n");
    expect(visibleSources).not.toContain("sampleProbabilityInternal");
    expect(visibleSources.toLowerCase()).not.toContain("probabilidade calibrada");
    expect(visibleSources.toLowerCase()).not.toContain("probabilidade de sinistro");
  });

  test("V1 permanece disponível no adapter", () => {
    const result = evaluateWithRiskEngineAdapter({
      mode: "v1",
      v1Input: {
        weather: "seco",
        waterDistance: "mais_100",
        operationType: "Transporte",
        terrain: "seco",
      },
      evaluateV1: () => ({ finalScore: 18, level: "baixo" }),
    });
    expect(result.mode).toBe("v1");
    expect(result.official.engine).toBe("v1");
  });
});