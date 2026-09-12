import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  assertOperationClientCoherence,
  evaluateAdminDashboardRiskBatch,
  loadAdminDashboardSnapshot,
} from "../src/lib/admin-dashboard.server";
import {
  evaluateConsultorRiskBatch,
  loadConsultorDashboardSnapshot,
} from "../src/lib/consultor-dashboard.server";
import { createMockRepository } from "../src/lib/data/mock-repository.server";
import type {
  AgroRiskRepository,
  RiskWeightConfigurationRepository,
} from "../src/lib/data/repository";
import {
  evaluateGestorRiskBatch,
  loadGestorDashboardSnapshot,
} from "../src/lib/gestor-dashboard.server";
import {
  evaluateOperadorDashboardRisk,
  loadOperadorDashboardPhaseA,
} from "../src/lib/operador-dashboard.server";
import { resolveRiskEngineV2Weights } from "../src/lib/risk-config.server";
import { buildFallbackOperationRiskContext } from "../src/lib/risk-engine-v2/operation-input.server";

const createRepository = () => {
  const repository = createMockRepository();
  return {
    repository,
    weights: repository as RiskWeightConfigurationRepository,
  };
};

const resultShape = (result: {
  ml: unknown;
  operationalRules: unknown;
  finalScore: number;
  level: string;
  drivers: unknown;
}) => ({
  ml: result.ml,
  operationalRules: result.operationalRules,
  finalScore: result.finalScore,
  level: result.level,
  drivers: result.drivers,
});

async function selectOperatorAndSecondClient(repository: AgroRiskRepository) {
  const operations = await repository.listOperations();
  for (const candidate of operations) {
    try {
      const phaseA = await loadOperadorDashboardPhaseA(
        candidate.operatorId,
        repository,
        repository,
      );
      const second = operations.find(
        (operation) => operation.clientId !== phaseA.operation.clientId,
      );
      if (second) return { phaseA, second };
    } catch {
      // Some fixtures are not linked to an operator persona.
    }
  }
  throw new Error("O mock precisa ter um operador e operações de dois clientes.");
}

