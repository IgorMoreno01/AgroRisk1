import postgres from "postgres";
import process from "node:process";
import type { Session } from "./auth-session.server";
import type { ActionableAlert, ActionableAlertsSnapshot } from "./actionable-alerts-types";

let client: postgres.Sql | undefined;
function db() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não está configurada para alertas acionáveis.");
  client = postgres(url, { max: 4, prepare: false });
  return client;
}

type QueryScope = { clientIds: string[] | null; operatorId: string | null; operationId: string | null; machineId: string | null };
async function scope(sql: postgres.Sql | postgres.TransactionSql, session: Session): Promise<QueryScope> {
  if (session.profile === "admin" && session.globalScope) return { clientIds: null, operatorId: null, operationId: null, machineId: null };
  if (session.profile === "operador" && session.linkedOperatorId) {
    const rows = await sql`
      SELECT o.id AS "operationId", o.machine_id AS "machineId"
      FROM agrorisk.operations o JOIN agrorisk.machines m
        ON m.id=o.machine_id AND m.operator_id=o.operator_id AND m.client_id=o.client_id AND m.area_id=o.area_id
      WHERE o.operator_id=${session.linkedOperatorId}
      ORDER BY (o.status='Em andamento') DESC, o.scheduled_at DESC, o.id LIMIT 1`;
    const row = rows[0];
    return { clientIds: [], operatorId: session.linkedOperatorId, operationId: row ? String(row.operationId) : null, machineId: row ? String(row.machineId) : null };
  }
  return { clientIds: session.clientIds ?? [], operatorId: null, operationId: null, machineId: null };
}

function where(scopeValue: QueryScope, sql: postgres.Sql | postgres.TransactionSql) {
  if (scopeValue.clientIds === null) return sql`TRUE`;
  if (scopeValue.operatorId) return scopeValue.operationId && scopeValue.machineId
    ? sql`a.operator_id=${scopeValue.operatorId} AND a.operation_id=${scopeValue.operationId} AND a.machine_id=${scopeValue.machineId}`
    : sql`FALSE`;
  return sql`a.client_id IN ${sql(scopeValue.clientIds)}`;
}

function map(row: Record<string, unknown>): ActionableAlert {
  return {
    id: String(row.id), recipientUserId: String(row.recipientUserId), type: String(row.type),
    severity: row.severity as ActionableAlert["severity"], title: String(row.title), message: String(row.message),
    status: row.status as ActionableAlert["status"], clientId: row.clientId ? String(row.clientId) : null,
    operatorId: row.operatorId ? String(row.operatorId) : null, machineId: row.machineId ? String(row.machineId) : null,
    operationId: row.operationId ? String(row.operationId) : null, createdAt: String(row.createdAt),
    viewedAt: row.viewedAt ? String(row.viewedAt) : null, acknowledgedAt: row.acknowledgedAt ? String(row.acknowledgedAt) : null,
    resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null, source: String(row.source), updatedAt: String(row.updatedAt),
  };
}

const columns = (sql: postgres.Sql | postgres.TransactionSql) => sql`
  id, recipient_user_id AS "recipientUserId", type, severity, title, message, status,
  client_id AS "clientId", operator_id AS "operatorId", machine_id AS "machineId",
  operation_id AS "operationId", created_at::text AS "createdAt", viewed_at::text AS "viewedAt",
  acknowledged_at::text AS "acknowledgedAt", resolved_at::text AS "resolvedAt", source,
  updated_at::text AS "updatedAt"`;

export async function listActionableAlerts(session: Session): Promise<ActionableAlertsSnapshot> {
  const sql = db();
  const current = await scope(sql, session);
  const rows = await sql`SELECT ${columns(sql)} FROM agrorisk.actionable_alerts a
    WHERE a.recipient_user_id=${session.userId} AND ${where(current, sql)}
       AND a.status <> 'resolved'
     ORDER BY CASE a.severity
       WHEN 'critical' THEN 1 WHEN 'high' THEN 2
       WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
       a.created_at DESC, a.id`;
  return { alerts: rows.map(map), unreadCount: rows.filter((row) => row.status === "new").length };
}
export const getActionableAlerts = listActionableAlerts;

async function transition(session: Session, ids: string[], action: "viewed" | "acknowledged"): Promise<ActionableAlert[]> {
  const sql = db();
  return sql.begin(async (tx) => {
    const current = await scope(tx, session);
    const status = action === "viewed" ? ["new"] : ["new", "viewed"];
    const rows = await tx`UPDATE agrorisk.actionable_alerts a SET
      status=${action}, viewed_at=COALESCE(viewed_at, now()),
      acknowledged_at=CASE WHEN ${action}='acknowledged' THEN COALESCE(acknowledged_at, now()) ELSE acknowledged_at END,
      updated_at=now()
      WHERE a.recipient_user_id=${session.userId} AND a.id IN ${tx(ids)}
        AND a.status IN ${tx(status)} AND ${where(current, tx)}
      RETURNING ${columns(tx)}`;
    return rows.map(map);
  });
}

export const markActionableAlertsViewed = (session: Session, ids: string[]) => transition(session, ids, "viewed");
export const acknowledgeActionableAlerts = (session: Session, ids: string[]) => transition(session, ids, "acknowledged");

export async function closeActionableAlertsRepository() {
  if (!client) return;
  await client.end({ timeout: 1 });
  client = undefined;
}