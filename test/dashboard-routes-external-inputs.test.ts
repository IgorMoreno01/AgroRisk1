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

  test("Operador exibe clima somente do input preparado do Risk Engine", () => {
    const source = readFileSync(resolve("src/routes/operador.tsx"), "utf8");
    expect(source).toContain("riskSnapshot?.evaluationContext.input.mlInput");
    expect(source).toContain("TEMP_MEDIA_D1_C");
    expect(source).toContain("PRECIPITACAO_D1_MM");
    expect(source).toContain("VENTO_D1_MS");
    expect(source).toContain("Dados históricos preparados");
    expect(source).toContain("Dados indisponíveis");
    expect(source).not.toContain("WeatherData");
    expect(source).not.toContain("loadingWeather");
  });
});