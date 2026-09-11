import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  getRiskEngineV2Configuration,
  isValidRiskEngineV2Configuration,
  saveRiskEngineV2Configuration,
} from "../src/lib/risk-config.server";
import { evaluateRiskEngineV2Demo } from "../src/lib/risk-engine-v2/demo-scenario";

const panelSource = readFileSync(
  new URL("../src/components/admin-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);
const personaSource = readFileSync(
  new URL("../src/components/persona-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);

afterEach(() => {
  saveRiskEngineV2Configuration({ mlWeight: 70, operationalRulesWeight: 30 });
});

describe("Risk Engine V2 · salvamento temporário de pesos", () => {
  test("usa configuração padrão 70/30 e preserva draft separado do saved", () => {
    const saved = getRiskEngineV2Configuration();
    expect(saved.mlWeight).toBe(70);
    expect(saved.operationalRulesWeight).toBe(30);
    expect(panelSource).toContain("savedMlWeight");
    expect(panelSource).toContain("hasUnsavedChanges");
    expect(panelSource).toContain("Alterações não salvas");
  });

  test("salva configuração válida, atualiza o ativo e mantém soma 100", () => {
    const saved = saveRiskEngineV2Configuration({
      mlWeight: 80,
      operationalRulesWeight: 20,
    });
    expect(saved.mlWeight).toBe(80);
    expect(saved.operationalRulesWeight).toBe(20);
    expect(saved.mlWeight + saved.operationalRulesWeight).toBe(100);
    expect(getRiskEngineV2Configuration()).toEqual(saved);
  });

  test("não salva valores inválidos", () => {
    expect(
      isValidRiskEngineV2Configuration({ mlWeight: 80, operationalRulesWeight: 30 }),
    ).toBe(false);
    expect(() =>
      saveRiskEngineV2Configuration({ mlWeight: 80, operationalRulesWeight: 30 }),
    ).toThrow("totalizar 100%");
    expect(getRiskEngineV2Configuration().mlWeight).toBe(70);
  });

  test("recalcula a simulação com o novo peso sem alterar scores de origem", () => {
    const before = evaluateRiskEngineV2Demo(70);
    const saved = saveRiskEngineV2Configuration({
      mlWeight: 80,
      operationalRulesWeight: 20,
    });
    const after = evaluateRiskEngineV2Demo(saved.mlWeight);
    expect(after.finalScore).not.toBe(before.finalScore);
    expect(after.ml.mlRelativeScore).toBe(before.ml.mlRelativeScore);
    expect(after.operationalRules.operationalRulesScore).toBe(
      before.operationalRules.operationalRulesScore,
    );
  });

  test("painel oferece botão, estado pendente, configuração ativa e sucesso", () => {
    expect(panelSource).toContain("Salvar pesos");
    expect(panelSource).toContain("disabled={!hasUnsavedChanges");
    expect(panelSource).toContain("setSavedMlWeight(response.configuration.mlWeight)");
    expect(panelSource).toContain("Pesos salvos com sucesso");
    expect(panelSource).toContain("Configuração ativa: Climático");
    expect(panelSource).toContain('setSaveStatus("success")');
    expect(panelSource).toContain("Prévia com pesos não salvos");
    expect(panelSource).toContain("hasUnsavedChanges &&");
  });

  test("pesos 40/60 salvos podem ser usados pelo painel compartilhado das personas", () => {
    const saved = saveRiskEngineV2Configuration({
      mlWeight: 40,
      operationalRulesWeight: 60,
    });
    const personaResult = evaluateRiskEngineV2Demo(saved.mlWeight);
    expect(personaResult.weights).toEqual({ ml: 40, operationalRules: 60 });
    expect(personaSource).toContain("result: RiskEngineV2Result");
    expect(personaSource).toContain("evaluation: OperationRiskEvaluation");
    expect(personaSource).not.toContain("getRiskEngineV2Configuration");
    expect(personaSource).not.toContain("getRiskEngineV2DemoResult");
  });

  test("nenhuma persona recebe controles para alterar os pesos", () => {
    for (const route of ["gestor", "operador", "consultor"]) {
      const source = readFileSync(new URL(`../src/routes/${route}.tsx`, import.meta.url), "utf8");
      expect(source).not.toContain("saveRiskEngineV2Configuration");
      expect(source).not.toContain("Salvar pesos");
    }
    expect(personaSource).not.toContain("<Slider");
    expect(personaSource).not.toContain("Salvar pesos");
  });
});