describe("Pesos efetivos nas avaliações das personas", () => {
  test("global, override e fallback são aplicados por clientId nas quatro personas", async () => {
    const { repository, weights } = createRepository();
    const { phaseA, second } = await selectOperatorAndSecondClient(repository);
    const clientA = phaseA.operation.clientId;
    const clientB = second.clientId;

    await weights.saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
    );
    await weights.saveClientRiskWeightOverride(
      clientA,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    );

    const adminRows = await evaluateAdminDashboardRiskBatch(
      [phaseA.operation.id, second.id],
      2,
      repository,
    );
    const adminA = adminRows.find((row) => row.operation.id === phaseA.operation.id)!;
    const adminB = adminRows.find((row) => row.operation.id === second.id)!;
    expect(adminA.evaluation.result.weights).toEqual({ ml: 80, operationalRules: 20 });
    expect(adminB.evaluation.result.weights).toEqual({ ml: 60, operationalRules: 40 });

    const gestor = await evaluateGestorRiskBatch(
      { userId: "gestor-test", clientIds: [clientA, clientB] },
      [phaseA.operation.id, second.id],
      2,
      repository,
    );
    const gestorA = gestor.operationRows.find(
      (row) => row.operation.id === phaseA.operation.id,
    )!;
    const gestorB = gestor.operationRows.find((row) => row.operation.id === second.id)!;
    expect(gestorA.evaluation.result.weights).toEqual({ ml: 80, operationalRules: 20 });
    expect(gestorB.evaluation.result.weights).toEqual({ ml: 60, operationalRules: 40 });

    const consultorA = await evaluateConsultorRiskBatch(
      { userId: "consultor-test", clientIds: [clientA, clientB] },
      clientA,
      [phaseA.operation.id],
      1,
      repository,
    );
    const consultorB = await evaluateConsultorRiskBatch(
      { userId: "consultor-test", clientIds: [clientA, clientB] },
      clientB,
      [second.id],
      1,
      repository,
    );
    expect(consultorA.machines[0]?.evaluation.result.weights).toEqual({
      ml: 80,
      operationalRules: 20,
    });
    expect(consultorB.machines[0]?.evaluation.result.weights).toEqual({
      ml: 60,
      operationalRules: 40,
    });

    const operador = await evaluateOperadorDashboardRisk(
      phaseA.operator.id,
      phaseA.operation.id,
      repository,
      repository,
    );
    expect(operador.engineResult.weights).toEqual({ ml: 80, operationalRules: 20 });

    expect(resultShape(gestorA.evaluation.result)).toEqual(
      resultShape(adminA.evaluation.result),
    );
    expect(resultShape(consultorA.machines[0]!.evaluation.result)).toEqual(
      resultShape(adminA.evaluation.result),
    );
    expect(resultShape(operador.engineResult)).toEqual(
      resultShape(adminA.evaluation.result),
    );
  });

  test("remover override muda a próxima avaliação sem alterar ML ou Operacional", async () => {
    const { repository, weights } = createRepository();
    const { phaseA } = await selectOperatorAndSecondClient(repository);
    const clientId = phaseA.operation.clientId;
    await weights.saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
    );
    const override = await weights.saveClientRiskWeightOverride(
      clientId,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    );
    const [before] = await evaluateAdminDashboardRiskBatch(
      [phaseA.operation.id],
      1,
      repository,
    );
    await weights.deleteClientRiskWeightOverride(clientId, override.revision);
    const [after] = await evaluateAdminDashboardRiskBatch(
      [phaseA.operation.id],
      1,
      repository,
    );

    expect(before.evaluation.result.weights).toEqual({ ml: 80, operationalRules: 20 });
    expect(after.evaluation.result.weights).toEqual({ ml: 60, operationalRules: 40 });
    expect(after.evaluation.result.ml).toEqual(before.evaluation.result.ml);
    expect(after.evaluation.result.operationalRules).toEqual(
      before.evaluation.result.operationalRules,
    );
    expect(after.evaluation.result.finalScore).not.toBe(
      before.evaluation.result.finalScore,
    );
  });

  test("revision altera assinatura usada pelos caches", async () => {
    const { repository, weights } = createRepository();
    const { phaseA } = await selectOperatorAndSecondClient(repository);
    const first = await weights.saveClientRiskWeightOverride(
      phaseA.operation.clientId,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    );
    const signatureBefore = await resolveRiskEngineV2Weights(
      phaseA.operation.clientId,
      repository,
    );
    await weights.saveClientRiskWeightOverride(
      phaseA.operation.clientId,
      { mlWeight: 70, operationalRulesWeight: 30 },
      { expectedRevision: first.revision },
    );
    const signatureAfter = await resolveRiskEngineV2Weights(
      phaseA.operation.clientId,
      repository,
    );
    expect(signatureAfter.cacheSignature).not.toBe(signatureBefore.cacheSignature);

    for (const file of [
      "admin-dashboard.server.ts",
      "gestor-dashboard.server.ts",
      "consultor-dashboard.server.ts",
      "operador-dashboard.server.ts",
    ]) {
      const source = readFileSync(
        new URL(`../src/lib/${file}`, import.meta.url),
        "utf8",
      );
      expect(source).toContain("cacheSignature");
    }
  });

  test("sem global ou override mantém o comportamento default 70/30", async () => {
    const { repository } = createRepository();
    const { phaseA } = await selectOperatorAndSecondClient(repository);
    const [row] = await evaluateAdminDashboardRiskBatch(
      [phaseA.operation.id],
      1,
      repository,
    );
    expect(row.evaluation.result.weights).toEqual({ ml: 70, operationalRules: 30 });
  });

  test("clientId dos pesos vem do contexto relacional, não de payload livre", () => {
    for (const file of [
      "admin-dashboard.server.ts",
      "gestor-dashboard.server.ts",
      "consultor-dashboard.server.ts",
      "operador-dashboard.server.ts",
    ]) {
      const source = readFileSync(
        new URL(`../src/lib/${file}`, import.meta.url),
        "utf8",
      );
      expect(source).toContain("operation.clientId");
    }
    const operatorSource = readFileSync(
      new URL("../src/lib/operador-dashboard.server.ts", import.meta.url),
      "utf8",
    );
    expect(operatorSource).toContain(
      "resolveRiskEngineV2Weights(operation.clientId, primary)",
    );
  });

  test("falha ao resolver pesos no primário degrada para o repository fallback", async () => {
    const primaryBase = createMockRepository();
    const fallback = createMockRepository();
    const { phaseA } = await selectOperatorAndSecondClient(fallback);
    const primary = {
      ...primaryBase,
      resolveEffectiveRiskWeights: async () => {
        throw new Error("database unavailable during weight resolution");
      },
    } satisfies AgroRiskRepository;

    const [admin, gestor, consultor, operador] = await Promise.all([
      loadAdminDashboardSnapshot(primary, fallback),
      loadGestorDashboardSnapshot(
        { userId: "fallback-gestor", clientIds: null },
        primary,
        fallback,
      ),
      loadConsultorDashboardSnapshot(
        { userId: "fallback-consultor", clientIds: null },
        primary,
        fallback,
      ),
      loadOperadorDashboardPhaseA(phaseA.operator.id, primary, fallback),
    ]);
    expect(admin.degraded).toBe(true);
    expect(gestor.degraded).toBe(true);
    expect(consultor.degraded).toBe(true);
    expect(operador.degraded).toBe(true);
    expect(admin.weights).toEqual({ ml: 70, operationalRules: 30 });
  });

  test("configuração efetiva malformada falha explicitamente na fronteira", async () => {
    const repository = {
      ...createMockRepository(),
      resolveEffectiveRiskWeights: async () => ({
        weights: { mlWeight: 95, operationalRulesWeight: 20 },
        source: "client_override" as const,
        revision: 1,
        updatedAt: new Date().toISOString(),
      }),
    } satisfies AgroRiskRepository;
    await expect(resolveRiskEngineV2Weights("client-invalid", repository))
      .rejects.toBeInstanceOf(RangeError);
  });

  test("Operador rejeita contexto relacional de outro cliente", async () => {
    const { repository } = createRepository();
    const { phaseA, second } = await selectOperatorAndSecondClient(repository);
    const [clients, areas, machines] = await Promise.all([
      repository.listClients(),
      repository.listAreas(),
      repository.listMachines(),
    ]);
    const secondArea = areas.find((area) => area.clientId === second.clientId)!;
    const secondMachine = machines.find((machine) => machine.clientId === second.clientId)!;
    const secondClient = clients.find((client) => client.id === second.clientId)!;
    const mismatched = buildFallbackOperationRiskContext(
      phaseA.operation,
      secondMachine,
      secondArea,
      secondClient,
    );
    expect(() => assertOperationClientCoherence(phaseA.operation, mismatched)).toThrow(
      "Contexto relacional incoerente",
    );
    const source = readFileSync(
      new URL("../src/lib/operador-dashboard.server.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("assertOperationClientCoherence(operation, context)");
  });

  test("Gestor acumula lotes sequenciais de clientes diferentes no mesmo escopo", async () => {
    const { repository, weights } = createRepository();
    const { phaseA, second } = await selectOperatorAndSecondClient(repository);
    await weights.saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
    );
    await weights.saveClientRiskWeightOverride(
      phaseA.operation.clientId,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    );
    const scope = {
      userId: `sequential-${phaseA.operation.id}`,
      clientIds: [phaseA.operation.clientId, second.clientId],
    };
    const first = await evaluateGestorRiskBatch(
      scope,
      [phaseA.operation.id],
      1,
      repository,
    );
    expect(first.evaluatedOperationIds).toContain(phaseA.operation.id);
    const secondBatch = await evaluateGestorRiskBatch(
      scope,
      [second.id],
      1,
      repository,
    );
    expect(secondBatch.evaluatedOperationIds).toContain(phaseA.operation.id);
    expect(secondBatch.evaluatedOperationIds).toContain(second.id);
  });
});