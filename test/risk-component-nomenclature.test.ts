import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const adminPresentationSource = [
  "../src/components/admin-v2-risk-panel.tsx",
  "../src/routes/admin.tsx",
]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const otherPersonaPresentationSource = [
  "../src/components/persona-v2-risk-panel.tsx",
  "../src/components/machine-detail-dialog.tsx",
  "../src/components/area-detail-dialog.tsx",
  "../src/routes/consultor.tsx",
]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const presentationSource = `${adminPresentationSource}\n${otherPersonaPresentationSource}`;

describe("nomenclatura dos macrocomponentes de risco", () => {
  test("Admin apresenta SCORE ML, operacional e final sem aliases climáticos", () => {
    expect(adminPresentationSource).toContain("SCORE ML");
    expect(adminPresentationSource).toContain("SCORE OPERACIONAL");
    expect(adminPresentationSource).toContain("SCORE FINAL");
    expect(adminPresentationSource).toContain("Peso do modelo ML");
    expect(adminPresentationSource).toContain("Peso operacional");
    expect(adminPresentationSource).not.toContain("Score climático");
    expect(adminPresentationSource).not.toContain("Peso climático");
    expect(adminPresentationSource).not.toContain("Climático");
  });

  test("outras personas preservam Climático e Operacional sem aliases antigos", () => {
    expect(otherPersonaPresentationSource).toContain("Score climático");
    expect(otherPersonaPresentationSource).toContain("Score operacional");
    expect(otherPersonaPresentationSource).toContain("Climático");
    expect(otherPersonaPresentationSource).toContain("Operacional");

    for (const obsoleteLabel of [
      "Modelo ML",
      "Score ML",
      "Peso ML",
      "Regras operacionais",
      "Configuração ativa: ML",
      "Pesos Sompo: ML",
    ]) {
      expect(otherPersonaPresentationSource).not.toContain(obsoleteLabel);
    }
  });

  test("preserva os identificadores internos do Risk Engine", () => {
    expect(presentationSource).toContain('driver.source === "ml"');
    expect(presentationSource).toContain('driver.source === "operational_rules"');
    expect(presentationSource).toContain("result.weights.ml");
    expect(presentationSource).toContain("result.weights.operationalRules");
  });
});