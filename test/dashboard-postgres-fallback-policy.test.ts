import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";
import { loadConsultorDashboardSnapshot } from "../src/lib/consultor-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import type { AgroRiskRepository } from "../src/lib/data/repository";
import { loadGestorDashboardSnapshot } from "../src/lib/gestor-dashboard.server";
import { loadOperadorDashboardSnapshot } from "../src/lib/operador-dashboard.server";

const unrestrictedScope = { userId: "fallback-policy", clientIds: null };

const loadAllDashboards = (repository: AgroRiskRepository) => [
  loadAdminDashboardSnapshot(repository, mockRepository),
  loadGestorDashboardSnapshot(unrestrictedScope, repository, mockRepository),
  loadConsultorDashboardSnapshot(unrestrictedScope, repository, mockRepository),
  loadOperadorDashboardSnapshot("USR-OP-1", repository, mockRepository),
];

const expectAllRejectedWith = async (
  attempts: Promise<unknown>[],
  message?: string,
) => {
  const settled = await Promise.allSettled(attempts);
  expect(settled).toHaveLength(4);
  for (const result of settled) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBeInstanceOf(Error);
      if (message) expect(result.reason.message).toContain(message);
    }
  }
};

describe("Política PostgreSQL dos dashboards", () => {
  test("erro de query nunca é convertido em repository mock", async () => {
    const repository = {
      ...mockRepository,
      listClients: async () => {
        throw new Error("query failed: relation unavailable");
      },
    } satisfies AgroRiskRepository;

    await expectAllRejectedWith(loadAllDashboards(repository), "query failed");
  });

  test("inconsistência relacional nunca é convertida em repository mock", async () => {
    const repository = {
      ...mockRepository,
      listAreas: async () => {
        throw new Error("inconsistência relacional detectada");
      },
    } satisfies AgroRiskRepository;

    await expectAllRejectedWith(loadAllDashboards(repository), "inconsistência relacional");
  });

  test("as quatro telas mantêm estado terminal e ação de retry", () => {
    const routeExpectations = {
      admin: ["error", "retryDashboard", "Tentar novamente"],
      gestor: ["loadError", "setPhaseAAttempt", "Tentar novamente"],
      consultor: ["loadError", "setAttempt", "Tentar novamente"],
      operador: ["loadError", "setAttempt", "Tentar novamente"],
    } as const;

    for (const [route, expectedTokens] of Object.entries(routeExpectations)) {
      const source = readFileSync(
        new URL(`../src/routes/${route}.tsx`, import.meta.url),
        "utf8",
      );
      for (const token of expectedTokens) expect(source).toContain(token);
    }
  });
});