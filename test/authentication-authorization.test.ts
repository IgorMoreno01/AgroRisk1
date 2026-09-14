import { afterAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { loadAccountsSeed } from "../scripts/import-agrorisk-accounts";
import {
  authenticateAccount,
  closeAuthAccountRepository,
  getAccountClientScope,
} from "../src/lib/auth-account.server";
import { createSession, readSession } from "../src/lib/auth-session.server";
import {
  evaluateAdminDashboardRiskBatch,
  loadAdminDashboardSnapshot,
} from "../src/lib/admin-dashboard.server";
import { evaluateGestorRiskBatch, loadGestorDashboardSnapshot } from "../src/lib/gestor-dashboard.server";
import { evaluateConsultorRiskBatch, loadConsultorDashboardSnapshot } from "../src/lib/consultor-dashboard.server";
import { loadOperadorDashboardSnapshot } from "../src/lib/operador-dashboard.server";
import {
  closePostgresRepository,
  getOperatorRelationalScope,
  postgresRepository,
} from "../src/lib/data/postgres-repository.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";

const seed = loadAccountsSeed();
const account = (profile: "admin" | "gestor" | "consultor" | "operador", index = 0) =>
  seed.accounts.filter((candidate) => candidate.profile === profile)[index]!;

afterAll(async () => {
  await Promise.all([closeAuthAccountRepository(), closePostgresRepository()]);
});

describe("Autenticação PostgreSQL e autorização por escopo", () => {
  for (const profile of ["admin", "gestor", "consultor", "operador"] as const) {
    test(`aceita uma conta ${profile} válida`, async () => {
      const candidate = account(profile);
      const result = await createSession(profile, candidate.email, candidate.password);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.session).toMatchObject({
        userId: candidate.id,
        profile,
        email: candidate.email,
      });
      expect(result.session).not.toHaveProperty("passwordHash");
      expect(result.token).not.toContain(candidate.password);
    });
  }

  test("bloqueia senha incorreta", async () => {
    const candidate = account("gestor");
    expect(await authenticateAccount("gestor", candidate.email, "senha-incorreta")).toEqual({
      ok: false,
      reason: "INVALID_CREDENTIALS",
    });
  });

  test("bloqueia email inexistente", async () => {
    expect(await authenticateAccount("gestor", "inexistente@agrorisk.demo", "qualquer")).toEqual({
      ok: false,
      reason: "INVALID_CREDENTIALS",
    });
  });

  test("bloqueia perfil selecionado diferente do perfil da conta", async () => {
    const candidate = account("consultor");
    expect(await authenticateAccount("gestor", candidate.email, candidate.password)).toEqual({
      ok: false,
      reason: "PROFILE_MISMATCH",
    });
  });

  test("bloqueia conta inativa", async () => {
    const candidate = account("gestor", 9);
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
      await sql`UPDATE agrorisk.users SET status = 'inactive' WHERE id = ${candidate.id}`;
      expect(await authenticateAccount("gestor", candidate.email, candidate.password)).toEqual({
        ok: false,
        reason: "INACTIVE_ACCOUNT",
      });
    } finally {
      await sql`UPDATE agrorisk.users SET status = 'active' WHERE id = ${candidate.id}`;
      await sql.end({ timeout: 1 });
    }
  });

  test("Admin mantém acesso global com sessão mínima", async () => {
    const candidate = account("admin");
    const result = await createSession("admin", candidate.email, candidate.password);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.globalScope).toBe(true);
    const payload = JSON.parse(
      Buffer.from(result.token.split(".")[0]!, "base64url").toString("utf8"),
    );
    expect(Object.keys(payload).sort()).toEqual(["exp", "u"]);
    expect(payload).not.toHaveProperty("password_hash");
    expect((await readSession(result.token))?.allowedRoutes).toContain("/admin");
  });

  test("rejeita token adulterado", async () => {
    const candidate = account("admin");
    const result = await createSession("admin", candidate.email, candidate.password);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [payload, signature] = result.token.split(".");
    expect(await readSession(`${payload}x.${signature}`)).toBeNull();
  });

  test("revoga sessão quando a conta é desativada após o login", async () => {
    const candidate = account("gestor", 8);
    const result = await createSession("gestor", candidate.email, candidate.password);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
      await sql`UPDATE agrorisk.users SET status = 'inactive' WHERE id = ${candidate.id}`;
      expect(await readSession(result.token)).toBeNull();
    } finally {
      await sql`UPDATE agrorisk.users SET status = 'active' WHERE id = ${candidate.id}`;
      await sql.end({ timeout: 1 });
    }
  });

  test("Gestor recebe somente os clientes vinculados", async () => {
    const candidate = account("gestor");
    const clientIds = await getAccountClientScope(candidate.id);
    const snapshot = await loadGestorDashboardSnapshot(
      { userId: candidate.id, clientIds },
      postgresRepository,
      mockRepository,
    );
    const visible = new Set(snapshot.clients.map((client) => client.id));
    expect(visible).toEqual(new Set(clientIds));
    expect(visible.has("CL-006")).toBe(false);
    expect(snapshot.machineRows.every((row) => visible.has(row.machine.clientId))).toBe(true);
    expect(snapshot.areaRows.every((row) => visible.has(row.area.clientId))).toBe(true);
    expect(snapshot.operationRows.every((row) => visible.has(row.operation.clientId))).toBe(true);
  });

  test("Consultor recebe somente a carteira vinculada", async () => {
    const candidate = account("consultor");
    const clientIds = await getAccountClientScope(candidate.id);
    const snapshot = await loadConsultorDashboardSnapshot(
      { userId: candidate.id, clientIds },
      postgresRepository,
      mockRepository,
    );
    const visible = new Set(snapshot.clients.map((view) => view.client.id));
    expect(visible).toEqual(new Set(clientIds));
    expect(visible.has("CL-002")).toBe(false);
    expect(snapshot.clients.every((view) =>
      view.machines.every((row) => visible.has(row.machine.clientId)) &&
      view.areas.every((row) => visible.has(row.area.clientId))
    )).toBe(true);
  });

  test("Operador recebe somente suas próprias operações", async () => {
    const candidate = account("operador");
    const authenticated = await authenticateAccount("operador", candidate.email, candidate.password);
    expect(authenticated.ok).toBe(true);
    if (!authenticated.ok || !authenticated.account.linkedOperatorId) return;
    const snapshot = await loadOperadorDashboardSnapshot(
      authenticated.account.linkedOperatorId,
      postgresRepository,
      mockRepository,
    );
    const other = await getOperatorRelationalScope("OPR-002");
    expect(snapshot.operator.id).toBe(candidate.id);
    expect(snapshot.operation.operatorId).toBe(candidate.id);
    expect(snapshot.operation.id).not.toBe(other.operations[0]?.id);
    expect(snapshot.machine.operatorId).toBe(candidate.id);
  });

  test("scores das entidades visíveis permanecem idênticos ao Admin", async () => {
    const manager = account("gestor");
    const consultant = account("consultor");
    const operator = account("operador");
    const operador = await loadOperadorDashboardSnapshot(
      operator.linked_operator_id!,
      postgresRepository,
      mockRepository,
    );
    const operationId = operador.operation.id;
    const [managerClientIds, consultantClientIds] = await Promise.all([
      getAccountClientScope(manager.id),
      getAccountClientScope(consultant.id),
    ]);
    expect(managerClientIds).toContain(operador.operation.clientId);
    expect(consultantClientIds).toContain(operador.operation.clientId);
    const [adminRows, gestor, consultor] = await Promise.all([
      evaluateAdminDashboardRiskBatch([operationId], 1),
      evaluateGestorRiskBatch(
        { userId: manager.id, clientIds: managerClientIds },
        [operationId],
        1,
      ),
      evaluateConsultorRiskBatch(
        { userId: consultant.id, clientIds: consultantClientIds },
        operador.operation.clientId,
        [operationId],
        1,
      ),
    ]);
    const adminRow = adminRows.find((row) => row.operation.id === operationId);
    const gestorRow = gestor.operationRows.find((row) => row.operation.id === operationId);
    const consultorRow = consultor.machines.find((row) => row.operation?.id === operationId);
    expect(adminRow).toBeDefined();
    expect(gestorRow).toBeDefined();
    expect(consultorRow).toBeDefined();
    expect(adminRow!.score).toBe(operador.risk.finalScore);
    expect(gestorRow!.score).toBe(adminRow!.score);
    expect(consultorRow!.score).toBe(adminRow!.score);
    expect(gestorRow!.evaluation.input).toEqual(adminRow!.evaluation.input);
    expect(consultorRow!.evaluation.input).toEqual(adminRow!.evaluation.input);
    expect(operador.evaluationContext.input).toEqual(adminRow!.evaluation.input);
  });
});