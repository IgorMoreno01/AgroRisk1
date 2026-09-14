import { describe, expect, test } from "bun:test";
import { operations } from "../src/lib/mock-data";
import {
  recommendationsForOperation,
  telemetrySafetyRecommendationsForOperation,
} from "../src/lib/recommendations";

const operation = operations.find((item) => item.id === "OP-1001");
if (!operation) throw new Error("Baseline OP-1001 não encontrada nos mocks V1.");

describe("Recomendações V1", () => {
  test("congela a recomendação principal de OP-1001 para operador", () => {
    const recommendations = recommendationsForOperation(operation, "operador");
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toEqual({
      id: "OP-1001-engine",
      title: "Revisar a rota próxima à água",
      description: "Evite continuar sem verificar proximidade de água e interrompa a operação se houver agravamento.",
      rationale: "Risco operacional; fator responsável: proximidade de água (entre 50 e 100 m).",
      category: "Rota",
      priority: "baixa",
      audience: "operador",
      factor: "Proximidade de água",
    });
  });

  test("mantém recomendação de inclinação separada do score principal", () => {
    expect(telemetrySafetyRecommendationsForOperation(operation, "operador")).toEqual([
      {
        id: "OP-1001-telemetry-inclination",
        title: "Selecionar rota com menor inclinação",
        description: "Interrompa o avanço e retome somente por um trecho com inclinação segura.",
        rationale: "Telemetria MPU6050: inclinação 18.0° (crítica) aumenta o risco de tombamento.",
        category: "Inclinação",
        priority: "alta",
        audience: "operador",
        factor: "Inclinação",
      },
    ]);
  });
});