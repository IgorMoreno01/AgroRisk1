import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  evaluateConsultorRiskBatch,
} from "../src/lib/consultor-dashboard.server";
import {
  closePostgresRepository,
  listConsultorRelationalPhaseA,
} from "../src/lib/data/postgres-repository.server";
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

  test("UI invalida o contexto anterior e possui estado terminal sem operações", () => {
    const route = readFileSync("src/routes/consultor.tsx", "utf8");

    expect(route).toContain("priorityGeneration.current += 1");
    expect(route).toContain("delete priorityOperationByClient.current[nextClientId]");
    expect(route).toContain("evaluatedOperationIds: []");
    expect(route).toContain("limit: 1");
    expect(route).toContain("Este cliente não possui operações monitoradas disponíveis.");
    expect(route).not.toContain("selected.summary || requestedClients.current.has");
  });
});