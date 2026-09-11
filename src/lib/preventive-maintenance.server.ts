import postgres from "postgres";
import process from "node:process";
import type {
  MaintenanceStatus,
  PreventiveMaintenanceRecord,
  PreventiveMaintenanceSnapshot,
} from "./preventive-maintenance-types";

let client: postgres.Sql | undefined;

function db() {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não está configurada para manutenção preventiva.");
  client = postgres(databaseUrl, { max: 4, prepare: false });
  return client;
}

export function maintenanceStatusFor(nextDueAt: Date, now = new Date()): MaintenanceStatus {
  const calendarDay = (value: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const part = (type: "year" | "month" | "day") =>
      Number(parts.find((entry) => entry.type === type)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"));
  };
  const due = calendarDay(nextDueAt);
  const current = calendarDay(now);
  if (due < current) return "overdue";
  if (due <= current + 7 * 24 * 60 * 60 * 1_000) return "due_soon";
  return "ok";
}

async function currentMachineId(sql: postgres.Sql, operatorId: string): Promise<string> {
  const rows = await sql`
    SELECT o.machine_id AS "machineId"
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
  if (!rows[0]) throw new Error("Nenhuma máquina atual está vinculada ao Operador autenticado.");
  return String(rows[0].machineId);
}

function toRecord(row: Record<string, unknown>): PreventiveMaintenanceRecord {
  return {
    id: String(row.id),
    machineId: String(row.machineId),
    maintenanceType: String(row.maintenanceType),
    performedAt: String(row.performedAt),
    nextDueAt: String(row.nextDueAt),
    observation: String(row.observation ?? ""),
    status: row.status as MaintenanceStatus,
    source: row.source as PreventiveMaintenanceRecord["source"],
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export async function getPreventiveMaintenanceSnapshot(
  operatorId: string,
): Promise<PreventiveMaintenanceSnapshot> {
  const sql = db();
  const machineId = await currentMachineId(sql, operatorId);

  await sql`
    UPDATE agrorisk.maintenance_records
    SET
      status = CASE
        WHEN (next_due_at AT TIME ZONE 'America/Sao_Paulo')::date
          < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'overdue'
        WHEN (next_due_at AT TIME ZONE 'America/Sao_Paulo')::date
          <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + 7 THEN 'due_soon'
        ELSE 'ok'
      END,
      updated_at = CASE
        WHEN status IS DISTINCT FROM CASE
          WHEN (next_due_at AT TIME ZONE 'America/Sao_Paulo')::date
            < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'overdue'
          WHEN (next_due_at AT TIME ZONE 'America/Sao_Paulo')::date
            <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + 7 THEN 'due_soon'
          ELSE 'ok'
        END THEN now()
        ELSE updated_at
      END
    WHERE machine_id = ${machineId}
  `;

  const rows = await sql`
    SELECT
      id,
      machine_id AS "machineId",
      maintenance_type AS "maintenanceType",
      performed_at::text AS "performedAt",
      next_due_at::text AS "nextDueAt",
      observation,
      status,
      source,
      created_at::text AS "createdAt",
      updated_at::text AS "updatedAt"
    FROM agrorisk.maintenance_records
    WHERE machine_id = ${machineId}
    ORDER BY performed_at DESC, created_at DESC, id DESC
    LIMIT 1
  `;

  return { machineId, record: rows[0] ? toRecord(rows[0]) : null };
}

export async function closePreventiveMaintenanceRepository() {
  if (!client) return;
  await client.end({ timeout: 1 });
  client = undefined;
}