import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gestorRiskBatchInputSchema } from "../src/lib/api/gestor-dashboard.functions";
import { evaluateGestorRiskBatch } from "../src/lib/gestor-dashboard.server";
import { buildOperadorDashboardPhaseA, evaluateOperadorDashboardRisk } from "../src/lib/operador-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import { selectConsultorPriorityOperationIds } from "../src/lib/consultor-risk-selection";
import { selectGestorPriorityOperationIds } from "../src/lib/gestor-risk-selection";

describe("orquestração controlada das personas", () => {
  test("seletor do Gestor produz somente operation.id string e o payload passa no schema real", async () => {
    const operations = await mockRepository.listOperations();
    const ids = selectGestorPriorityOperationIds(operations, operations.map((operation) => operation.id), 1);

    expect(ids).toHaveLength(1);
    expect(ids.every((id) => typeof id === "string" && operations.some((operation) => operation.id === id))).toBe(true);
    expect(gestorRiskBatchInputSchema.safeParse({
      token: "sessao-de-teste",
      operationIds: ids,
      limit: 1,
    }).success).toBe(true);
  });

  test("Consultor seleciona exatamente uma operação prioritária no primeiro request", async () => {
    const [operations, machines, areas] = await Promise.all([
      mockRepository.listOperations(),
      mockRepository.listMachines(),
      mockRepository.listAreas(),
    ]);
    const clientId = operations[0].clientId;
    const ids = selectConsultorPriorityOperationIds({
      operations: operations.filter((operation) => operation.clientId === clientId),
      machines: machines.filter((machine) => machine.clientId === clientId),
      areas: areas.filter((area) => area.clientId === clientId),
      limit: 1,
    });
    expect(ids).toHaveLength(1);
    const nextIds = selectConsultorPriorityOperationIds({
      operations: operations.filter((operation) => operation.clientId === clientId),
      machines: machines.filter((machine) => machine.clientId === clientId),
      areas: areas.filter((area) => area.clientId === clientId),
      evaluatedOperationIds: ids,
      limit: 3,
    });
    expect(nextIds).not.toContain(ids[0]);
    expect(nextIds.length).toBeGreaterThan(0);
  });

  test("Fase A do Operador não recebe nem executa V2", async () => {
    const [clients, areas, machines, operations, alerts, history] = await Promise.all([
      mockRepository.listClients(),
      mockRepository.listAreas(),
      mockRepository.listMachines(),
      mockRepository.listOperations(),
      mockRepository.listAlerts(),
      mockRepository.listOperationHistory(),
    ]);
    const operation = operations.find((item) => item.operatorId === "USR-OP-1")!;
    const machine = machines.find((item) => item.id === operation.machineId)!;
    const phaseA = await buildOperadorDashboardPhaseA({
      operator: { id: operation.operatorId, name: machine.operator, clientId: operation.clientId },
      clients: clients.filter((item) => item.id === operation.clientId),
      areas: areas.filter((item) => item.id === operation.areaId),
      machines: [machine],
      operations: [operation],
      alerts: alerts.filter((item) => item.operationId === operation.id),
      history: history.filter((item) => item.operationId === operation.id),
      operationCount: operations.filter((item) => item.operatorId === operation.operatorId).length,
      riskContexts: [],
    }, "mock", false, { ml: 70, operationalRules: 30 }, operation.operatorId);

    expect(phaseA.operation.id).toBe(operation.id);
    expect("risk" in phaseA).toBe(false);
    expect("engineResult" in phaseA).toBe(false);
  });

  test("Phase B do Operador publica entidades do mesmo contexto da operação validada", async () => {
    const operations = await mockRepository.listOperations();
    const operation = operations.find((item) => item.operatorId === "USR-OP-1")!;
    const snapshot = await evaluateOperadorDashboardRisk(
      operation.operatorId,
      operation.id,
      mockRepository,
      mockRepository,
    );
    expect(snapshot.operation.id).toBe(operation.id);
    expect(snapshot.machine.id).toBe(operation.machineId);
    expect(snapshot.area.id).toBe(operation.areaId);
    expect(snapshot.client.id).toBe(operation.clientId);
  });

  test("erro individual real do motor não descarta a outra operação do Gestor", async () => {
    const operations = await mockRepository.listOperations();
    const repository = Object.create(mockRepository) as typeof mockRepository;
    repository.listOperations = async () => operations.map((operation, index) =>
      index === 0 ? { ...operation, type: "Tipo inválido" as typeof operation.type } : operation,
    );
    const result = await evaluateGestorRiskBatch(
      { userId: "GESTOR-ISOLAMENTO", clientIds: null },
      operations.slice(0, 2).map((operation) => operation.id),
      2,
      repository,
    );

    expect(result.operationRows).toHaveLength(1);
    expect(result.riskErrorsByOperationId?.[operations[0].id]).toContain("Tipo de operação inválido");
  });

  test("as quatro primeiras avaliações são unitárias e prioridades não aguardam agregados", () => {
    const sources = ["admin", "gestor", "consultor"].map((persona) =>
      readFileSync(`src/routes/${persona}.tsx`, "utf8"),
    );
    expect(sources[0]).toContain("operationIds: [id], limit: 1");
    expect(sources[1]).toMatch(/visibleIds[\s\S]*?selectGestorPriorityOperationIds[\s\S]*?\n\s*1,/);
    expect(sources[2]).toContain("operationIds, limit: 1");

    const operatorApi = readFileSync("src/lib/api/operador-dashboard.functions.ts", "utf8");
    const operatorRoute = readFileSync("src/routes/operador.tsx", "utf8");
    expect(operatorApi).toContain("evaluateOperadorRisk");
    expect(operatorRoute).toContain("Calculando...");
    expect(operatorRoute).toContain("riskRequestGeneration");
    expect(sources[0]).toContain("!priorityPublished");
    expect(sources[1]).toContain("!priorityResolved.current");
    expect(sources[2]).toContain("Carregar mais itens visíveis");
    expect(sources[2]).toContain("Carregar análise preventiva");
  });
});