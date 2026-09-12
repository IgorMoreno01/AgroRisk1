import { describe, expect, test } from "bun:test";
import {
  evaluateOperationalRulesV2,
  type OperationalRulesInput,
} from "../src/lib/risk-engine-v2/operational-rules";

const factorById = (
  result: ReturnType<typeof evaluateOperationalRulesV2>,
  id: string,
) => result.factors.find((factor) => factor.id === id);

describe("Risk Engine V2 · regras operacionais isoladas", () => {
  test("avalia o cenário operacional mínimo", () => {
    const result = evaluateOperationalRulesV2({
      waterDistance: "acima_150",
      operationType: "Deslocamento interno",
      terrain: "normal",
    });

    expect(result.rulesVersion).toBe("1.0");
    expect(result.operationalRulesScore).toBe(8);
    expect(result.dominantFactor).toBe("operation_type");
    expect(result.factors.map(({ points, active }) => ({ points, active }))).toEqual([
      { points: 0, active: false },
      { points: 4 * (100 / 48), active: true },
      { points: 0, active: false },
    ]);
  });

  test("avalia e normaliza o cenário intermediário", () => {
    const result = evaluateOperationalRulesV2({
      waterDistance: "50_100",
      operationType: "Trabalho no campo",
      terrain: "umido",
    });

    expect(result.factors.map((factor) => factor.points)).toEqual([
      25,
      12.5,
      7 * (100 / 48),
    ]);
    expect(result.operationalRulesScore).toBe(52);
    expect(result.dominantFactor).toBe("water_proximity");
  });

  test("normaliza o máximo base para 100", () => {
    const result = evaluateOperationalRulesV2({
      waterDistance: "abaixo_50",
      operationType: "Operação próxima de água",
      terrain: "baixa_aderencia",
    });

    expect(result.factors.map((factor) => factor.points)).toEqual([37.5, 31.25, 31.25]);
    expect(result.operationalRulesScore).toBe(100);
    expect(result.dominantFactor).toBe("water_proximity");
  });

  test("preserva os pontos e máximos de cada categoria", () => {
    const result = evaluateOperationalRulesV2({
      waterDistance: "100_150",
      operationType: "Transporte",
      terrain: "critico",
    });

    expect(factorById(result, "water_proximity")).toMatchObject({
      category: "water_proximity",
      points: 12.5,
      maxPoints: 37.5,
      active: true,
    });
    expect(factorById(result, "operation_type")).toMatchObject({
      category: "operation_type",
      points: 18.75,
      maxPoints: 31.25,
      active: true,
    });
    expect(factorById(result, "terrain")).toMatchObject({
      category: "terrain",
      points: 13 * (100 / 48),
      maxPoints: 31.25,
      active: true,
    });
  });

  test("usa desempate determinístico entre operação e terreno", () => {
    const result = evaluateOperationalRulesV2({
      waterDistance: "acima_150",
      operationType: "Operação próxima de água",
      terrain: "baixa_aderencia",
    });

    expect(result.factors.map((factor) => factor.points)).toEqual([0, 31.25, 31.25]);
    expect(result.dominantFactor).toBe("operation_type");
  });

  test("não expõe inputs que causariam double counting", () => {
    type ForbiddenInputKey = Extract<
      keyof OperationalRulesInput,
      | "weather"
      | "history"
      | "historyAlertCount"
      | "inclination"
      | "inclinationDegrees"
      | "UF"
      | "COD_MOD"
      | "mlRelativeScore"
    >;
    const hasNoForbiddenInputKeys: ForbiddenInputKey extends never
      ? true
      : false = true;
    const input: OperationalRulesInput = {
      waterDistance: "acima_150",
      operationType: "Trabalho no campo",
      terrain: "normal",
    };

    expect(hasNoForbiddenInputKeys).toBe(true);
    expect(Object.keys(input).sort()).toEqual([
      "operationType",
      "terrain",
      "waterDistance",
    ]);
  });

  test("mantém paridade exata nas 96 combinações da escala legada", () => {
    const water = {
      acima_150: 0,
      "100_150": 6,
      "50_100": 12,
      abaixo_50: 18,
    } as const;
    const operation = {
      "Trabalho no campo": 6,
      Transporte: 9,
      Pulverização: 8,
      Colheita: 8,
      "Deslocamento interno": 4,
      "Operação próxima de água": 15,
    } as const;
    const terrain = {
      normal: 0,
      umido: 7,
      critico: 13,
      baixa_aderencia: 15,
    } as const;
    let combinations = 0;

    for (const [waterDistance, waterPoints] of Object.entries(water)) {
      for (const [operationType, operationPoints] of Object.entries(operation)) {
        for (const [terrainType, terrainPoints] of Object.entries(terrain)) {
          const legacyScore = Math.round(
            ((waterPoints + operationPoints + terrainPoints) / 48) * 100,
          );
          const result = evaluateOperationalRulesV2({
            waterDistance: waterDistance as OperationalRulesInput["waterDistance"],
            operationType: operationType as OperationalRulesInput["operationType"],
            terrain: terrainType as OperationalRulesInput["terrain"],
          });
          expect(result.operationalRulesScore).toBe(legacyScore);
          combinations += 1;
        }
      }
    }

    expect(combinations).toBe(96);
  });
});