import { describe, expect, test } from "bun:test";
import {
  readRiskEngineMode,
  resolveRiskEngineMode,
} from "../src/lib/risk-engine/engine-mode.server";

describe("Risk Engine · resolução da feature flag server-side", () => {
  test("usa V1 quando a flag está ausente ou vazia", () => {
    expect(resolveRiskEngineMode()).toBe("v1");
    expect(resolveRiskEngineMode("")).toBe("v1");
    expect(resolveRiskEngineMode("   ")).toBe("v1");
  });

  test("usa V1 para valores negativos explícitos", () => {
    expect(resolveRiskEngineMode("false")).toBe("v1");
    expect(resolveRiskEngineMode("0")).toBe("v1");
    expect(resolveRiskEngineMode("no")).toBe("v1");
    expect(resolveRiskEngineMode("FALSE")).toBe("v1");
  });

  test("usa V2 somente para true, 1 ou yes", () => {
    expect(resolveRiskEngineMode("true")).toBe("v2");
    expect(resolveRiskEngineMode("1")).toBe("v2");
    expect(resolveRiskEngineMode("yes")).toBe("v2");
  });

  test("resolve valores de V2 sem diferenciar caixa e ignora espaços", () => {
    expect(resolveRiskEngineMode("TRUE")).toBe("v2");
    expect(resolveRiskEngineMode("YeS")).toBe("v2");
    expect(resolveRiskEngineMode(" yes ")).toBe("v2");
  });

  test("lê USE_ML_RISK_ENGINE no momento de cada chamada server-side", () => {
    const previousValue = process.env["USE_ML_RISK_ENGINE"];

    try {
      delete process.env["USE_ML_RISK_ENGINE"];
      expect(readRiskEngineMode()).toBe("v1");

      process.env["USE_ML_RISK_ENGINE"] = "YES";
      expect(readRiskEngineMode()).toBe("v2");

      process.env["USE_ML_RISK_ENGINE"] = "false";
      expect(readRiskEngineMode()).toBe("v1");
    } finally {
      if (previousValue === undefined) {
        delete process.env["USE_ML_RISK_ENGINE"];
      } else {
        process.env["USE_ML_RISK_ENGINE"] = previousValue;
      }
    }
  });
});