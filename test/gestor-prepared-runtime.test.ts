import { describe, expect, test } from "bun:test";
import { loadGestorDashboardSnapshot, evaluateGestorRiskBatch } from "../src/lib/gestor-dashboard.server";
import { selectGestorPriorityOperationIds } from "../src/lib/gestor-risk-selection";
import { gestorRiskBatchInputSchema } from "../src/lib/api/gestor-dashboard.functions";
import { listOperationRiskContexts } from "../src/lib/data/postgres-repository.server";
import { evaluateOperationRiskV2 } from "../src/lib/risk-engine-v2/operation-input.server";

describe("Gestor · contrato real e runtime preparado", () => {
  test("Fase A não avalia risco; primeiro payload é string[] unitário válido no schema real; paridade sem fetch", async () => {
    const originalFetch = globalThis.fetch;
    let externalCalls = 0;
    globalThis.fetch = (() => {
      externalCalls += 1;
      throw new Error("API externa proibida no runtime do Gestor");
    }) as typeof fetch;
    try {
      const scope = { userId: "gestor-prepared-runtime-validation", clientIds: null };
      const relational = await loadGestorDashboardSnapshot(scope);
      expect(relational.source).toBe("postgres");
      expect(relational.operationRows).toEqual([]);
      expect(externalCalls).toBe(0);
      const ids = selectGestorPriorityOperationIds(relational.operations, [], 1);
      expect(ids).toHaveLength(1);
      expect(ids.every(id => typeof id === "string")).toBe(true);
      expect(gestorRiskBatchInputSchema.safeParse({
        token: "validation-only", operationIds: ids, limit: 1,
      }).success).toBe(true);
      expect(gestorRiskBatchInputSchema.safeParse({
        token: "validation-only", operationIds: [ids[0], relational.operations[0]], limit: 1,
      }).success).toBe(false);
      const contexts = await listOperationRiskContexts({ operationIds: ids });
      const context = contexts[0]!;
      expect(context).toBeDefined();
      expect(context.preparedInput).toBeDefined();
      const result = await evaluateGestorRiskBatch(scope, ids, 1);
      const row = result.operationRows.find(row => row.operation.id === ids[0])!;
      expect(row).toBeDefined();
      const direct = await evaluateOperationRiskV2(context, row.evaluation.input.weights);
      expect(row.evaluation.input.mlInput).toEqual(direct.input.mlInput);
      expect(row.evaluation.input.operationalRulesInput).toEqual(direct.input.operationalRulesInput);
      for (const key of ["mlRelativeScore", "operationalRulesScore", "finalScore", "level", "drivers"] as const) {
        expect(row.evaluation.result[key]).toEqual(direct.result[key]);
      }
      expect(result.evaluatedOperationIds).toEqual(ids);
      expect(externalCalls).toBe(0);
      // Missing prepared data follows the existing official fallback in memory;
      // neither the test nor the persona writes/repairs snapshots.
      const missing = await evaluateOperationRiskV2(
        { ...context, preparedInput: null },
        row.evaluation.input.weights,
      );
      expect(missing.hasIncompleteInputs).toBe(true);
      expect(Number.isFinite(missing.result.finalScore)).toBe(true);
      expect(externalCalls).toBe(0);
      const nextIds = relational.operations.filter(operation => !ids.includes(operation.id))
        .slice(0, 2).map(operation => operation.id);
      const secondary = await evaluateGestorRiskBatch(scope, nextIds, 2);
      expect(nextIds.every(id => secondary.evaluatedOperationIds.includes(id))).toBe(true);
      expect(externalCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});