import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import {
  closePostgresRepository,
  postgresRepository,
} from "../src/lib/data/postgres-repository.server";
import type { AgroRiskRepository } from "../src/lib/data/repository";
import type { Alert, HistoryEntry } from "../src/lib/mock-data";
import { loadOperadorDashboardSnapshot } from "../src/lib/operador-dashboard.server";

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

const repositoryWithRecords = (
  alerts: Alert[],
  history: HistoryEntry[],
): AgroRiskRepository => ({
  ...mockRepository,
  listAlerts: async () => alerts,
  listOperationHistory: async () => history,
});

describe("Migração do Operador para PostgreSQL", () => {
  test("carrega somente o contexto individual do operador determinístico", async () => {
    const snapshot = await loadOperadorDashboardSnapshot(
      "OPR-001", postgresRepository, mockRepository,
    );
    expect(snapshot.source).toBe("postgres");
    expect(snapshot.operator.id).toBe("OPR-001");
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
    const snapshot = await loadOperadorDashboardSnapshot("USR-OP-1", mockRepository, mockRepository);
    expect(snapshot.operation.score).not.toBe(snapshot.risk.finalScore);
    expect(snapshot.machine.score).not.toBe(snapshot.risk.finalScore);
    expect(snapshot.recommendation.factor).toBe(snapshot.mainFactor);
    expect(snapshot.nextAction.factor).toBe(snapshot.mainFactor);
    expect(snapshot.recommendation.rationale).toContain(`Score ${snapshot.risk.finalScore}/100`);
    expect(snapshot.weights.climate + snapshot.weights.operational).toBe(100);
  });

  test("mantém inclinação sintética separada do resultado de risco", async () => {
    const snapshot = await loadOperadorDashboardSnapshot("USR-OP-1", mockRepository, mockRepository);
    expect(snapshot.telemetry.source).toBe("synthetic");
    expect(snapshot.risk).not.toHaveProperty("inclinationDegrees");
    expect(snapshot.telemetryRecommendations.every((item) => item.factor === "Inclinação")).toBe(true);
    expect(snapshot.recommendation.factor).not.toBe("Inclinação");
  });

  test("faz fallback integral para o repositório mock", async () => {
    const snapshot = await loadOperadorDashboardSnapshot("USR-OP-1", failingRepository, mockRepository);
    expect(snapshot.source).toBe("mock");
    expect(snapshot.degraded).toBe(true);
    expect(snapshot.operator.id).toBe("USR-OP-1");
    expect(snapshot.operation.operatorId).toBe(snapshot.operator.id);
    expect(snapshot.alertsSource).toBe("demo");
    expect(snapshot.historySource).toBe("demo");
  });

  test("gera alertas e histórico demo determinísticos quando as consultas retornam vazias", async () => {
    const repository = repositoryWithRecords([], []);
    const first = await loadOperadorDashboardSnapshot("USR-OP-1", repository, mockRepository);
    const second = await loadOperadorDashboardSnapshot("USR-OP-1", repository, mockRepository);

    expect(first.alertsSource).toBe("demo");
    expect(first.historySource).toBe("demo");
    expect(first.alerts).toHaveLength(3);
    expect(first.history).toHaveLength(4);
    expect(first.alerts.every((item) =>
      item.source === "demo" &&
      item.operationId === first.operation.id &&
      item.machineId === first.machine.id
    )).toBe(true);
    expect(first.history.every((item) =>
      item.source === "demo" &&
      item.operationId === first.operation.id &&
      item.machineId === first.machine.id &&
      item.score === 0
    )).toBe(true);
    expect(second.alerts).toEqual(first.alerts);
    expect(second.history).toEqual(first.history);
    expect(second.risk).toEqual(first.risk);
  });

  test("preserva registros reais sem misturar dados demo nem alterar o score", async () => {
    const context = await loadOperadorDashboardSnapshot(
      "USR-OP-1",
      repositoryWithRecords([], []),
      mockRepository,
    );
    const realAlert: Alert = {
      id: "REAL-ALERT-1",
      machineId: context.machine.id,
      machine: context.machine.id,
      operationId: context.operation.id,
      type: "Alerta PostgreSQL",
      criticality: "alta",
      level: "alto",
      message: "Registro real persistido.",
      mainFactor: "Clima",
      status: "aberto",
      datetime: context.operation.scheduledAt,
      time: "08:50",
    };
    const realHistory: HistoryEntry = {
      id: "REAL-HISTORY-1",
      date: context.operation.scheduledAt,
      machineId: context.machine.id,
      operationId: context.operation.id,
      summary: "Histórico real persistido.",
      score: 0,
    };
    const snapshot = await loadOperadorDashboardSnapshot(
      "USR-OP-1",
      repositoryWithRecords([realAlert], [realHistory]),
      mockRepository,
    );

    expect(snapshot.alertsSource).toBe("postgres");
    expect(snapshot.historySource).toBe("postgres");
    expect(snapshot.alerts).toHaveLength(1);
    expect(snapshot.history).toHaveLength(1);
    expect(snapshot.alerts[0]).toMatchObject({ id: realAlert.id, source: "postgres" });
    expect(snapshot.history[0]).toMatchObject({ id: realHistory.id, source: "postgres" });
    expect(snapshot.alerts.some((item) => item.id.includes("demo"))).toBe(false);
    expect(snapshot.history.some((item) => item.id.includes("demo"))).toBe(false);
    expect(snapshot.risk).toEqual(context.risk);
    expect(snapshot.mainFactor).toBe(context.mainFactor);
    expect(snapshot.recommendation).toEqual(context.recommendation);
    expect(snapshot.weights).toEqual(context.weights);
  });

  test("mantém igualdade com o Admin para a operação e máquina compartilhadas", async () => {
    const [operator, admin] = await Promise.all([
      loadOperadorDashboardSnapshot("USR-OP-1", mockRepository, mockRepository),
      loadAdminDashboardSnapshot(mockRepository, mockRepository),
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
    expect(source).toContain("riskSnapshot?.risk");
    expect(source).toContain("riskSnapshot?.nextAction");
    expect(source).toContain("evaluateOperadorRisk");
    expect(source).not.toContain("<PersonaV2RiskPanel");
    expect(source).not.toContain("getProfileAlerts");
    expect(source).not.toContain("setInterval");
    const panelSource = readFileSync(
      new URL("../src/components/persona-v2-risk-panel.tsx", import.meta.url),
      "utf8",
    );
    expect(panelSource).not.toContain("getRiskEngineV2DemoResult");
    expect(panelSource).not.toContain("evaluateRiskEngineV2Demo");
  });

  test("contexto relacional não exige que a atribuição atual da máquina repita o operador histórico", () => {
    const repositorySource = readFileSync(
      new URL("../src/lib/data/postgres-repository.server.ts", import.meta.url),
      "utf8",
    );
    expect(repositorySource).not.toContain("m.operator_id = o.operator_id");
  });
});