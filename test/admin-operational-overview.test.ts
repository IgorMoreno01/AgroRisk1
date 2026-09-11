import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { loadAccountsSeed } from "../scripts/import-agrorisk-accounts";
import {
  acknowledgeActionableAlerts,
  closeActionableAlertsRepository,
  listActionableAlerts,
} from "../src/lib/actionable-alerts.server";
import { loadAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";
import { createSession } from "../src/lib/auth-session.server";
import {
  closePostgresRepository,
  listAdminOperationalOverview,
} from "../src/lib/data/postgres-repository.server";

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const account = loadAccountsSeed().accounts.find((candidate) => candidate.profile === "admin")!;
let sessionResult: Awaited<ReturnType<typeof createSession>> & { ok: true };
let changedAlert: {
  id: string;
  status: string;
  viewedAt: unknown;
  acknowledgedAt: unknown;
} | null = null;

beforeAll(async () => {
  const result = await createSession("admin", account.email, account.password);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Admin/Sompo de integração indisponível.");
  sessionResult = result;
  expect(result.session.globalScope).toBe(true);
  expect(result.session.clientIds).toBeNull();
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

describe("visão operacional global do Admin/Sompo", () => {
  test("manutenção consolidada usa somente maintenance_records e respeita top 5", async () => {
    const overview = await listAdminOperationalOverview();
    const totals = await sql`
      SELECT count(*) FILTER (WHERE status='overdue')::int AS overdue,
        count(*) FILTER (WHERE status='due_soon')::int AS "dueSoon"
      FROM agrorisk.maintenance_records
      WHERE status IN ('overdue', 'due_soon')
    `;
    expect(overview.maintenance.overdueCount).toBe(Number(totals[0]?.overdue));
    expect(overview.maintenance.dueSoonCount).toBe(Number(totals[0]?.dueSoon));
    expect(overview.maintenance.top.length).toBeLessThanOrEqual(5);
    expect(new Set(overview.maintenance.top.map((item) => item.id)).size).toBe(
      overview.maintenance.top.length,
    );
    expect(overview.maintenance.top.every((item) =>
      item.status === "overdue" || item.status === "due_soon"
    )).toBe(true);
  });

  test("atividade recente é global, coerente e limitada a cinco registros", async () => {
    const overview = await listAdminOperationalOverview();
    expect(overview.activity.length).toBeLessThanOrEqual(5);
    expect(new Set(overview.activity.map((item) => item.id)).size).toBe(overview.activity.length);
    const total = await sql`SELECT count(*)::int AS count FROM agrorisk.operation_logs`;
    expect(overview.activity.length).toBe(Math.min(Number(total[0]?.count), 5));
    if (overview.activity.length > 0) {
      const coherent = await sql`
        SELECT count(*)::int AS count
        FROM agrorisk.operation_logs l
        JOIN agrorisk.operations o
          ON o.id=l.operation_id AND o.machine_id=l.machine_id AND o.operator_id=l.operator_id
        JOIN agrorisk.machines m
          ON m.id=o.machine_id AND m.client_id=o.client_id AND m.operator_id=l.operator_id
        WHERE l.id IN ${sql(overview.activity.map((item) => item.id))}
      `;
      expect(Number(coherent[0]?.count)).toBe(overview.activity.length);
    }
  });

  test("alertas globais permanecem ordenados, únicos e reconhecíveis", async () => {
    const snapshot = await listActionableAlerts(sessionResult.session);
    expect(snapshot.alerts.length).toBeGreaterThan(0);
    expect(new Set(snapshot.alerts.map((alert) => alert.id)).size).toBe(snapshot.alerts.length);
    const priority = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let index = 1; index < snapshot.alerts.length; index += 1) {
      const previous = snapshot.alerts[index - 1]!;
      const current = snapshot.alerts[index]!;
      expect(priority[previous.severity]).toBeLessThanOrEqual(priority[current.severity]);
      if (previous.severity === current.severity) {
        expect(Date.parse(previous.createdAt)).toBeGreaterThanOrEqual(Date.parse(current.createdAt));
      }
    }

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

  test("atividade e manutenção não alteram os scores existentes", async () => {
    const before = await loadAdminDashboardSnapshot();
    const scoreFingerprint = before.machineRows.map((row) => [
      row.machine.id,
      row.score,
      row.level,
      row.mainFactor,
    ]);
    expect(before.operationalOverview).toBeDefined();
    const after = await loadAdminDashboardSnapshot();
    expect(after.machineRows.map((row) => [
      row.machine.id,
      row.score,
      row.level,
      row.mainFactor,
    ])).toEqual(scoreFingerprint);
  });

  test("API aceita somente sessão e a rota não faz polling", () => {
    const api = readFileSync("src/lib/api/admin-dashboard.functions.ts", "utf8");
    const route = readFileSync("src/routes/admin.tsx", "utf8");
    const repository = readFileSync("src/lib/data/postgres-repository.server.ts", "utf8");
    expect(api).toContain("z.object({");
    expect(api).toContain("token:");
    expect(api).not.toMatch(/clientIds?|globalScope\s*:/);
    expect(api).toContain("session.globalScope");
    expect(route).toContain("getAdminDashboard({ data: { token } })");
    expect(route).not.toContain("setInterval");
    expect(repository.match(/LIMIT 5/g)?.length).toBeGreaterThanOrEqual(4);
  });

  test("layout mantém risco antes de alertas, manutenção e atividade", () => {
    const route = readFileSync("src/routes/admin.tsx", "utf8");
    const component = readFileSync("src/components/admin-operational-overview.tsx", "utf8");
    expect(route.indexOf("<SummaryCard")).toBeLessThan(route.indexOf("<AdminOperationalOverview"));
    expect(component.indexOf("Alertas acionáveis")).toBeLessThan(
      component.indexOf("Manutenção da carteira"),
    );
    expect(component.indexOf("Manutenção da carteira")).toBeLessThan(
      component.indexOf("Atividade operacional recente"),
    );
  });
});