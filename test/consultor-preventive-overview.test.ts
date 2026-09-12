import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { loadAccountsSeed } from "../scripts/import-agrorisk-accounts";
import {
  acknowledgeActionableAlerts,
  closeActionableAlertsRepository,
  listActionableAlerts,
} from "../src/lib/actionable-alerts.server";
import { createSession } from "../src/lib/auth-session.server";
import {
  closePostgresRepository,
  listConsultorPreventiveOverview,
} from "../src/lib/data/postgres-repository.server";

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const account = loadAccountsSeed().accounts.find((candidate) => candidate.id === "CST-001")!;
let sessionResult: Awaited<ReturnType<typeof createSession>> & { ok: true };
let changedAlert: {
  id: string;
  status: string;
  viewedAt: unknown;
  acknowledgedAt: unknown;
} | null = null;

beforeAll(async () => {
  const result = await createSession("consultor", account.email, account.password);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Consultor de integração indisponível.");
  sessionResult = result;
  expect(result.session.globalScope).toBe(false);
  expect(result.session.clientIds?.length).toBeGreaterThan(0);
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

describe("visão preventiva PostgreSQL do Consultor", () => {
  test("manutenção pertence somente às máquinas da carteira e respeita top 5", async () => {
    const clientIds = sessionResult.session.clientIds ?? [];
    const overview = await listConsultorPreventiveOverview(clientIds);
    const totals = await sql`
      SELECT count(*) FILTER (WHERE r.status='overdue')::int AS overdue,
        count(*) FILTER (WHERE r.status='due_soon')::int AS "dueSoon"
      FROM agrorisk.maintenance_records r
      JOIN agrorisk.machines m ON m.id=r.machine_id
      WHERE m.client_id = ANY(${clientIds}) AND r.status IN ('overdue','due_soon')
    `;
    expect(overview.maintenance.overdueCount).toBe(Number(totals[0]?.overdue));
    expect(overview.maintenance.dueSoonCount).toBe(Number(totals[0]?.dueSoon));
    expect(overview.maintenance.top.length).toBeLessThanOrEqual(5);
    expect(overview.maintenance.top.length).toBeGreaterThan(0);
    expect(overview.maintenance.top.every((item) => clientIds.includes(item.clientId))).toBe(true);
    expect(overview.maintenance.top.every((item) =>
      item.status === "overdue" || item.status === "due_soon"
    )).toBe(true);
  });

  test("pontos de atenção aplicam filtro útil, escopo e limite no servidor", async () => {
    const clientIds = sessionResult.session.clientIds ?? [];
    const overview = await listConsultorPreventiveOverview(clientIds);
    expect(overview.attentionPoints.length).toBeLessThanOrEqual(5);
    expect(overview.attentionPoints.every((item) => clientIds.includes(item.clientId))).toBe(true);
    expect(overview.attentionPoints.every((item) =>
      Boolean(item.observation?.trim()) ||
      ["interrupted", "paused", "error", "cancelled"].includes(item.status.toLowerCase())
    )).toBe(true);
  });

  test("cliente externo não aparece em manutenção nem pontos de atenção", async () => {
    const clientIds = sessionResult.session.clientIds ?? [];
    const overview = await listConsultorPreventiveOverview(clientIds);
    const external = await sql`
      SELECT id FROM agrorisk.clients
      WHERE NOT (id = ANY(${clientIds}))
      ORDER BY id LIMIT 1
    `;
    const externalId = String(external[0]?.id);
    expect(overview.maintenance.top.some((item) => item.clientId === externalId)).toBe(false);
    expect(overview.attentionPoints.some((item) => item.clientId === externalId)).toBe(false);
  });

  test("alertas respeitam a carteira e reconhecimento permanece persistente", async () => {
    const clientIds = sessionResult.session.clientIds ?? [];
    const snapshot = await listActionableAlerts(sessionResult.session);
    expect(snapshot.alerts.length).toBeGreaterThan(0);
    expect(snapshot.alerts.every((alert) =>
      alert.clientId !== null && clientIds.includes(alert.clientId)
    )).toBe(true);
    expect(new Set(snapshot.alerts.map((alert) => alert.id)).size).toBe(snapshot.alerts.length);
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

  test("API aceita somente sessão e SQL aplica escopo, filtros e limites", () => {
    const api = readFileSync("src/lib/api/consultor-dashboard.functions.ts", "utf8");
    const route = readFileSync("src/routes/consultor.tsx", "utf8");
    const repository = readFileSync("src/lib/data/postgres-repository.server.ts", "utf8");
    expect(api).toContain("z.object({ token:");
    expect(api).not.toContain("clientIds: z.");
    expect(route).toContain("getConsultorDashboard({ data: { token } })");
    expect(route).not.toContain("setInterval");
    expect(repository).toContain("m.client_id = ANY");
    expect(repository).toContain("o.client_id = ANY");
    expect(repository).toContain("nullif(btrim(l.observation), '') IS NOT NULL");
    expect(repository.match(/LIMIT 5/g)?.length).toBeGreaterThanOrEqual(6);
  });

  test("layout mantém risco e recomendação antes dos blocos preventivos", () => {
    const route = readFileSync("src/routes/consultor.tsx", "utf8");
    const component = readFileSync("src/components/consultor-preventive-overview.tsx", "utf8");
    expect(route.indexOf("<PersonaV2RiskPanel")).toBeLessThan(route.indexOf("<RecommendationCard"));
    expect(route.indexOf("<RecommendationCard")).toBeLessThan(route.indexOf("<ConsultorPreventiveOverview"));
    expect(component.indexOf("Alertas da carteira")).toBeLessThan(
      component.indexOf("Manutenção preventiva dos clientes"),
    );
    expect(component.indexOf("Manutenção preventiva dos clientes")).toBeLessThan(
      component.indexOf("Pontos de atenção recentes"),
    );
  });
});