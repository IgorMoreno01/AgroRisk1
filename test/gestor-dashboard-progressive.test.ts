import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildGestorRelationalSnapshot,
  evaluateGestorRiskBatch,
  loadGestorDashboardSnapshot,
} from "../src/lib/gestor-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import type { OperationRiskExternalServices } from "../src/lib/risk-engine-v2/operation-input.server";
import { selectGestorPriorityOperationIds } from "../src/lib/gestor-risk-selection";
import type { Operation } from "../src/lib/mock-data";

const scope = { userId: "GST-PROGRESSIVE", clientIds: ["CL-01", "CL-02"] };
const weights = { ml: 65, operationalRules: 35 };
const services: OperationRiskExternalServices = {
  geocode: async () => ({ latitude: -23.5, longitude: -47.5, source: "test" }),
  historicalWeather: async () => ({ precipitationMm: 2, temperatureC: 24, windSpeedKmh: 8, source: "test" }),
  elevation: async () => ({ elevationM: 600, source: "test" }),
  water: async () => ({ nearWater: false, distanceMeters: 900, source: "test" }),
};

async function phaseAData() {
  const [clients, areas, machines, operations] = await Promise.all([
    mockRepository.listClients(),
    mockRepository.listAreas(),
    mockRepository.listMachines(),
    mockRepository.listOperations(),
  ]);
  const allowed = new Set(scope.clientIds);
  const scopedMachines = machines.filter((machine) => allowed.has(machine.clientId));
  return {
    clients: clients.filter((client) => allowed.has(client.id)),
    areas: areas.filter((area) => allowed.has(area.clientId)),
    machines: scopedMachines,
    operations: operations.filter((operation) => allowed.has(operation.clientId)),
    alerts: (await mockRepository.listAlerts()).filter((alert) =>
      scopedMachines.some((machine) => machine.id === alert.machineId)),
  };
}

describe("carregamento progressivo do Gestor", () => {
  test("Fase A entrega relações, contagens e alertas demo sem avaliação", async () => {
    const snapshot = await buildGestorRelationalSnapshot(
      await phaseAData(), "postgres", false, scope, weights,
    );
    expect(snapshot.clients.length).toBe(2);
    expect(snapshot.machines.length).toBeGreaterThan(0);
    expect(snapshot.alerts.length).toBeGreaterThan(0);
    expect(snapshot.machineRows).toHaveLength(0);
    expect(snapshot.riskCoverageComplete).toBe(false);
    expect(snapshot.relationalCounts?.machines).toBe(snapshot.machines.length);
  });

  test("batch limita a 12, aplica escopo e acumula cobertura parcial", async () => {
    const relational = await phaseAData();
    const ids = relational.operations.map((operation) => operation.id);
    const first = await evaluateGestorRiskBatch(scope, ids, 1, services, mockRepository);
    expect(first.operationRows.length).toBeLessThanOrEqual(1);
    expect(first.operationRows.every((row) => scope.clientIds.includes(row.operation.clientId))).toBe(true);
    expect(first.riskCoverageComplete).toBe(false);
    const second = await evaluateGestorRiskBatch(
      scope,
      relational.operations.slice(1, 2).map((operation) => operation.id),
      1,
      services,
      mockRepository,
    );
    expect(second.operationRows.length).toBeGreaterThanOrEqual(first.operationRows.length);
    expect(second.evaluatedOperationIds).toContain(relational.operations[1].id);
  });

  test("operação em andamento é sempre a primeira prioridade", () => {
    const operations = [
      { id: "OP-1", status: "Planejada", scheduledAt: "2026-01-03T10:00:00Z" },
      { id: "OP-2", status: "Em andamento", scheduledAt: "2026-01-01T10:00:00Z" },
    ] as Operation[];
    expect(selectGestorPriorityOperationIds(operations, ["OP-1"], 2)[0]).toBe("OP-2");
    expect(selectGestorPriorityOperationIds(operations, ["OP-1"], 2, false)).toEqual(["OP-1"]);
  });

  test("fluxo legado mantém avaliação completa quando explicitamente solicitado", async () => {
    const legacy = await loadGestorDashboardSnapshot(scope, mockRepository, mockRepository, services);
    expect(legacy.machineRows.length).toBeGreaterThan(0);
    expect(legacy.riskCoverageComplete).toBe(true);
  });

  test("rota usa batch autenticado e agenda somente a primeira página visível", () => {
    const route = readFileSync("src/routes/gestor.tsx", "utf8");
    const api = readFileSync("src/lib/api/gestor-dashboard.functions.ts", "utf8");
    expect(route).toContain("evaluateGestorRiskBatch");
    expect(route).toContain("}, 75)");
    expect(route).toContain("Calculando...");
    expect(route).toContain("onValueChange={handleRankingTabChange}");
    expect(api).toContain(".max(12)");
    expect(api).not.toMatch(/clientIds\\s*:/);
    const repository = readFileSync("src/lib/data/postgres-repository.server.ts", "utf8");
    const phaseA = repository.slice(
      repository.indexOf("export async function listGestorRelationalPhaseA"),
      repository.indexOf("export async function listConsultorRelationalPhaseA"),
    );
    expect(phaseA).toContain("FROM agrorisk.alerts");
    expect(phaseA).not.toContain("listOperationRiskContexts");
  });
});