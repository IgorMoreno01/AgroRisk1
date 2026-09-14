import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/admin.tsx", import.meta.url), "utf8");

describe("Admin/Sompo · filtros locais do cockpit", () => {
  test("expõe os controles exigidos por cada lista", () => {
    for (const label of [
      "Risco",
      "Status da máquina",
      "Tipo de máquina",
      "Cliente da máquina",
      "Avaliação",
      "Localização ou UF",
      "Condição da área",
      "Proximidade de água",
      "Categoria da recomendação",
      "Destino da recomendação",
      "Status da operação",
      "Tipo de operação",
    ]) {
      expect(source).toContain(`aria-label="${label}"`);
    }
    expect(source).toContain('value="pendente"');
    expect(source).toContain('value="avaliado"');
  });

  test("operações retornam pela navegação de estado e filtros não iniciam avaliações", () => {
    expect(source).toContain('goToTab("visao-geral")');
    expect(source).toContain("Filtros locais · não recalculam risco");
    expect(source).toContain("setRisk(\"todos\")");
  });
});