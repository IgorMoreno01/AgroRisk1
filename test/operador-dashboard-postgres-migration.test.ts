import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import { closePostgresRepository } from "../src/lib/data/postgres-repository.server";
import type { AgroRiskRepository } from "../src/lib/data/repository";
import {
  DEMO_OPERATOR_ID,
  loadOperadorDashboardSnapshot,
} from "../src/lib/operador-dashboard.server";

const failure = async () => {
  throw new Error("database unavailable");
};

const failingRepository: AgroRiskRepository = {
  listClients: failure,
  listAreas: failure,
  listMachines: failure,
  listOperations: failure,
  listAlerts: failure,
  listOperationHistory: failure,
  getClient: failure,
  getArea: failure,
  getMachine: failure,
  getOperation: failure,
};

describe("Migração do Operador para PostgreSQL", () => {
  test("carrega somente o contexto individual do operador determinístico", async () => {
    const snapshot = await loadOperadorDashboardSnapshot();
    expect(snapshot.source).toBe("postgres");
    expect(snapshot.operator.id).toBe(DEMO_OPERATOR_ID);
    expect(snapshot.operation.operatorId).toBe(snapshot.operator.id);
    expect(snapshot.machine.operatorId).toBe(snapshot.operator.id);
    expect(snapshot.operation.machineId).toBe(snapshot.machine.id);
    expect(snapshot.operation.areaId).toBe(snapshot.area.id);
    expect(snapshot.operation.clientId).toBe(snapshot.client.id);
    expect(snapshot.area.condition).not.toBe("");
    expect(snapshot.alerts.every((alert) =>
      alert.operationId === snapshot.operation.id && alert.machineId === snapshot.machine.id
    )).toBe(true);
    expect(snapshot.history.every((entry) => entry.machineId === snapshot.machine.id)).toBe(true);
    await closePostgresRepository();
  });

  test("ignora scores persistidos e mantém risco e recomendação na mesma origem V2", async () => {
    const snapshot = await loadOperadorDashboardSnapshot(mockRepository, mockRepository);
    expect(snapshot.operation.score).not.toBe(snapshot.risk.finalScore);
    expect(snapshot.machine.score).not.toBe(snapshot.risk.finalScore);
    expect(snapshot.recommendation.factor).toBe(snapshot.mainFactor);
    expect(snapshot.nextAction.factor).toBe(snapshot.mainFactor);
    expect(snapshot.recommendation.rationale).toContain(`Score ${snapshot.risk.finalScore}/100`);
    expect(snapshot.weights.climate + snapshot.weights.operational).toBe(100);
  });

  test("mantém inclinação sintética separada do resultado de risco", async () => {
    const snapshot = await loadOperadorDashboardSnapshot(mockRepository, mockRepository);
    expect(snapshot.telemetry.source).toBe("synthetic");
    expect(snapshot.risk).not.toHaveProperty("inclinationDegrees");
    expect(snapshot.telemetryRecommendations.every((item) => item.factor === "Inclinação")).toBe(true);
    expect(snapshot.recommendation.factor).not.toBe("Inclinação");
  });

  test("faz fallback integral para o repositório mock", async () => {
    const snapshot = await loadOperadorDashboardSnapshot(failingRepository, mockRepository);
    expect(snapshot.source).toBe("mock");
    expect(snapshot.degraded).toBe(true);
    expect(snapshot.operator.id).toBe("USR-OP-1");
    expect(snapshot.operation.operatorId).toBe(snapshot.operator.id);
    expect(snapshot.alertsSource).toBe("demo");
  });

  test("mantém igualdade com o Admin para a operação e máquina compartilhadas", async () => {
    const [operator, admin] = await Promise.all([
      loadOperadorDashboardSnapshot(),
      loadAdminDashboardSnapshot(),
    ]);
    const adminOperation = admin.operationRows.find((row) => row.operation.id === operator.operation.id);
    const adminMachine = admin.machineRows.find((row) => row.machine.id === operator.machine.id);
    expect(adminOperation).toBeDefined();
    expect(adminMachine).toBeDefined();
    expect(operator.risk.finalScore).toBe(adminOperation!.score);
    expect(operator.risk.finalScore).toBe(adminMachine!.score);
    expect(operator.mainFactor).toBe(adminOperation!.mainFactor);
    expect(operator.mainFactor).toBe(adminMachine!.mainFactor);
    expect(operator.weights).toEqual({
      climate: admin.weights.ml,
      operational: admin.weights.operationalRules,
    });
    await closePostgresRepository();
  });

  test("não recalcula risco nem acessa arrays relacionais mock na tela", () => {
    const source = readFileSync(new URL("../src/routes/operador.tsx", import.meta.url), "utf8");
    expect(source).toContain("getOperadorDashboard");
    expect(source).not.toContain("operationsByOperator");
    expect(source).not.toContain("riskResultForOperation");
    expect(source).not.toContain("recommendationsForOperation");
    expect(source).toContain("<PersonaV2RiskPanel");
    expect(source).toContain("result={snapshot.engineResult}");
    expect(source).not.toContain("getProfileAlerts");
    expect(source).not.toContain("setInterval");
    const panelSource = readFileSync(
      new URL("../src/components/persona-v2-risk-panel.tsx", import.meta.url),
      "utf8",
    );
    expect(panelSource).toContain("providedResult ?? getRiskEngineV2DemoResult(mlWeight)");
  });
});