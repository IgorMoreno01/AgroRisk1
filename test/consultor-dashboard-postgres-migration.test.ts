import { describe, expect, test } from "bun:test";
import { loadAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";
import { loadConsultorDashboardSnapshot } from "../src/lib/consultor-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
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
const scope = { userId: "CST-TEST", clientIds: ["CL-01", "CL-02", "CL-03"] };

describe("Migração do Consultor/Corretor para PostgreSQL", () => {
  test("aplica uma carteira determinística sem expor a carteira Admin", async () => {
    const snapshot = await loadConsultorDashboardSnapshot(scope, mockRepository, mockRepository);
    expect(snapshot.clients.map((item) => item.client.id)).toEqual(["CL-01", "CL-02", "CL-03"]);
    expect(snapshot.clients.every((item) =>
      item.machines.every((row) => row.machine.clientId === item.client.id) &&
      item.areas.every((row) => row.area.clientId === item.client.id)
    )).toBe(true);
  });

  test("ignora scores persistidos e mantém recomendação e explicação na mesma origem", async () => {
    const snapshot = await loadConsultorDashboardSnapshot(scope, mockRepository, mockRepository);
    for (const view of snapshot.clients) {
      expect(view.summary.score).toBeGreaterThan(0);
      expect(view.recommendation.factor).toBe(view.summary.mainFactor);
      expect(view.explanation).toContain(view.summary.mainFactor.toLowerCase());
      expect(view.nextAction.factor).toBe(view.recommendation.factor);
    }
    expect(snapshot.clients.some((view) =>
      view.machines.some((row) => row.score !== row.machine.score)
    )).toBe(true);
  });

  test("executa somente quatro leituras iniciais em paralelo", async () => {
    let calls = 0;
    let active = 0;
    let peak = 0;
    const wrap = <T>(fn: () => Promise<T>) => async () => {
      calls += 1;
      active += 1;
      peak = Math.max(peak, active);
      await Bun.sleep(5);
      const result = await fn();
      active -= 1;
      return result;
    };
    const repository: AgroRiskRepository = {
      ...mockRepository,
      listClients: wrap(() => mockRepository.listClients()),
      listAreas: wrap(() => mockRepository.listAreas()),
      listMachines: wrap(() => mockRepository.listMachines()),
      listOperations: wrap(() => mockRepository.listOperations()),
    };

    await loadConsultorDashboardSnapshot(scope, repository, mockRepository);
    expect(calls).toBe(4);
    expect(peak).toBe(4);
  });

  test("usa fallback integral para mock e identifica alertas demonstrativos", async () => {
    const snapshot = await loadConsultorDashboardSnapshot(scope, failingRepository, mockRepository);
    expect(snapshot.source).toBe("mock");
    expect(snapshot.degraded).toBe(true);
    expect(snapshot.alertsSource).toBe("demo");
    expect(snapshot.clients.length).toBeGreaterThan(0);
  });

  test("mantém score, pesos, fator e origem da recomendação iguais ao Admin", async () => {
    const [consultor, admin] = await Promise.all([
      loadConsultorDashboardSnapshot(scope, mockRepository, mockRepository),
      loadAdminDashboardSnapshot(mockRepository, mockRepository),
    ]);
    const machine = consultor.clients[0].machines[0];
    const adminMachine = admin.machineRows.find((row) => row.machine.id === machine.machine.id);

    expect(adminMachine).toBeDefined();
    expect(machine.score).toBe(adminMachine!.score);
    expect(machine.mainFactor).toBe(adminMachine!.mainFactor);
    expect(consultor.weights).toEqual(admin.weights);
    expect(consultor.clients[0].recommendation.factor).toBe(consultor.clients[0].summary.mainFactor);
  });
});