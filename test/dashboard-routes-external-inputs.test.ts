import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboardRoutes = ["admin", "gestor", "consultor", "operador"];
const forbiddenExternalRuntimeReferences = [
  "/adapters/",
  "api/weather.functions",
  "api/terrain.functions",
  "api/water-geo.functions",
  "api/routing.functions",
  "getWeather(",
  "getTerrain(",
  "getWaterGeo(",
  "getRoute(",
];

describe("abertura dos dashboards sem APIs externas", () => {
  test("quatro rotas não importam nem chamam adapters/server functions externos", () => {
    for (const route of dashboardRoutes) {
      const source = readFileSync(resolve(`src/routes/${route}.tsx`), "utf8");
      for (const reference of forbiddenExternalRuntimeReferences) {
        expect(source, `${route} contém ${reference}`).not.toContain(reference);
      }
    }
  });

  test("Operador delega clima atual sem misturá-lo ao input preparado do Risk Engine", () => {
    const source = readFileSync(resolve("src/routes/operador.tsx"), "utf8");
    expect(source).toContain("OperatorCurrentWeather");
    expect(source).not.toContain("evaluationContext.input.mlInput");
    expect(source).not.toContain("TEMP_MEDIA_D1_C");
    expect(source).not.toContain("PRECIPITACAO_D1_MM");
    expect(source).not.toContain("VENTO_D1_MS");
  });
});