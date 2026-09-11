import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadAccountsSeed } from "../scripts/import-agrorisk-accounts";
import {
  authenticateAccount,
  closeAuthAccountRepository,
} from "../src/lib/auth-account.server";
import { closePostgresRepository } from "../src/lib/data/postgres-repository.server";
import { loadOperadorDashboardSnapshot } from "../src/lib/operador-dashboard.server";

const operatorIds = ["OPR-010", "OPR-001", "OPR-021"];

afterAll(async () => {
  await Promise.all([closeAuthAccountRepository(), closePostgresRepository()]);
});

describe("Identidade visual do Operador autenticado", () => {
  test("mantém três contas isoladas pelo próprio linked_operator_id", async () => {
    const accounts = loadAccountsSeed().accounts.filter((account) =>
      operatorIds.includes(account.id)
    );
    expect(accounts).toHaveLength(3);

    const contexts = [];
    for (const account of accounts) {
      const authenticated = await authenticateAccount(
        "operador",
        account.email,
        account.password,
      );
      expect(authenticated.ok).toBe(true);
      if (!authenticated.ok || !authenticated.account.linkedOperatorId) continue;

      const linkedOperatorId = authenticated.account.linkedOperatorId;
      const snapshot = await loadOperadorDashboardSnapshot(linkedOperatorId);
      expect(linkedOperatorId).toBe(account.id);
      expect(snapshot.source).toBe("postgres");
      expect(snapshot.degraded).toBe(false);
      expect(snapshot.operator.id).toBe(linkedOperatorId);
      expect(snapshot.operator.name).toBe(account.name);
      expect(snapshot.operation.operatorId).toBe(linkedOperatorId);
      expect(snapshot.machine.operatorId).toBe(linkedOperatorId);
      expect(snapshot.machine.id).toBe(snapshot.operation.machineId);
      expect(snapshot.area.id).toBe(snapshot.operation.areaId);
      expect(snapshot.client.id).toBe(snapshot.operation.clientId);
      expect(JSON.stringify(snapshot)).not.toContain("Carlos Mendes");
      contexts.push({
        operatorId: snapshot.operator.id,
        operationId: snapshot.operation.id,
        machineId: snapshot.machine.id,
        areaId: snapshot.area.id,
        clientId: snapshot.client.id,
      });
    }

    expect(new Set(contexts.map((context) => context.operatorId)).size).toBe(3);
    expect(new Set(contexts.map((context) => context.operationId)).size).toBe(3);
    expect(new Set(contexts.map((context) => context.machineId)).size).toBe(3);
    expect(new Set(contexts.map((context) => context.clientId)).size).toBe(3);
  }, 30_000);

  test("Sidebar e menu recebem o snapshot e não selecionam Operador mock", () => {
    const layout = readFileSync(
      new URL("../src/components/app-layout.tsx", import.meta.url),
      "utf8",
    );
    const menu = readFileSync(
      new URL("../src/components/header-menus.tsx", import.meta.url),
      "utf8",
    );
    const route = readFileSync(
      new URL("../src/routes/operador.tsx", import.meta.url),
      "utf8",
    );

    expect(route).toContain("name: snapshot.operator.name");
    expect(route).toContain("userId: snapshot.operator.id");
    expect(route).toContain("clientName: client.name");
    expect(layout).not.toContain("userFor(");
    expect(layout).not.toContain("clientFor(");
    expect(layout).toContain("account.name");
    expect(layout).not.toContain("OP-1001");
    expect(menu).not.toContain("operations[0]");
    expect(menu).not.toContain("Carlos Mendes");
    expect(menu).not.toContain("userFor(");
    expect(menu).not.toContain("clientFor(");
  });
});