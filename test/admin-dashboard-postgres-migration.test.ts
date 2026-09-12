import { describe, expect, test } from "bun:test";
import {
  buildAdminDashboardSnapshot,
  loadAdminDashboardSnapshot,
} from "../src/lib/admin-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import type { AgroRiskRepository } from "../src/lib/data/repository";

const weights = { ml: 70, operationalRules: 30 };

describe("Migração Admin/Sompo para dados relacionais", () => {
  test("não usa os scores persistidos para classificar risco", async () => {
    const clients = (await mockRepository.listClients()).map((client) => ({
      ...client,
      avgScore: 0,
      level: "baixo" as const,
    }));
    const areas = (await mockRepository.listAreas()).map((area) => ({
      ...area,
      score: 0,
      envRisk: "baixo" as const,
    }));
    const machines = (await mockRepository.listMachines()).map((machine) => ({
      ...machine,
      score: 0,
      level: "baixo" as const,
    }));
    const operations = (await mockRepository.listOperations()).map((operation) => ({
      ...operation,
      score: 0,
    }));
    const alerts = await mockRepository.listAlerts();

    const snapshot = await buildAdminDashboardSnapshot(
      { clients, areas, machines, operations, alerts },
      "postgres",
      false,
      weights,
    );

    expect(snapshot.operationRows.some((row) => row.score > 0)).toBe(true);
    expect(snapshot.machineRows.some((row) => row.score > 0)).toBe(true);
    expect(snapshot.areaRows.some((row) => row.score > 0)).toBe(true);
    expect(snapshot.clientRows.some((row) => row.score > 0)).toBe(true);
    expect(snapshot.machineRows.every((row) => row.score !== row.machine.score)).toBe(true);
  });

  test("propaga falha PostgreSQL sem trocar para mock", async () => {
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

    await expect(loadAdminDashboardSnapshot(failingRepository, mockRepository))
      .rejects.toThrow("database unavailable");
  });

  test("modo mock explícito preserva proveniência demonstrativa", async () => {
    const snapshot = await loadAdminDashboardSnapshot(mockRepository, mockRepository);
    expect(snapshot.source).toBe("mock");
    expect(snapshot.degraded).toBe(true);
  });

  test("preserva as contagens e relações recebidas do repositório", async () => {
    const relational = {
      clients: await mockRepository.listClients(),
      areas: await mockRepository.listAreas(),
      machines: await mockRepository.listMachines(),
      operations: await mockRepository.listOperations(),
      alerts: await mockRepository.listAlerts(),
    };
    const snapshot = await buildAdminDashboardSnapshot(relational, "postgres", false, weights);
    expect(snapshot.clients).toHaveLength(relational.clients.length);
    expect(snapshot.areas).toHaveLength(relational.areas.length);
    expect(snapshot.machines).toHaveLength(relational.machines.length);
    expect(snapshot.operations).toHaveLength(relational.operations.length);
    expect(snapshot.machineDistribution.total).toBe(relational.machines.length);
    expect(snapshot.areaDistribution.total).toBe(relational.areas.length);
  });

  test("trata um banco relacional vazio sem produzir valores inválidos", async () => {
    const snapshot = await buildAdminDashboardSnapshot(
      { clients: [], areas: [], machines: [], operations: [], alerts: [] },
      "postgres",
      false,
      weights,
    );
    expect(snapshot.machineRows).toEqual([]);
    expect(snapshot.areaRows).toEqual([]);
    expect(snapshot.clientRows).toEqual([]);
    expect(snapshot.operationRows).toEqual([]);
    expect(snapshot.machineDistribution.total).toBe(0);
    expect(snapshot.areaDistribution.total).toBe(0);
    expect(JSON.stringify(snapshot)).not.toContain("NaN");
  });

  test("o snapshot pode atravessar a fronteira servidor-cliente", async () => {
    const relational = {
      clients: await mockRepository.listClients(),
      areas: await mockRepository.listAreas(),
      machines: await mockRepository.listMachines(),
      operations: await mockRepository.listOperations(),
      alerts: await mockRepository.listAlerts(),
    };
    const snapshot = await buildAdminDashboardSnapshot(relational, "postgres", false, weights);
    const serialized = JSON.parse(JSON.stringify(snapshot));
    expect(serialized.clients).toHaveLength(relational.clients.length);
    expect(serialized.operationRows).toHaveLength(relational.operations.length);
  });
});
