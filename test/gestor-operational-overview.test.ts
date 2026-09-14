import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { loadAccountsSeed } from "../scripts/import-agrorisk-accounts";
import { acknowledgeActionableAlerts, closeActionableAlertsRepository, listActionableAlerts } from "../src/lib/actionable-alerts.server";
import { createSession } from "../src/lib/auth-session.server";
import { closePostgresRepository, listGestorOperationalOverview } from "../src/lib/data/postgres-repository.server";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const account = loadAccountsSeed().accounts.find((candidate) => candidate.id === "GST-003")!;
let sessionResult: Awaited<ReturnType<typeof createSession>> & { ok: true };
let changedAlert: {
  id: string;
  status: string;
  viewedAt: unknown;
  acknowledgedAt: unknown;
} | null = null;

beforeAll(async () => {
  const result = await createSession("gestor", account.email, account.password);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Gestor de integração indisponível.");
  sessionResult = result;
}, 30_000);

afterAll(async () => {
  try {
    if (changedAlert) {
      await sql`
        UPDATE agrorisk.actionable_alerts
        SET status=${changedAlert.status}, viewed_at=${changedAlert.viewedAt},
          acknowledged_at=${changedAlert.acknowledgedAt}, updated_at=now()
        WHERE id=${changedAlert.id}
      `;
    }
  } finally {
    await Promise.all([
      closeActionableAlertsRepository(),
      closePostgresRepository(),
      sql.end({ timeout: 1 }),
    ]);
  }
}, 30_000);

describe("visão operacional PostgreSQL do Gestor", () => {
  test("manutenção pertence somente às máquinas da carteira e respeita top 5", async () => {
    const clientIds = sessionResult.session.clientIds ?? [];
    const overview = await listGestorOperationalOverview(clientIds);
    expect(overview.maintenance.top.length).toBeLessThanOrEqual(5);
    expect(overview.maintenance.top.length).toBeGreaterThan(0);
    expect(overview.maintenance.top.every((item) => clientIds.includes(item.clientId))).toBe(true);
    expect(overview.maintenance.top.every((item) =>
      item.status === "overdue" || item.status === "due_soon"
    )).toBe(true);
  });

  test("atividade recente pertence aos Operadores e clientes da carteira", async () => {
    const clientIds = sessionResult.session.clientIds ?? [];
    const overview = await listGestorOperationalOverview(clientIds);
    expect(overview.activity.length).toBeGreaterThan(0);
    expect(overview.activity.length).toBeLessThanOrEqual(5);
    expect(overview.activity.every((item) => clientIds.includes(item.clientId))).toBe(true);
    const rows = await sql`
      SELECT count(*)::int AS count
      FROM agrorisk.operation_logs l
      JOIN agrorisk.operations o
        ON o.id=l.operation_id AND o.machine_id=l.machine_id AND o.operator_id=l.operator_id
      JOIN agrorisk.users u ON u.id=l.operator_id AND u.profile='operador'
      WHERE l.id IN ${sql(overview.activity.map((item) => item.id))}
        AND o.client_id = ANY(${clientIds})
    `;
    expect(Number(rows[0]?.count)).toBe(overview.activity.length);
  });

  test("cliente externo não aparece em manutenção nem atividade", async () => {
    const clientIds = sessionResult.session.clientIds ?? [];
    const overview = await listGestorOperationalOverview(clientIds);
    const external = await sql`
      SELECT id FROM agrorisk.clients
      WHERE NOT (id = ANY(${clientIds}))
      ORDER BY id LIMIT 1
    `;
    const externalId = String(external[0]?.id);
    expect(overview.maintenance.top.some((item) => item.clientId === externalId)).toBe(false);
    expect(overview.activity.some((item) => item.clientId === externalId)).toBe(false);
  });

  test("alertas persistentes pertencem à carteira e reconhecimento permanece individual", async () => {
    const clientIds = sessionResult.session.clientIds ?? [];
    const snapshot = await listActionableAlerts(sessionResult.session);
    expect(snapshot.alerts.every((alert) => alert.clientId !== null && clientIds.includes(alert.clientId))).toBe(true);
    const alert = snapshot.alerts.find((item) => item.status === "new");
    expect(alert).toBeTruthy();
    if (!alert) return;
    const original = await sql`
      SELECT id, status, viewed_at AS "viewedAt", acknowledged_at AS "acknowledgedAt"
      FROM agrorisk.actionable_alerts WHERE id=${alert.id}
    `;
    changedAlert = original[0] as typeof changedAlert;
    await acknowledgeActionableAlerts(sessionResult.session, [alert.id]);
    const refreshed = await listActionableAlerts(sessionResult.session);
    expect(refreshed.alerts.find((item) => item.id === alert.id)?.status).toBe("acknowledged");
  });

  test("cliente não é aceito por payload e consultas têm escopo e limites SQL", () => {
    const api = readFileSync("src/lib/api/gestor-dashboard.functions.ts", "utf8");
    const route = readFileSync("src/routes/gestor.tsx", "utf8");
    const repository = readFileSync("src/lib/data/postgres-repository.server.ts", "utf8");
    expect(api).toContain("z.object({ token:");
    expect(api).not.toMatch(/clientIds?\s*:/);
    expect(route).toContain("getGestorDashboard({ data: { token }, signal })");
    expect(repository).toContain("m.client_id = ANY");
    expect(repository).toContain("o.client_id = ANY");
    expect(repository.match(/LIMIT 5/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("layout mantém risco antes de alertas, manutenção e atividade", () => {
    const route = readFileSync("src/routes/gestor.tsx", "utf8");
    const component = readFileSync("src/components/gestor-operational-overview.tsx", "utf8");
    expect(route.indexOf("<PersonaV2RiskPanel")).toBeLessThan(route.indexOf("<GestorOperationalOverview"));
    expect(component.indexOf("Alertas acionáveis")).toBeLessThan(component.indexOf("Manutenção da frota"));
    expect(component.indexOf("Manutenção da frota")).toBeLessThan(component.indexOf("Atividade operacional recente"));
  });
});