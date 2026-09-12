import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildConsultorRelationalSnapshot,
  evaluateConsultorRiskBatch,
  loadConsultorDashboardSnapshot,
} from "../src/lib/consultor-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import { selectConsultorPriorityOperationIds } from "../src/lib/consultor-risk-selection";
import type { Area, Machine, Operation } from "../src/lib/mock-data";

const scope = { userId: "CST-PROGRESSIVE", clientIds: ["CL-01", "CL-02"] };
const weights = { ml: 65, operationalRules: 35 };

async function relationalFixture() {
  const [clients, areas, machines, operations] = await Promise.all([
    mockRepository.listClients(),
    mockRepository.listAreas(),
    mockRepository.listMachines(),
    mockRepository.listOperations(),
  ]);
  const allowed = new Set(scope.clientIds);
  return {
    clients: clients.filter((client) => allowed.has(client.id)),
    areas: areas.filter((area) => allowed.has(area.clientId)),
    machines: machines.filter((machine) => allowed.has(machine.clientId)),
    operations: operations.filter((operation) => allowed.has(operation.clientId)),
    alerts: [],
    riskContexts: [],
  };
}

describe("carregamento progressivo do Consultor", () => {
  test("Fase A entrega relações sem executar ou inventar scores", async () => {
    const relational = await relationalFixture();
    const snapshot = await buildConsultorRelationalSnapshot(
      relational,
      "postgres",
      false,
      weights,
      scope,
    );

    expect(snapshot.clients.length).toBe(2);
    expect(snapshot.clients.every((client) =>
      client.machinesData.length > 0 &&
      client.areasData.length > 0 &&
      client.operations.length > 0 &&
      client.summary === undefined &&
      client.machines.length === 0 &&
      client.areas.length === 0
    )).toBe(true);
  });

  test("batch avalia no máximo 12 operações e somente o cliente solicitado", async () => {
    const relational = await relationalFixture();
    const client = relational.clients[0];
    const operationIds = relational.operations.map((operation) => operation.id);
    const result = await evaluateConsultorRiskBatch(
      scope,
      client.id,
      operationIds,
      12,
      mockRepository,
    );

    expect(result.client.id).toBe(client.id);
    expect(result.operations.every((operation) => operation.clientId === client.id)).toBe(true);
    expect(result.machines.length).toBeLessThanOrEqual(12);
    expect(result.machines.every((row) => row.machine.clientId === client.id)).toBe(true);
  });

  test("preserva o mesmo resultado V2 do fluxo completo para a mesma operação", async () => {
    const full = await loadConsultorDashboardSnapshot(
      { userId: scope.userId, clientIds: [scope.clientIds[0]] },
      mockRepository,
      mockRepository,
    );
    const expected = full.clients[0].machines[0];
    const batch = await evaluateConsultorRiskBatch(
      { userId: scope.userId, clientIds: [scope.clientIds[0]] },
      scope.clientIds[0],
      [expected.operation!.id],
      1,
      mockRepository,
    );
    const actual = batch.machines.find((row) => row.operation?.id === expected.operation?.id);

    expect(actual).toBeDefined();
    expect(actual!.evaluation.result.ml.mlRelativeScore).toBe(expected.evaluation.result.ml.mlRelativeScore);
    expect(actual!.evaluation.result.operationalRules.operationalRulesScore)
      .toBe(expected.evaluation.result.operationalRules.operationalRulesScore);
    expect(actual!.score).toBe(expected.score);
    expect(actual!.level).toBe(expected.level);
  });

  test("frontend prioriza cliente selecionado, faz batch unitário e mostra loading local", () => {
    const route = readFileSync("src/routes/consultor.tsx", "utf8");
    const repository = readFileSync("src/lib/data/postgres-repository.server.ts", "utf8");
    const phaseA = repository.slice(
      repository.indexOf("export async function listConsultorRelationalPhaseA"),
      repository.indexOf("export async function listGestorOperationalOverview"),
    );
    expect(route).toContain("evaluateConsultorRiskBatch");
    expect(route).toContain("selected.client.id");
    expect(route).toContain("selectConsultorPriorityOperationIds");
    expect(route).toContain("limit: 1");
    expect(route).toContain("Calculando...");
    expect(route).not.toContain("Consultando clientes e riscos calculados");
    expect(route).not.toContain("setInterval");
    expect(route).not.toContain("window.setTimeout");
    expect(phaseA).not.toContain("listOperationRiskContexts");
    expect(phaseA).not.toContain("listConsultorPreventiveOverview");
  });

  test("visão inicial usa relações e apresenta apenas a operação prioritária", () => {
    const route = readFileSync("src/routes/consultor.tsx", "utf8");
    const panel = readFileSync("src/components/persona-v2-risk-panel.tsx", "utf8");

    expect(route).toContain('label="Máquinas monitoradas"');
    expect(route).toContain('label="Áreas monitoradas"');
    expect(route).toContain('label="Operações monitoradas"');
    expect(route).toContain('label="Alertas do cliente"');
    expect(route).not.toContain('label="Score médio"');
    expect(route).not.toContain('label="Máq. risco alto"');
    expect(route).not.toContain('label="Área crítica"');
    expect(route).toContain('title="Equipamento em análise"');
    expect(route).toContain('title="Área da operação analisada"');
    expect(route).not.toContain("Top 3 equipamentos");
    expect(route).not.toContain("Top 3 áreas");
    expect(route).toContain('title="Composição do score da operação"');
    expect(route).toContain("priorityResult.drivers");
    expect(route).toContain("Nenhuma recomendação ativa para esta operação.");
    expect(panel).toContain('persona === "consultor" ? "Score ML"');
    expect(panel).toContain('"Fatores estruturais que elevam/reduzem o risco relativo."');
  });

  test("operação ativa tem prioridade mesmo fora dos primeiros cards visíveis", () => {
    const machines = Array.from({ length: 13 }, (_, index) => ({
      id: `M-${index + 1}`,
      areaId: index < 3 ? "A-1" : "A-2",
    })) as Machine[];
    const areas = [{ id: "A-1" }, { id: "A-2" }] as Area[];
    const operations = machines.map((machine, index) => ({
      id: `OP-${index + 1}`,
      machineId: machine.id,
      status: index === 12 ? "Em andamento" : "Planejada",
      scheduledAt: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    })) as Operation[];

    const ids = selectConsultorPriorityOperationIds({
      operations,
      machines,
      areas,
      limit: 12,
    });

    expect(ids).toHaveLength(12);
    expect(ids[0]).toBe("OP-13");
    expect(ids).toContain("OP-1");
  });
});