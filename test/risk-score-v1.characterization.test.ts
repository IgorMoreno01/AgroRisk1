import { describe, expect, test } from "bun:test";
import { riskFromScore } from "../src/lib/mock-data";
import {
  calculateScore,
  calculateWeightedRisk,
  DEFAULT_RISK_WEIGHTS,
  type RiskInputs,
} from "../src/lib/risk-score";

const minimum: RiskInputs = {
  weather: "normal",
  waterDistance: "acima_150",
  operationType: "Deslocamento interno",
  historyAlertCount: 0,
  inclinationDegrees: 0,
  terrain: "normal",
};

const intermediate: RiskInputs = {
  weather: "moderada",
  waterDistance: "50_100",
  operationType: "Transporte",
  historyAlertCount: 2,
  inclinationDegrees: 10,
  terrain: "umido",
};

const elevated: RiskInputs = {
  weather: "forte",
  waterDistance: "abaixo_50",
  operationType: "Operação próxima de água",
  historyAlertCount: 3,
  inclinationDegrees: 30,
  terrain: "baixa_aderencia",
};

describe("Risk Engine V1 — calculateScore", () => {
  test("congela o cenário mínimo atual", () => {
    expect(calculateScore(minimum)).toEqual({
      total: 7,
      level: "baixo",
      mainFactor: "Tipo de operação",
      parts: [
        { category: "Clima", label: "Clima", detail: "Sem chuva", points: 3, max: 20 },
        { category: "Proximidade de água", label: "Proximidade de água", detail: "Acima de 150 m", points: 0, max: 18 },
        { category: "Tipo de operação", label: "Tipo de operação", detail: "Deslocamento interno", points: 4, max: 15 },
        { category: "Histórico operacional", label: "Histórico operacional", detail: "0 alerta(s) anterior(es)", points: 0, max: 12 },
        { category: "Condição do terreno", label: "Condição do terreno", detail: "Terreno normal", points: 0, max: 15 },
      ],
    });
  });

  test("congela o cenário intermediário atual", () => {
    expect(calculateScore(intermediate)).toEqual({
      total: 50,
      level: "medio",
      mainFactor: "Clima",
      parts: [
        { category: "Clima", label: "Clima", detail: "Chuva moderada", points: 14, max: 20 },
        { category: "Proximidade de água", label: "Proximidade de água", detail: "Entre 50 e 100 m", points: 12, max: 18 },
        { category: "Tipo de operação", label: "Tipo de operação", detail: "Transporte", points: 9, max: 15 },
        { category: "Histórico operacional", label: "Histórico operacional", detail: "2 alerta(s) anterior(es)", points: 8, max: 12 },
        { category: "Condição do terreno", label: "Condição do terreno", detail: "Solo úmido", points: 7, max: 15 },
      ],
    });
  });

  test("congela o cenário elevado atual", () => {
    expect(calculateScore(elevated)).toEqual({
      total: 80,
      level: "alto",
      mainFactor: "Clima",
      parts: [
        { category: "Clima", label: "Clima", detail: "Chuva forte", points: 20, max: 20 },
        { category: "Proximidade de água", label: "Proximidade de água", detail: "Abaixo de 50 m", points: 18, max: 18 },
        { category: "Tipo de operação", label: "Tipo de operação", detail: "Operação próxima de água", points: 15, max: 15 },
        { category: "Histórico operacional", label: "Histórico operacional", detail: "3 alerta(s) anterior(es)", points: 12, max: 12 },
        { category: "Condição do terreno", label: "Condição do terreno", detail: "Baixa aderência", points: 15, max: 15 },
      ],
    });
  });

  test("mantém inclinação fora do score principal", () => {
    const stable = calculateScore({ ...intermediate, inclinationDegrees: 0 });
    const critical = calculateScore({ ...intermediate, inclinationDegrees: 90 });
    expect(critical).toEqual(stable);
  });
});

describe("Risk Engine V1 — calculateWeightedRisk", () => {
  const breakdown = calculateScore(intermediate);

  test("congela pesos 0/100", () => {
    expect(calculateWeightedRisk(breakdown, { climate: 0, operational: 100 })).toMatchObject({
      climateScore: 70,
      operationalScore: 60,
      climateContribution: 0,
      operationalContribution: 60,
      finalScore: 60,
      level: "medio",
      dominantFactor: "operational",
    });
  });

  test("congela pesos 50/50", () => {
    expect(calculateWeightedRisk(breakdown, { climate: 50, operational: 50 })).toMatchObject({
      climateScore: 70,
      operationalScore: 60,
      climateContribution: 35,
      operationalContribution: 30,
      finalScore: 65,
      level: "medio",
      dominantFactor: "climate",
    });
  });

  test("congela pesos 100/0", () => {
    expect(calculateWeightedRisk(breakdown, { climate: 100, operational: 0 })).toMatchObject({
      climateScore: 70,
      operationalScore: 60,
      climateContribution: 70,
      operationalContribution: 0,
      finalScore: 70,
      level: "medio",
      dominantFactor: "climate",
    });
  });

  test("registra empate natural como balanced", () => {
    expect(calculateWeightedRisk(calculateScore(elevated), DEFAULT_RISK_WEIGHTS)).toMatchObject({
      climateScore: 100,
      operationalScore: 100,
      climateContribution: 50,
      operationalContribution: 50,
      finalScore: 100,
      level: "alto",
      dominantFactor: "balanced",
    });
  });

  test("mantém o default V1 em 50/50", () => {
    expect(DEFAULT_RISK_WEIGHTS).toEqual({ climate: 50, operational: 50 });
  });
});

describe("Risk Engine V1 — thresholds centrais", () => {
  test.each([
    [0, "baixo"],
    [40, "baixo"],
    [41, "medio"],
    [70, "medio"],
    [71, "alto"],
    [100, "alto"],
  ] as const)("classifica %i como %s", (score, expected) => {
    expect(riskFromScore(score)).toBe(expected);
  });
});