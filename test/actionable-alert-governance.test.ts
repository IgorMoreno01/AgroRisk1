import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { loadAccountsSeed } from "../scripts/import-agrorisk-accounts";
import { acknowledgeActionableAlerts, closeActionableAlertsRepository, listActionableAlerts } from "../src/lib/actionable-alerts.server";
import { createSession } from "../src/lib/auth-session.server";

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const accounts = loadAccountsSeed().accounts.filter((account) => account.profile === "admin");
let firstSession: Awaited<ReturnType<typeof createSession>> & { ok: true };
let secondSession: Awaited<ReturnType<typeof createSession>> & { ok: true };
let scope: {
  clientId: string;
  operatorId: string;
  machineId: string;
  operationId: string;
};

async function insertAlert(input: {
  id: string;
  recipientUserId?: string;
  eventKey?: string;
  conditionKey?: string;
  type?: string;
  severity?: "low" | "medium" | "high" | "critical";
  status?: "new" | "resolved";
  createdAt?: string;
}) {
  const status = input.status ?? "new";
  const resolved = status === "resolved";
  await sql`
    INSERT INTO agrorisk.actionable_alerts (
      id, recipient_user_id, type, severity, title, message, status,
      client_id, operator_id, machine_id, operation_id, created_at,
      viewed_at, acknowledged_at, resolved_at, source, event_key,
      condition_key, updated_at
    ) VALUES (
      ${input.id},
      ${input.recipientUserId ?? firstSession.session.userId},
      ${input.type ?? "governance-test"},
      ${input.severity ?? "medium"},
      'Alerta temporário de governança',
      'Registro isolado para validar governança.',
      ${status},
      ${scope.clientId},
      ${scope.operatorId},
      ${scope.machineId},
      ${scope.operationId},
      ${input.createdAt ?? "2026-09-11T12:00:00-03:00"},
      ${resolved ? "2026-09-11T12:01:00-03:00" : null},
      ${resolved ? "2026-09-11T12:02:00-03:00" : null},
      ${resolved ? "2026-09-11T12:03:00-03:00" : null},
      ${`governance-test:${input.id}`},
      ${input.eventKey ?? `governance-test:${input.id}`},
      ${input.conditionKey ?? "active"},
      now()
    )
  `;
}

beforeAll(async () => {
  const first = await createSession("admin", accounts[0]!.email, accounts[0]!.password);
  const second = await createSession("admin", accounts[1]!.email, accounts[1]!.password);
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  if (!first.ok || !second.ok) throw new Error("Contas Admin de teste indisponíveis.");
  firstSession = first;
  secondSession = second;
  const rows = await sql`
    SELECT o.client_id AS "clientId", o.operator_id AS "operatorId",
      o.machine_id AS "machineId", o.id AS "operationId"
    FROM agrorisk.operations o
    WHERE NOT EXISTS (
      SELECT 1
      FROM agrorisk.actionable_alerts a
      WHERE a.recipient_user_id = ${first.session.userId}
        AND a.machine_id = o.machine_id
        AND a.type = 'maintenance'
        AND a.status <> 'resolved'
    )
    ORDER BY o.id
    LIMIT 1
  `;
  scope = rows[0] as typeof scope;
  await sql`DELETE FROM agrorisk.actionable_alerts WHERE source LIKE 'governance-test:%'`;
}, 30_000);

afterEach(async () => {
  await sql`DELETE FROM agrorisk.actionable_alerts WHERE source LIKE 'governance-test:%'`;
});

afterAll(async () => {
  await closeActionableAlertsRepository();
  await sql.end({ timeout: 1 });
}, 30_000);

