import postgres from "postgres";
import process from "node:process";
import type { OperationLog, OperationLogSnapshot } from "./operation-log-types";

let client: postgres.Sql | undefined;

function db() {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não está configurada para registros de operação.");
  client = postgres(databaseUrl, { max: 4, prepare: false });
  return client;
}

type OperationScope = { operationId: string; machineId: string };

async function currentOperation(
  sql: postgres.TransactionSql | postgres.Sql,
  operatorId: string,
): Promise<OperationScope> {
  const rows = await sql`
    SELECT o.id AS "operationId", o.machine_id AS "machineId"
    FROM agrorisk.operations o
    JOIN agrorisk.machines m
      ON m.id = o.machine_id
      AND m.operator_id = o.operator_id
      AND m.client_id = o.client_id
      AND m.area_id = o.area_id
    WHERE o.operator_id = ${operatorId}
    ORDER BY (o.status = 'Em andamento') DESC, o.scheduled_at DESC, o.id
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Nenhuma operação atual está vinculada ao Operador autenticado.");
  return { operationId: String(row.operationId), machineId: String(row.machineId) };
}

function toLog(row: Record<string, unknown>): OperationLog {
  return {
    id: String(row.id),
    operatorId: String(row.operatorId),
    operationId: String(row.operationId),
    machineId: String(row.machineId),
    startedAt: row.startedAt ? String(row.startedAt) : null,
    finishedAt: row.finishedAt ? String(row.finishedAt) : null,
    status: row.status as OperationLog["status"],
    observation: String(row.observation ?? ""),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

async function findActiveLog(
  sql: postgres.TransactionSql | postgres.Sql,
  operatorId: string,
  operationId: string,
): Promise<OperationLog | null> {
  const rows = await sql`
    SELECT id, operator_id AS "operatorId", operation_id AS "operationId",
      machine_id AS "machineId", started_at::text AS "startedAt",
      finished_at::text AS "finishedAt", status, observation,
      created_at::text AS "createdAt", updated_at::text AS "updatedAt"
    FROM agrorisk.operation_logs
    WHERE operator_id = ${operatorId}
      AND operation_id = ${operationId}
      AND status = 'in_progress'
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `;
  return rows[0] ? toLog(rows[0]) : null;
}

export async function getOperationLogSnapshot(operatorId: string): Promise<OperationLogSnapshot> {
  const sql = db();
  const scope = await currentOperation(sql, operatorId);
  const rows = await sql`
    SELECT id, operator_id AS "operatorId", operation_id AS "operationId",
      machine_id AS "machineId", started_at::text AS "startedAt",
      finished_at::text AS "finishedAt", status, observation,
      created_at::text AS "createdAt", updated_at::text AS "updatedAt"
    FROM agrorisk.operation_logs
    WHERE operator_id = ${operatorId} AND operation_id = ${scope.operationId}
    ORDER BY created_at DESC, id DESC
    LIMIT 6
  `;
  const history = rows.map(toLog);
  return {
    ...scope,
    activeLog: history.find((log) => log.status === "in_progress") ?? null,
    latestLog: history[0] ?? null,
    history,
  };
}

export async function startOperationLog(operatorId: string): Promise<{ log: OperationLog; alreadyActive: boolean }> {
  const sql = db();
  return sql.begin(async (tx) => {
    const scope = await currentOperation(tx, operatorId);
    const active = await findActiveLog(tx, operatorId, scope.operationId);
    if (active) return { log: active, alreadyActive: true };
    try {
      const rows = await tx`
        INSERT INTO agrorisk.operation_logs (
          id, operator_id, operation_id, machine_id, started_at, status
        )
        VALUES (
          ${crypto.randomUUID()}, ${operatorId}, ${scope.operationId},
          ${scope.machineId}, now(), 'in_progress'
        )
        RETURNING id, operator_id AS "operatorId", operation_id AS "operationId",
          machine_id AS "machineId", started_at::text AS "startedAt",
          finished_at::text AS "finishedAt", status, observation,
          created_at::text AS "createdAt", updated_at::text AS "updatedAt"
      `;
      return { log: toLog(rows[0]!), alreadyActive: false };
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
      const concurrent = await findActiveLog(tx, operatorId, scope.operationId);
      if (!concurrent) throw error;
      return { log: concurrent, alreadyActive: true };
    }
  });
}

export async function saveOperationObservation(operatorId: string, observation: string): Promise<OperationLog> {
  const sql = db();
  return sql.begin(async (tx) => {
    const scope = await currentOperation(tx, operatorId);
    const rows = await tx`
      UPDATE agrorisk.operation_logs
      SET observation = ${observation}, updated_at = now()
      WHERE operator_id = ${operatorId}
        AND operation_id = ${scope.operationId}
        AND status = 'in_progress'
      RETURNING id, operator_id AS "operatorId", operation_id AS "operationId",
        machine_id AS "machineId", started_at::text AS "startedAt",
        finished_at::text AS "finishedAt", status, observation,
        created_at::text AS "createdAt", updated_at::text AS "updatedAt"
    `;
    if (!rows[0]) throw new Error("Não há registro de operação em andamento para salvar a observação.");
    return toLog(rows[0]);
  });
}

export async function finishOperationLog(operatorId: string): Promise<OperationLog> {
  const sql = db();
  return sql.begin(async (tx) => {
    const scope = await currentOperation(tx, operatorId);
    const rows = await tx`
      UPDATE agrorisk.operation_logs
      SET status = 'completed', finished_at = now(), updated_at = now()
      WHERE operator_id = ${operatorId}
        AND operation_id = ${scope.operationId}
        AND status = 'in_progress'
      RETURNING id, operator_id AS "operatorId", operation_id AS "operationId",
        machine_id AS "machineId", started_at::text AS "startedAt",
        finished_at::text AS "finishedAt", status, observation,
        created_at::text AS "createdAt", updated_at::text AS "updatedAt"
    `;
    if (!rows[0]) throw new Error("Não há registro de operação em andamento para finalizar.");
    return toLog(rows[0]);
  });
}

export async function closeOperationLogRepository() {
  if (!client) return;
  await client.end({ timeout: 1 });
  client = undefined;
}