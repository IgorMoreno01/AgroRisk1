import { describe, expect, test } from "bun:test";
import { combineRiskEngineV2 } from "../src/lib/risk-engine-v2/combine-scores";
import type {
  MlRiskComponentContribution,
  MlRiskResult,
  OperationalRuleFactor,
  OperationalRulesResult,
  RiskEngineV2Input,
  RiskEngineV2Weights,
} from "../src/lib/risk-engine-v2/types";

const mlResult = (
  mlRelativeScore: number,
  components: MlRiskComponentContribution[] = [],
): MlRiskResult => ({
  modelVersion: "test",
  mlRelativeScore,
  components,
});

const operationalResult = (
  operationalRulesScore: number,
  factors: OperationalRuleFactor[] = [],
): OperationalRulesResult => ({
  rulesVersion: "test",
  operationalRulesScore,
  factors,
});

const input = (
  mlRelativeScore: number,
  operationalRulesScore: number,
  weights: RiskEngineV2Weights,
): RiskEngineV2Input => ({
  ml: mlResult(mlRelativeScore),
  operationalRules: operationalResult(operationalRulesScore),
  weights,
});

describe("Risk Engine V2 · composição isolada", () => {
  test("compõe scores com pesos 70/30 sem arredondar contribuições", () => {
    const result = combineRiskEngineV2(input(37, 48, {
      ml: 70,
      operationalRules: 30,
    }));

    expect(result.engineVersion).toBe("2.0");
    expect(result.contributions).toEqual([
      {
        component: "ml",
        sourceScore: 37,
        weight: 70,
        weightedContribution: 25.9,
      },
      {
        component: "operational_rules",
        sourceScore: 48,
        weight: 30,
        weightedContribution: 14.4,
      },
    ]);
    expect(result.finalScore).toBe(40);
    expect(result.level).toBe("baixo");
    expect(result.dominantComponent).toBe("ml");
  });

  test("compõe scores com pesos 50/50", () => {
    const result = combineRiskEngineV2(input(80, 20, {
      ml: 50,
      operationalRules: 50,
    }));

    expect(result.contributions.map((item) => item.weightedContribution)).toEqual([
      40,
      10,
    ]);
    expect(result.finalScore).toBe(50);
    expect(result.level).toBe("medio");
    expect(result.dominantComponent).toBe("ml");
  });

  test("aceita composição 100/0", () => {
    const result = combineRiskEngineV2(input(37, 100, {
      ml: 100,
      operationalRules: 0,
    }));

    expect(result.contributions.map((item) => item.weightedContribution)).toEqual([
      37,
      0,
    ]);
    expect(result.finalScore).toBe(37);
    expect(result.dominantComponent).toBe("ml");
  });

  test("aceita composição 0/100", () => {
    const result = combineRiskEngineV2(input(100, 48, {
      ml: 0,
      operationalRules: 100,
    }));

    expect(result.contributions.map((item) => item.weightedContribution)).toEqual([
      0,
      48,
    ]);
    expect(result.finalScore).toBe(48);
    expect(result.dominantComponent).toBe("operational_rules");
  });

  test("classifica contribuições iguais como balanced", () => {
    const result = combineRiskEngineV2(input(60, 60, {
      ml: 50,
      operationalRules: 50,
    }));

    expect(result.contributions.map((item) => item.weightedContribution)).toEqual([
      30,
      30,
    ]);
    expect(result.dominantComponent).toBe("balanced");
  });

  test("preserva os thresholds centrais do V2", () => {
    const cases = [
      [0, "baixo"],
      [40, "baixo"],
      [41, "medio"],
      [70, "medio"],
      [71, "alto"],
      [100, "alto"],
    ] as const;

    for (const [score, expectedLevel] of cases) {
      expect(
        combineRiskEngineV2(input(score, score, {
          ml: 50,
          operationalRules: 50,
        })).level,
      ).toBe(expectedLevel);
    }
  });

  test("rejeita pesos cuja soma não seja 100", () => {
    expect(() =>
      combineRiskEngineV2(input(50, 50, {
        ml: 70,
        operationalRules: 40,
      })),
    ).toThrow("devem somar 100");
  });

  test("rejeita peso negativo ou acima de 100", () => {
    expect(() =>
      combineRiskEngineV2(input(50, 50, {
        ml: -1,
        operationalRules: 101,
      })),
    ).toThrow("Peso ML deve estar entre 0 e 100");
    expect(() =>
      combineRiskEngineV2(input(50, 50, {
        ml: 101,
        operationalRules: -1,
      })),
    ).toThrow("Peso ML deve estar entre 0 e 100");
  });

  test("rejeita score ML fora do intervalo 0–100", () => {
    expect(() =>
      combineRiskEngineV2(input(-1, 50, {
        ml: 50,
        operationalRules: 50,
      })),
    ).toThrow("Score ML deve estar entre 0 e 100");
    expect(() =>
      combineRiskEngineV2(input(101, 50, {
        ml: 50,
        operationalRules: 50,
      })),
    ).toThrow("Score ML deve estar entre 0 e 100");
  });

  test("rejeita score de regras fora do intervalo 0–100", () => {
    expect(() =>
      combineRiskEngineV2(input(50, -1, {
        ml: 50,
        operationalRules: 50,
      })),
    ).toThrow("Score das regras operacionais deve estar entre 0 e 100");
    expect(() =>
      combineRiskEngineV2(input(50, 101, {
        ml: 50,
        operationalRules: 50,
      })),
    ).toThrow("Score das regras operacionais deve estar entre 0 e 100");
  });

  test("rejeita NaN e Infinity em pesos ou scores", () => {
    expect(() =>
      combineRiskEngineV2(input(50, 50, {
        ml: Number.NaN,
        operationalRules: 50,
      })),
    ).toThrow("Peso ML deve ser um número finito");
    expect(() =>
      combineRiskEngineV2(input(Number.POSITIVE_INFINITY, 50, {
        ml: 50,
        operationalRules: 50,
      })),
    ).toThrow("Score ML deve ser um número finito");
    expect(() =>
      combineRiskEngineV2(input(50, Number.NEGATIVE_INFINITY, {
        ml: 50,
        operationalRules: 50,
      })),
    ).toThrow("Score das regras operacionais deve ser um número finito");
  });

  test("converte, filtra e ordena drivers de forma determinística", () => {
    const mlComponents: MlRiskComponentContribution[] = [
      {
        component: "climate",
        contribution: 2,
        direction: "increase",
        label: "Clima",
      },
      {
        component: "structure",
        contribution: -5,
        direction: "decrease",
        label: "Estrutura",
      },
      {
        component: "history",
        contribution: 5,
        direction: "increase",
        label: "Histórico",
      },
    ];
    const factors: OperationalRuleFactor[] = [
      {
        id: "water_proximity",
        category: "water_proximity",
        label: "Água",
        points: 12,
        maxPoints: 18,
        active: true,
      },
      {
        id: "operation_type",
        category: "operation_type",
        label: "Operação",
        points: 0,
        maxPoints: 15,
        active: false,
      },
      {
        id: "terrain",
        category: "terrain",
        label: "Terreno",
        points: 12,
        maxPoints: 15,
        active: true,
      },
    ];
    const result = combineRiskEngineV2({
      ml: mlResult(20, mlComponents),
      operationalRules: operationalResult(80, factors),
      weights: { ml: 50, operationalRules: 50 },
    });

    expect(result.dominantComponent).toBe("operational_rules");
    expect(result.drivers.map((driver) => driver.code)).toEqual([
      "water_proximity",
      "terrain",
      "structure",
      "history",
      "climate",
    ]);
    expect(result.drivers).not.toContainEqual(
      expect.objectContaining({ code: "operation_type" }),
    );
    expect(result.drivers[2]).toEqual({
      source: "ml",
      code: "structure",
      label: "Estrutura",
      contribution: -5,
      direction: "decrease",
    });
    expect(result.drivers[0]).not.toHaveProperty("direction");
  });

  test("mantém drivers de ML primeiro quando balanced", () => {
    const result = combineRiskEngineV2({
      ml: mlResult(50, [
        {
          component: "climate",
          contribution: 1,
          direction: "neutral",
          label: "Clima",
        },
      ]),
      operationalRules: operationalResult(50, [
        {
          id: "terrain",
          category: "terrain",
          label: "Terreno",
          points: 13,
          maxPoints: 15,
          active: true,
        },
      ]),
      weights: { ml: 50, operationalRules: 50 },
    });

    expect(result.dominantComponent).toBe("balanced");
    expect(result.drivers.map((driver) => driver.source)).toEqual([
      "ml",
      "operational_rules",
    ]);
  });
});