describe("governança dos alertas persistentes", () => {
  test("mesmo evento não cria alerta ativo duplicado para o mesmo usuário", async () => {
    await insertAlert({ id: "governance-event-1", eventKey: "same-logical-event" });
    expect(insertAlert({ id: "governance-event-2", eventKey: "same-logical-event" })).rejects.toThrow();
  });

  test("resolved sai da lista principal", async () => {
    await insertAlert({ id: "governance-resolved", status: "resolved" });
    const snapshot = await listActionableAlerts(firstSession.session);
    expect(snapshot.alerts.some((alert) => alert.id === "governance-resolved")).toBe(false);
  });

  test("badge ignora resolvidos", async () => {
    const before = await listActionableAlerts(firstSession.session);
    await insertAlert({ id: "governance-resolved-badge", status: "resolved" });
    const after = await listActionableAlerts(firstSession.session);
    expect(after.unreadCount).toBe(before.unreadCount);
  });

  test("severidade ordena critical, high, medium e low", async () => {
    const snapshot = await listActionableAlerts(firstSession.session);
    const rank = { critical: 1, high: 2, medium: 3, low: 4 };
    const positions = snapshot.alerts.map((alert) => rank[alert.severity]);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("recência decrescente funciona dentro da severidade", async () => {
    const snapshot = await listActionableAlerts(firstSession.session);
    for (const severity of ["critical", "high", "medium", "low"] as const) {
      const dates = snapshot.alerts
        .filter((alert) => alert.severity === severity)
        .map((alert) => Date.parse(alert.createdAt));
      expect(dates).toEqual([...dates].sort((a, b) => b - a));
    }
  });

  test("manutenção próxima não duplica", async () => {
    await insertAlert({
      id: "governance-due-1",
      type: "maintenance",
      conditionKey: "due_soon",
      eventKey: "maintenance-due-1",
    });
    expect(insertAlert({
      id: "governance-due-2",
      type: "maintenance",
      conditionKey: "due_soon",
      eventKey: "maintenance-due-2",
    })).rejects.toThrow();
  });

  test("manutenção atrasada não duplica", async () => {
    await insertAlert({
      id: "governance-overdue-1",
      type: "maintenance",
      conditionKey: "overdue",
      eventKey: "maintenance-overdue-1",
      severity: "high",
    });
    expect(insertAlert({
      id: "governance-overdue-2",
      type: "maintenance",
      conditionKey: "overdue",
      eventKey: "maintenance-overdue-2",
      severity: "high",
    })).rejects.toThrow();
  });

  test("mudança de condição resolve a anterior sem acumular", async () => {
    await insertAlert({
      id: "governance-condition-due",
      type: "maintenance",
      conditionKey: "due_soon",
      eventKey: "maintenance-condition-due",
    });
    await insertAlert({
      id: "governance-condition-overdue",
      type: "maintenance",
      conditionKey: "overdue",
      eventKey: "maintenance-condition-overdue",
      severity: "high",
    });
    const rows = await sql`
      SELECT id, status, condition_key AS "conditionKey"
      FROM agrorisk.actionable_alerts
      WHERE id IN ('governance-condition-due', 'governance-condition-overdue')
      ORDER BY id
    `;
    expect(rows).toEqual([
      { id: "governance-condition-due", status: "resolved", conditionKey: "due_soon" },
      { id: "governance-condition-overdue", status: "new", conditionKey: "overdue" },
    ]);
  });

  test("usuários diferentes mantêm estados independentes", async () => {
    await insertAlert({
      id: "governance-user-first",
      recipientUserId: firstSession.session.userId,
      eventKey: "shared-event",
    });
    await insertAlert({
      id: "governance-user-second",
      recipientUserId: secondSession.session.userId,
      eventKey: "shared-event",
    });
    await acknowledgeActionableAlerts(firstSession.session, ["governance-user-first"]);
    const rows = await sql`
      SELECT recipient_user_id AS "recipientUserId", status
      FROM agrorisk.actionable_alerts
      WHERE id IN ('governance-user-first', 'governance-user-second')
      ORDER BY recipient_user_id
    `;
    expect(rows.find((row) => row.recipientUserId === firstSession.session.userId)?.status).toBe("acknowledged");
    expect(rows.find((row) => row.recipientUserId === secondSession.session.userId)?.status).toBe("new");
  });
});