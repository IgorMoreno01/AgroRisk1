import { describe, expect, test } from "bun:test";
import { operations } from "../src/lib/mock-data";
import {
  fleetMachinesAtRisk,
  inputsForOperation,
  riskResultForArea,
  riskResultForClient,
  riskResultForMachine,
  riskResultForOperation,
} from "../src/lib/risk-score";

const operation = operations.find((item) => item.id === "OP-1001");
if (!operation) throw new Error("Baseline OP-1001 não encontrada nos mocks V1.");

describe("Risk Engine V1 — operação", () => {
  test("congela os inputs derivados de OP-1001", () => {
    expect(inputsForOperation(operation)).toEqual({
      weather: "normal",
      waterDistance: "50_100",
      operationType: "Trabalho no campo",
      historyAlertCount: 1,
      inclinationDegrees: 18,
      terrain: "umido",
    });
  });

  test("congela o resultado de OP-1001", () => {
    expect(riskResultForOperation(operation)).toMatchObject({
      climateScore: 15,
      operationalScore: 48,
      climateContribution: 7.5,
      operationalContribution: 24,
      finalScore: 32,
      level: "baixo",
      dominantFactor: "operational",
      breakdown: {
        total: 32,
        mainFactor: "Proximidade de água",
      },
    });
  });
});

describe("Risk Engine V1 — agregações", () => {
  test("congela o resultado da máquina MQ-001", () => {
    expect(riskResultForMachine("MQ-001")).toMatchObject({
      climateScore: 15,
      operationalScore: 48,
      climateContribution: 7.5,
      operationalContribution: 24,
      finalScore: 32,
      level: "baixo",
      dominantFactor: "operational",
      breakdown: {
        total: 32,
        mainFactor: "Proximidade de água",
      },
    });
  });

  test("congela o resultado da área AR-01", () => {
    expect(riskResultForArea("AR-01")).toMatchObject({
      climateScore: 56,
      operationalScore: 47,
      climateContribution: 28.1,
      operationalContribution: 23.3,
      finalScore: 52,
      level: "medio",
      dominantFactor: "operational",
      breakdown: {
        total: 39,
        mainFactor: "Proximidade de água",
      },
    });
  });

  test("congela o resultado do cliente CL-01", () => {
    expect(riskResultForClient("CL-01")).toMatchObject({
      climateScore: 52,
      operationalScore: 55,
      climateContribution: 25.8,
      operationalContribution: 27.5,
      finalScore: 54,
      level: "medio",
      dominantFactor: "operational",
      breakdown: {
        total: 43,
        mainFactor: "Proximidade de água",
      },
    });
  });

  test("congela as contagens atuais de fleetMachinesAtRisk", () => {
    expect(fleetMachinesAtRisk()).toBe(0);
    expect(fleetMachinesAtRisk({ climate: 50, operational: 50 })).toBe(1);
  });
});