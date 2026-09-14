import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  evaluateConsultorRiskBatch,
} from "../src/lib/consultor-dashboard.server";
import {
  closePostgresRepository,
  listConsultorRelationalPhaseA,
} from "../src/lib/data/postgres-repository.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import { selectConsultorPriorityOperationIds } from "../src/lib/consultor-risk-selection";

const clientIds = ["CL-002", "CL-006", "CL-014", "CL-018", "CL-022"];
const scope = { userId: "CST-CLIENT-SWITCH", clientIds };

afterAll(async () => {
  await closePostgresRepository();
});

describe("troca de cliente do Consultor", () => {
  test("Fase A traz relações PostgreSQL para todos os clientes autorizados", async () => {
    const relational = await listConsultorRelationalPhaseA(clientIds);

    expect(relational.clients.map((client) => client.id).sort()).toEqual([...clientIds].sort());
    for (const clientId of clientIds) {
      expect(relational.areas.some((area) => area.clientId === clientId)).toBe(true);
      expect(relational.machines.some((machine) => machine.clientId === clientId)).toBe(true);
      expect(relational.operations.some((operation) => operation.clientId === clientId)).toBe(true);
    }
  });

  test("A → B → C → A seleciona e avalia exatamente uma operação do cliente atual", async () => {
    const relational = await listConsultorRelationalPhaseA(clientIds);
    const sequence = ["CL-002", "CL-006", "CL-014", "CL-002"];
    const originalFetch = globalThis.fetch;
    let externalCalls = 0;
    globalThis.fetch = (async () => {
      externalCalls += 1;
      throw new Error("API externa não permitida no runtime do Consultor");
    }) as typeof fetch;

    try {
      for (const clientId of sequence) {
        const operations = relational.operations.filter((operation) => operation.clientId === clientId);
        const operationIds = selectConsultorPriorityOperationIds({
          operations,
          machines: relational.machines.filter((machine) => machine.clientId === clientId),
          areas: relational.areas.filter((area) => area.clientId === clientId),
          evaluatedOperationIds: [],
          limit: 1,
        });

        expect(operationIds).toHaveLength(1);
        expect(operations.some((operation) => operation.id === operationIds[0])).toBe(true);

        const result = await evaluateConsultorRiskBatch(
          scope,
          clientId,
          operationIds,
          1,
        );
        expect(result.client.id).toBe(clientId);
        expect(result.evaluatedOperationIds).toEqual(operationIds);
        expect(result.machines).toHaveLength(1);
        expect(result.machines[0]?.operation?.id).toBe(operationIds[0]);
        expect(result.machines[0]?.machine.clientId).toBe(clientId);
      }
      expect(externalCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 30_000);

  test("Horizonte Rural começa com uma máquina e carrega as outras três sem recalcular a primeira", async () => {
    const relational = await listConsultorRelationalPhaseA(clientIds);
    const clientId = "CL-014";
    const operations = relational.operations.filter((operation) => operation.clientId === clientId);
    const machines = relational.machines.filter((machine) => machine.clientId === clientId);
    const areas = relational.areas.filter((area) => area.clientId === clientId);
    const originalFetch = globalThis.fetch;
    let externalCalls = 0;
    globalThis.fetch = (async () => {
      externalCalls += 1;
      throw new Error("API externa não permitida no runtime do Consultor");
    }) as typeof fetch;

    try {
      expect(machines).toHaveLength(4);
      expect(new Set(operations.map((operation) => operation.machineId))).toEqual(
        new Set(machines.map((machine) => machine.id)),
      );
      const firstIds = selectConsultorPriorityOperationIds({
        operations, machines, areas, evaluatedOperationIds: [], limit: 1,
      });
      expect(firstIds).toHaveLength(1);
      const initial = await evaluateConsultorRiskBatch(
        { userId: "CST-EQUIPMENT-ON-DEMAND", clientIds },
        clientId,
        firstIds,
        1,
      );
      expect(initial.machines).toHaveLength(1);

      const nextIds = selectConsultorPriorityOperationIds({
        operations, machines, areas, evaluatedOperationIds: firstIds, limit: 3,
      });
      expect(nextIds).toHaveLength(3);
      expect(nextIds).not.toContain(firstIds[0]);
      expect(new Set(nextIds.map((id) => operations.find((operation) => operation.id === id)?.machineId)).size).toBe(3);

      const expanded = await evaluateConsultorRiskBatch(
        { userId: "CST-EQUIPMENT-ON-DEMAND", clientIds },
        clientId,
        nextIds,
        3,
      );
      expect(expanded.machines).toHaveLength(4);
      expect(new Set(expanded.machines.map((row) => row.machine.id)).size).toBe(4);
      expect(expanded.evaluatedOperationIds.filter((id) => id === firstIds[0])).toHaveLength(1);
      expect(selectConsultorPriorityOperationIds({
        operations,
        machines,
        areas,
        evaluatedOperationIds: [...firstIds, ...nextIds],
        limit: 3,
      })).toEqual([]);
      expect(externalCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 30_000);

  test("erro em uma máquina não cancela as demais do lote", async () => {
    const operations = await mockRepository.listOperations();
    const first = operations[0]!;
    const second = operations.find(
      (operation) =>
        operation.clientId === first.clientId && operation.machineId !== first.machineId,
    )!;
    const repository = Object.create(mockRepository) as typeof mockRepository;
    repository.listOperations = async () =>
      operations.map((operation) =>
        operation.id === first.id
          ? { ...operation, type: "Tipo inválido" as typeof operation.type }
          : operation,
      );

    const result = await evaluateConsultorRiskBatch(
      { userId: "CST-EQUIPMENT-ERROR-ISOLATION", clientIds: [first.clientId] },
      first.clientId,
      [first.id, second.id],
      2,
      repository,
    );

    expect(result.riskErrorsByOperationId?.[first.id]).toContain(
      "Tipo de operação inválido",
    );
    expect(result.evaluatedOperationIds).toContain(second.id);
    expect(result.machines.some((row) => row.machine.id === second.machineId)).toBe(true);
  });

  test("UI invalida o contexto anterior e possui estado terminal sem operações", () => {
    const route = readFileSync("src/routes/consultor.tsx", "utf8");

    expect(route).toContain("priorityGeneration.current += 1");
    expect(route).toContain("delete priorityOperationByClient.current[nextClientId]");
    expect(route).toContain("evaluatedOperationIds: []");
    expect(route).toContain("limit: 1");
    expect(route).toContain("[nextClientId]: []");
    expect(route).not.toContain("clientMachines.slice(0, 1)");
    expect(route).toContain("Este cliente não possui operações monitoradas disponíveis.");
    expect(route).not.toContain("selected.summary || requestedClients.current.has");
  });
});