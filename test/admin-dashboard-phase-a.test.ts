import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAdminDashboardSnapshot,
  buildAdminDashboardRelationalSnapshot,
  selectPrioritizedAdminOperations,
} from "../src/lib/admin-dashboard.server";
import { mergeAdminOperationRows } from "../src/lib/admin-dashboard-merge";
import { mockRepository } from "../src/lib/data/mock-repository.server";

describe("Admin/Sompo fase A", () => {
  test("carrega relações sem chamar provedores externos nem calcular scores", async () => {
    const [clients, areas, machines, operations, alerts] = await Promise.all([
      mockRepository.listClients(),
      mockRepository.listAreas(),
      mockRepository.listMachines(),
      mockRepository.listOperations(),
      mockRepository.listAlerts(),
    ]);
    const snapshot = await buildAdminDashboardRelationalSnapshot(
      { clients, areas, machines, operations, alerts },
      "postgres",
      false,
      { ml: 70, operationalRules: 30 },
    );
    expect(snapshot.operations.length).toBeGreaterThan(0);
    expect(snapshot.machineRows).toEqual([]);
    expect(snapshot.areaRows).toEqual([]);
    expect(snapshot.operationRows).toEqual([]);
    expect(snapshot.machineDistribution.total).toBe(0);
  });

  test("prioriza Em andamento, respeita IDs explícitos e limita o batch", async () => {
    const operations = await mockRepository.listOperations();
    const active = operations.find((operation) => operation.status === "Em andamento");
    expect(active).toBeTruthy();
    if (!active) return;
    const selected = selectPrioritizedAdminOperations(operations, [], 20);
    expect(selected.length).toBeLessThanOrEqual(20);
    expect(selected[0]?.status).toBe("Em andamento");
    expect(selectPrioritizedAdminOperations(operations, [active.id], 20).map((item) => item.id))
      .toEqual([active.id]);
  });

  test("Phase A não importa adapters nem aceita serviços externos de risco", () => {
    const source = readFileSync(resolve("src/lib/admin-dashboard.server.ts"), "utf8");
    expect(source).not.toContain("/adapters/");
    expect(source).not.toContain("OperationRiskExternalServices");
    expect(source).not.toContain("externalServices");
    expect(source).toContain("buildAdminDashboardRelationalSnapshot");
  });

  test("mantém agregados pendentes com cobertura parcial e recompõe o resultado completo sem alterar scores", async () => {
    const [clients, areas, machines, operations, alerts] = await Promise.all([
      mockRepository.listClients(),
      mockRepository.listAreas(),
      mockRepository.listMachines(),
      mockRepository.listOperations(),
      mockRepository.listAlerts(),
    ]);
    const relational = { clients, areas, machines, operations, alerts };
    const weights = { ml: 70, operationalRules: 30 };
    const complete = await buildAdminDashboardSnapshot(
      relational,
      "mock",
      false,
      weights,
    );
    const relationalOnly = await buildAdminDashboardRelationalSnapshot(
      relational,
      "mock",
      false,
      weights,
    );

    const partial = mergeAdminOperationRows(relationalOnly, complete.operationRows.slice(0, 1));
    expect(partial.riskCoverageComplete).toBe(false);
    expect(partial.machineDistribution.total).toBe(0);
    expect(partial.areaDistribution.total).toBe(0);

    const progressivelyComplete = mergeAdminOperationRows(relationalOnly, complete.operationRows);
    expect(progressivelyComplete.riskCoverageComplete).toBe(true);
    const byId = <T>(rows: readonly T[], id: (row: T) => string, score: (row: T) => number) =>
      Object.fromEntries(rows.map((row) => [id(row), score(row)]));
    expect(byId(progressivelyComplete.machineRows, (row) => row.machine.id, (row) => row.score))
      .toEqual(byId(complete.machineRows, (row) => row.machine.id, (row) => row.score));
    expect(byId(progressivelyComplete.areaRows, (row) => row.area.id, (row) => row.score))
      .toEqual(byId(complete.areaRows, (row) => row.area.id, (row) => row.score));
    expect(byId(progressivelyComplete.clientRows, (row) => row.client.id, (row) => row.score))
      .toEqual(byId(complete.clientRows, (row) => row.client.id, (row) => row.score));
    expect(byId(progressivelyComplete.operationTypeRows, (row) => row.type, (row) => row.score))
      .toEqual(byId(complete.operationTypeRows, (row) => row.type, (row) => row.score));
  });
});