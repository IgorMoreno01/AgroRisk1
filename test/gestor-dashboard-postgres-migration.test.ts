import { describe, expect, test } from "bun:test";
import { loadAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import { loadGestorDashboardSnapshot } from "../src/lib/gestor-dashboard.server";
import type { AgroRiskRepository } from "../src/lib/data/repository";

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
const scope = { userId: "GST-TEST", clientIds: ["CL-01", "CL-02", "CL-03"] };

describe("Migração do Gestor para PostgreSQL", () => {
  test("aplica escopo determinístico e mantém todas as relações dos clientes selecionados", async () => {
    const snapshot = await loadGestorDashboardSnapshot(scope, mockRepository, mockRepository);
    const scopedIds = new Set(snapshot.clients.map((client) => client.id));

    expect(snapshot.clients.map((client) => client.id)).toEqual(["CL-01", "CL-02", "CL-03"]);
    expect(snapshot.machineRows.every((row) => scopedIds.has(row.machine.clientId))).toBe(true);
    expect(snapshot.areaRows.every((row) => scopedIds.has(row.area.clientId))).toBe(true);
    expect(snapshot.operationRows.every((row) => scopedIds.has(row.operation.clientId))).toBe(true);
  });

  test("ignora scores persistidos e deriva recomendação do mesmo fator calculado", async () => {
    const snapshot = await loadGestorDashboardSnapshot(scope, mockRepository, mockRepository);
    expect(snapshot.machineRows.some((row) => row.score !== row.machine.score)).toBe(true);
    expect(snapshot.machineRows.every((row) => row.recommendation.factor === row.mainFactor)).toBe(true);
    expect(snapshot.machineRows.every((row) => row.score > 0)).toBe(true);
  });

  test("faz somente quatro leituras paralelas no carregamento inicial", async () => {
    let calls = 0;
    let active = 0;
    let peak = 0;
    const wrap = <T>(fn: () => Promise<T>) => async () => {
      calls += 1;
      active += 1;
      peak = Math.max(peak, active);
      await Bun.sleep(5);
      const value = await fn();
      active -= 1;
      return value;
    };
    const repository: AgroRiskRepository = {
      ...mockRepository,
      listClients: wrap(() => mockRepository.listClients()),
      listAreas: wrap(() => mockRepository.listAreas()),
      listMachines: wrap(() => mockRepository.listMachines()),
      listOperations: wrap(() => mockRepository.listOperations()),
    };

    await loadGestorDashboardSnapshot(scope, repository, mockRepository);
    expect(calls).toBe(4);
    expect(peak).toBe(4);
  });

  test("usa fallback integral quando o PostgreSQL falha", async () => {
    const snapshot = await loadGestorDashboardSnapshot(scope, failingRepository, mockRepository);
    expect(snapshot.source).toBe("mock");
    expect(snapshot.degraded).toBe(true);
    expect(snapshot.machineRows.length).toBeGreaterThan(0);
    expect(snapshot.alerts.length).toBeGreaterThan(0);
  });

  test("mantém score, pesos, dominante e causa iguais ao Admin para máquina compartilhada", async () => {
    const [gestor, admin] = await Promise.all([
      loadGestorDashboardSnapshot(scope, mockRepository, mockRepository),
      loadAdminDashboardSnapshot(mockRepository, mockRepository),
    ]);
    const gestorMachine = gestor.machineRows[0];
    const adminMachine = admin.machineRows.find((row) => row.machine.id === gestorMachine.machine.id);

    expect(adminMachine).toBeDefined();
    expect(gestorMachine.score).toBe(adminMachine!.score);
    expect(gestor.weights).toEqual(admin.weights);
    expect(gestorMachine.mainFactor).toBe(adminMachine!.mainFactor);
    expect(gestorMachine.recommendation.factor).toBe(adminMachine!.mainFactor);
  });
});