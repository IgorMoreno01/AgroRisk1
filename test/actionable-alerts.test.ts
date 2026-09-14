import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { loadAccountsSeed } from "../scripts/import-agrorisk-accounts";
import { createSession } from "../src/lib/auth-session.server";
import {
  acknowledgeActionableAlerts,
  closeActionableAlertsRepository,
  listActionableAlerts,
  markActionableAlertsViewed,
} from "../src/lib/actionable-alerts.server";

const accounts = loadAccountsSeed().accounts;
const account = (profile: "admin" | "gestor" | "consultor" | "operador", index = 0) =>
  accounts.filter((candidate) => candidate.profile === profile)[index]!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const sessions: Record<string, Awaited<ReturnType<typeof createSession>> & { ok: true }> = {};
const originals = new Map<string, { status: string; viewedAt: unknown; acknowledgedAt: unknown; resolvedAt: unknown }>();

async function login(profile: "admin" | "gestor" | "consultor" | "operador") {
  const candidate = account(profile);
  const result = await createSession(profile, candidate.email, candidate.password);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Não foi possível autenticar ${profile}`);
  sessions[profile] = result;
  return result.session;
}

async function remember(id: string) {
  if (originals.has(id)) return;
  const rows = await sql`
    SELECT status, viewed_at AS "viewedAt", acknowledged_at AS "acknowledgedAt",
      resolved_at AS "resolvedAt"
    FROM agrorisk.actionable_alerts WHERE id=${id}`;
  if (rows[0]) originals.set(id, rows[0] as typeof originals extends Map<string, infer V> ? V : never);
}

beforeAll(async () => {
  await Promise.all(["admin", "gestor", "consultor", "operador"].map((profile) => login(profile as never)));
}, 30_000);

afterAll(async () => {
  try {
    for (const [id, row] of originals) {
      await sql`
        UPDATE agrorisk.actionable_alerts
        SET status=${row.status}, viewed_at=${row.viewedAt}, acknowledged_at=${row.acknowledgedAt},
          resolved_at=${row.resolvedAt}, updated_at=now()
        WHERE id=${id}`;
    }
  } finally {
    await closeActionableAlertsRepository();
    await sql.end({ timeout: 1 });
  }
}, 30_000);

describe("alertas acionáveis persistentes", () => {
  test("deriva badge de não lidos somente do status new", async () => {
    const snapshot = await listActionableAlerts(sessions.admin.session);
    expect(snapshot.unreadCount).toBe(snapshot.alerts.filter((alert) => alert.status === "new").length);
  });

  test("persiste visualização", async () => {
    const session = sessions.admin.session;
    const alert = (await listActionableAlerts(session)).alerts.find((item) => item.status === "new");
    expect(alert).toBeTruthy();
    if (!alert) return;
    await remember(alert.id);
    const changed = await markActionableAlertsViewed(session, [alert.id]);
    expect(changed[0]).toMatchObject({ id: alert.id, status: "viewed" });
    expect(changed[0]?.viewedAt).toBeTruthy();
  });

  test("persiste reconhecimento e timestamps server-side", async () => {
    const session = sessions.admin.session;
    const alert = (await listActionableAlerts(session)).alerts.find((item) => item.status === "new");
    expect(alert).toBeTruthy();
    if (!alert) return;
    await remember(alert.id);
    const changed = await acknowledgeActionableAlerts(session, [alert.id]);
    expect(changed[0]).toMatchObject({ id: alert.id, status: "acknowledged" });
    expect(changed[0]?.viewedAt).toBeTruthy();
    expect(changed[0]?.acknowledgedAt).toBeTruthy();
  });

  test("refresh preserva estados persistidos", async () => {
    const first = await listActionableAlerts(sessions.admin.session);
    const refreshed = await listActionableAlerts(sessions.admin.session);
    expect(refreshed).toEqual(first);
  });

  test("mantém ao menos um alerta crítico originado de fonte permitida", async () => {
    const snapshot = await listActionableAlerts(sessions.admin.session);
    expect(snapshot.alerts.some((alert) =>
      alert.severity === "critical"
      && (
        alert.source.startsWith("agrorisk.alerts:")
        || alert.source.startsWith("synthetic_inclination:")
        || alert.source.startsWith("demo_alert:")
      )
    )).toBe(true);
  });

  test("Operador fica isolado na operação e máquina atuais", async () => {
    const own = await listActionableAlerts(sessions.operador.session);
    const admin = await listActionableAlerts(sessions.admin.session);
    expect(own.alerts.every((alert) => alert.operatorId === sessions.operador.session.linkedOperatorId)).toBe(true);
    expect(new Set(own.alerts.map((alert) => alert.operationId)).size).toBeLessThanOrEqual(1);
    expect(new Set(own.alerts.map((alert) => alert.machineId)).size).toBeLessThanOrEqual(1);
    expect(admin.alerts.some((alert) => alert.operatorId !== sessions.operador.session.linkedOperatorId)).toBe(true);
  });

  test("Gestor recebe somente seus clientes", async () => {
    const session = sessions.gestor.session;
    const snapshot = await listActionableAlerts(session);
    expect(snapshot.alerts.every((alert) => !alert.clientId || session.clientIds?.includes(alert.clientId))).toBe(true);
  });

  test("Consultor recebe somente seus clientes", async () => {
    const session = sessions.consultor.session;
    const snapshot = await listActionableAlerts(session);
    expect(snapshot.alerts.every((alert) => !alert.clientId || session.clientIds?.includes(alert.clientId))).toBe(true);
  });

  test("Admin global acessa os alertas de todas as carteiras", async () => {
    const admin = await listActionableAlerts(sessions.admin.session);
    const gestor = await listActionableAlerts(sessions.gestor.session);
    expect(admin.alerts.length).toBeGreaterThanOrEqual(gestor.alerts.length);
    expect(sessions.admin.session.globalScope).toBe(true);
  });

  test("manutenção mantém origem due/overdue e não altera score de risco", async () => {
    const rows = await sql`
      SELECT a.id, a.machine_id AS "machineId", a.operation_id AS "operationId",
        a.source, m.score
      FROM agrorisk.actionable_alerts a
      JOIN agrorisk.machines m ON m.id=a.machine_id
      WHERE a.type='maintenance' AND a.source LIKE 'maintenance_records:%'
      LIMIT 1`;
    expect(rows[0]).toBeTruthy();
    if (!rows[0]) return;
    const before = Number(rows[0].score);
    expect(String(rows[0].source)).toMatch(/^maintenance_records:/);
    expect(rows[0].operationId).toBeTruthy();
    await listActionableAlerts(sessions.admin.session);
    const after = await sql`SELECT score FROM agrorisk.machines WHERE id=${rows[0].machineId}`;
    expect(Number(after[0]?.score)).toBe(before);
  });
});