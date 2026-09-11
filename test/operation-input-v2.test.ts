import { describe, expect, test } from "bun:test";
import {
  buildOperationRiskV2EvaluationInput,
  evaluateOperationRiskV2,
  type OperationRiskRelationalContext,
} from "../src/lib/risk-engine-v2/operation-input.server";
import { buildAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";

const context: OperationRiskRelationalContext = {
  source: "postgres",
  client: {
    id: "CL-REAL", name: "Cliente Real", city: "Cidade Cliente", state: "MT",
    location: "Cidade Cliente / MT", mainOperation: "Agrícola", machineCount: 1,
    machines: 1, avgScore: 99, level: "alto",
  },
  farm: { id: "FA-REAL", name: "Fazenda Real", municipality: "Sorriso", state: "GO" },
  area: {
    id: "AR-REAL", name: "Talhão 1", clientId: "CL-REAL", client: "Cliente Real",
    type: "Campo aberto", condition: "", nearWater: "baixa", envRisk: "baixo",
    score: 95, crop: "Soja", hectares: 100,
  },
  machine: {
    id: "MQ-REAL", code: "M-1", name: "Máquina 1", model: "Modelo X", type: "Trator",
    clientId: "CL-REAL", client: "Cliente Real", areaId: "AR-REAL", area: "Talhão 1",
    operatorId: "OPR-REAL", operator: "Operador", status: "ativa", score: 95,
    level: "alto", lastAlert: "", lastUpdate: "",
  },
  operation: {
    id: "OP-REAL", machineId: "MQ-REAL", machine: "MQ-REAL", operatorId: "OPR-REAL",
    clientId: "CL-REAL", areaId: "AR-REAL", area: "Talhão 1", type: "Colheita",
    scheduledAt: "2026-09-10T13:45:00.000Z", start: "13:45", duration: "2h",
    status: "Em andamento", score: 99, factors: [], recommendationId: "",
  },
};

describe("mapper central operação PostgreSQL → Risk Engine V2", () => {
  test("usa data, UF da fazenda e tipo da operação", () => {
    const mapped = buildOperationRiskV2EvaluationInput(context, { ml: 70, operationalRules: 30 });
    expect(mapped.input.mlInput.DT_REFERENCIA).toBe("2026-09-10");
    expect(mapped.input.mlInput.UF).toBe("GO");
    expect(mapped.input.operationalRulesInput.operationType).toBe("Colheita");
  });

  test("preserva ausentes como null para a imputação oficial", () => {
    const mapped = buildOperationRiskV2EvaluationInput(context, { ml: 70, operationalRules: 30 });
    expect(mapped.input.mlInput.COD_MOD).toBeNull();
    expect(mapped.input.mlInput.PRECIPITACAO_D1_MM).toBeNull();
    expect(mapped.input.mlInput.ALTITUDE_ML_M).toBeNull();
    expect(mapped.input.mlInput.HIST_ITEM_SAFE_N_TOTAL).toBeNull();
    expect(mapped.provenance.ml.COD_MOD).toBe("missing_imputed");
  });

  test("marca água e terreno determinísticos como synthetic_demo", () => {
    const first = buildOperationRiskV2EvaluationInput(context, { ml: 70, operationalRules: 30 });
    const second = buildOperationRiskV2EvaluationInput(context, { ml: 70, operationalRules: 30 });
    expect(first.input).toEqual(second.input);
    expect(first.provenance.operationalRules.waterDistance).toBe("synthetic_demo");
    expect(first.provenance.operationalRules.terrain).toBe("synthetic_demo");
  });

  test("nível vem do motor e pesos Sompo continuam aplicados", () => {
    const evaluation = evaluateOperationRiskV2(context, { ml: 40, operationalRules: 60 });
    expect(evaluation.result.weights).toEqual({ ml: 40, operationalRules: 60 });
    expect(evaluation.result.level).toMatch(/^(baixo|medio|alto)$/);
    expect(evaluation.input).not.toHaveProperty("level");
    expect(evaluation.result.finalScore).not.toBe(context.operation.score);
    expect(JSON.stringify(evaluation)).not.toContain("sampleProbabilityInternal");
  });

  test("carteira mista omite máquina sem operação sem degradar as avaliações válidas", () => {
    const orphan = {
      ...context.machine,
      id: "MQ-SEM-OPERACAO",
      code: "M-2",
    };
    const snapshot = buildAdminDashboardSnapshot({
      clients: [context.client],
      areas: [context.area],
      machines: [context.machine, orphan],
      operations: [context.operation],
      alerts: [],
      riskContexts: [context],
    }, "postgres", false, { ml: 70, operationalRules: 30 });
    expect(snapshot.machineRows.map((row) => row.machine.id)).toEqual(["MQ-REAL"]);
    expect(snapshot.areaRows).toHaveLength(1);
    expect(snapshot.clientRows).toHaveLength(1);
    expect(snapshot.degraded).toBeFalse();
  });
});