import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const presentationFiles = [
  "../src/components/admin-v2-risk-panel.tsx",
  "../src/components/persona-v2-risk-panel.tsx",
  "../src/components/machine-detail-dialog.tsx",
  "../src/components/area-detail-dialog.tsx",
  "../src/routes/admin.tsx",
  "../src/routes/consultor.tsx",
];

const presentationSource = presentationFiles
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");

describe("nomenclatura dos macrocomponentes de risco", () => {
  test("apresenta Climático e Operacional sem aliases antigos", () => {
    expect(presentationSource).toContain("Score climático");
    expect(presentationSource).toContain("Score operacional");
    expect(presentationSource).toContain("Peso climático");
    expect(presentationSource).toContain("Peso operacional");
    expect(presentationSource).toContain("Climático");
    expect(presentationSource).toContain("Operacional");

    for (const obsoleteLabel of [
      "Modelo ML",
      "Score ML",
      "Peso ML",
      "Regras operacionais",
      "Configuração ativa: ML",
      "Pesos Sompo: ML",
    ]) {
      expect(presentationSource).not.toContain(obsoleteLabel);
    }
  });

  test("preserva os identificadores internos do Risk Engine", () => {
    expect(presentationSource).toContain('driver.source === "ml"');
    expect(presentationSource).toContain('driver.source === "operational_rules"');
    expect(presentationSource).toContain("result.weights.ml");
    expect(presentationSource).toContain("result.weights.operationalRules");
  });
});