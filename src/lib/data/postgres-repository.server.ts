import postgres from "postgres";
import {
  parseAlerts,
  parseAreas,
  parseClients,
  parseHistory,
  parseMachines,
  parseOperations,
} from "./contract-mappers";
import type { AgroRiskRepository } from "./repository";
import type { GestorOperationalOverview } from "../gestor-dashboard-types";
import type { AdminOperationalOverview } from "../admin-dashboard-types";
import type { ConsultorPreventiveOverview } from "../consultor-dashboard-types";
import type {
  OperationRiskRelationalContext,
  SerializableJson,
} from "../risk-engine-v2/operation-input.server";
import type { PreparedOperationRiskInput } from "../risk-engine-v2/prepared-input";

let client: ReturnType<typeof postgres> | undefined;

function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não está configurada para o repositório PostgreSQL.");
  client ??= postgres(databaseUrl, { max: 5, prepare: false });
  return client;
}

export async function closePostgresRepository(): Promise<void> {
  if (!client) return;
  await client.end({ timeout: 1 });
  client = undefined;
}

export async function listOperationRiskContexts(scope: {
  clientIds?: readonly string[] | null;
  operatorId?: string;
  operationIds?: readonly string[];
}): Promise<OperationRiskRelationalContext[]> {
  const sql = db();
  const ids = scope.clientIds === null ? null : scope.clientIds ? [...scope.clientIds] : undefined;
  const operationIds = scope.operationIds ? [...scope.operationIds] : undefined;
  if (ids?.length === 0) return [];
  if (operationIds?.length === 0) return [];
  const rows = await sql`
    SELECT
      o.id AS "operationId", o.type AS "operationType", o.status AS "operationStatus",
      to_char(o.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "scheduledAt",
      o.start_label AS "startLabel",
      o.duration_label AS "durationLabel", o.operator_id AS "operatorId",
      m.id AS "machineId", m.code AS "machineCode", m.name AS "machineName",
      m.type AS "machineType", m.model AS "machineModel", m.status AS "machineStatus",
      u.name AS "operatorName",
      a.id AS "areaId", a.name AS "areaName", a.type AS "areaType",
      a.condition AS "areaCondition", a.near_water AS "nearWater",
      a.environmental_risk AS "environmentalRisk", a.terrain_context AS "terrainContext",
      a.crop, a.hectares::float8 AS hectares,
      f.id AS "farmId", f.name AS "farmName", f.municipality AS "farmMunicipality",
      f.state AS "farmState",
      c.id AS "clientId", c.name AS "clientName", c.municipality AS "clientMunicipality",
      c.state AS "clientState", c.main_operation AS "mainOperation",
      ris.reference_date AS "riskReferenceDate", ris.ml_input AS "riskMlInput",
      ris.operational_rules_input AS "riskOperationalRulesInput",
      ris.latitude AS "riskLatitude", ris.longitude AS "riskLongitude",
      ris.provenance AS "riskProvenance", ris.generated_at AS "riskGeneratedAt",
      ris.updated_at AS "riskUpdatedAt", ris.version AS "riskVersion"
    FROM agrorisk.operations o
    JOIN agrorisk.machines m
      ON m.id=o.machine_id AND m.area_id=o.area_id AND m.client_id=o.client_id
    JOIN agrorisk.users u
      ON u.id=o.operator_id AND u.client_id=o.client_id
    JOIN agrorisk.areas a ON a.id=o.area_id AND a.client_id=o.client_id
    JOIN agrorisk.farms f ON f.id=a.farm_id AND f.client_id=a.client_id
    JOIN agrorisk.clients c ON c.id=o.client_id
    LEFT JOIN agrorisk.operation_risk_input_snapshots ris
      ON ris.operation_id = o.id
    WHERE true
      ${scope.operatorId ? sql`AND o.operator_id=${scope.operatorId}` : sql``}
      ${ids === null || ids === undefined ? sql`` : sql`AND o.client_id=ANY(${ids})`}
      ${operationIds === undefined ? sql`` : sql`AND o.id=ANY(${operationIds})`}
    ORDER BY o.id
  `;
  return rows.map((row) => ({
    source: "postgres" as const,
    operation: {
      id: String(row.operationId), machineId: String(row.machineId), machine: String(row.machineId),
      operatorId: String(row.operatorId), clientId: String(row.clientId), areaId: String(row.areaId),
      area: String(row.areaName), type: row.operationType, scheduledAt: String(row.scheduledAt),
      start: String(row.startLabel), duration: String(row.durationLabel), status: row.operationStatus,
      score: 0, factors: [], recommendationId: "",
    },
    machine: {
      id: String(row.machineId), code: String(row.machineCode), name: String(row.machineName),
      model: String(row.machineModel), type: row.machineType, clientId: String(row.clientId),
      client: String(row.clientName), areaId: String(row.areaId), area: String(row.areaName),
      operatorId: String(row.operatorId), operator: String(row.operatorName),
      status: row.machineStatus, score: 0, level: "baixo", lastAlert: "", lastUpdate: "",
    },
    area: {
      id: String(row.areaId), name: String(row.areaName), clientId: String(row.clientId),
      client: String(row.clientName), type: row.areaType, condition: String(row.areaCondition),
      nearWater: row.nearWater, envRisk: row.environmentalRisk, score: 0,
      crop: String(row.crop), hectares: Number(row.hectares),
    },
    farm: {
      id: String(row.farmId), name: String(row.farmName),
      municipality: String(row.farmMunicipality), state: String(row.farmState),
    },
    terrainContext: row.terrainContext as SerializableJson,
    preparedInput: row.riskVersion
      ? {
          operationId: String(row.operationId),
          referenceDate: String(row.riskReferenceDate),
          mlInput: row.riskMlInput,
          operationalRulesInput: row.riskOperationalRulesInput,
          latitude: row.riskLatitude === null ? null : Number(row.riskLatitude),
          longitude: row.riskLongitude === null ? null : Number(row.riskLongitude),
          provenance: (row.riskProvenance ?? {}) as Record<string, unknown>,
          generatedAt: String(row.riskGeneratedAt),
          updatedAt: String(row.riskUpdatedAt),
          version: String(row.riskVersion),
        }
      : undefined,
    client: {
      id: String(row.clientId), name: String(row.clientName),
      city: String(row.clientMunicipality), state: String(row.clientState),
      location: `${row.clientMunicipality} / ${row.clientState}`,
      mainOperation: String(row.mainOperation), machineCount: 0, machines: 0,
      avgScore: 0, level: "baixo",
    },
  })) as OperationRiskRelationalContext[];
}

export async function listClientRelationalScope(
  clientIds: readonly string[] | null,
  includeRiskContexts = true,
) {
  const sql = db();
  const ids = clientIds === null ? null : [...clientIds];
  const [clientRows, areaRows, machineRows, operationRows, riskContexts] = await Promise.all([
    sql`
      SELECT c.id, c.name, c.municipality AS city, c.state,
        c.municipality || ' / ' || c.state AS location,
        c.main_operation AS "mainOperation",
        count(m.id)::int AS "machineCount", count(m.id)::int AS machines,
        c.avg_score AS "avgScore", c.risk_level AS level
      FROM agrorisk.clients c
      LEFT JOIN agrorisk.machines m ON m.client_id = c.id
      ${ids === null ? sql`` : sql`WHERE c.id = ANY(${ids})`}
      GROUP BY c.id ORDER BY c.id
    `,
    sql`
      SELECT a.id, a.name, a.client_id AS "clientId", c.name AS client,
        a.type, a.condition, a.near_water AS "nearWater",
        a.environmental_risk AS "envRisk", a.score, a.crop, a.hectares::float8 AS hectares
      FROM agrorisk.areas a JOIN agrorisk.clients c ON c.id = a.client_id
      ${ids === null ? sql`` : sql`WHERE a.client_id = ANY(${ids})`}
      ORDER BY a.id
    `,
    sql`
      SELECT m.id, m.code, m.name, m.model, m.type,
        m.client_id AS "clientId", c.name AS client,
        m.area_id AS "areaId", a.name AS area,
        m.operator_id AS "operatorId", u.name AS operator,
        m.status, m.score, m.risk_level AS level,
        m.last_alert AS "lastAlert", m.last_update AS "lastUpdate"
      FROM agrorisk.machines m
      JOIN agrorisk.clients c ON c.id = m.client_id
      JOIN agrorisk.areas a ON a.id = m.area_id
      JOIN agrorisk.users u ON u.id = m.operator_id
      ${ids === null ? sql`` : sql`WHERE m.client_id = ANY(${ids})`}
      ORDER BY m.id
    `,
    sql`
      SELECT o.id, o.machine_id AS "machineId", o.machine_id AS machine,
        o.operator_id AS "operatorId", o.client_id AS "clientId",
        o.area_id AS "areaId", a.name AS area, o.type,
        o.scheduled_at::text AS "scheduledAt", o.start_label AS start,
        o.duration_label AS duration, o.status, o.score,
        coalesce(array_agg(orf.risk_factor_id) FILTER (WHERE orf.risk_factor_id IS NOT NULL), '{}') AS factors,
        coalesce(o.recommendation_id, '') AS "recommendationId"
      FROM agrorisk.operations o
      JOIN agrorisk.areas a ON a.id = o.area_id
      LEFT JOIN agrorisk.operation_risk_factors orf ON orf.operation_id = o.id
      ${ids === null ? sql`` : sql`WHERE o.client_id = ANY(${ids})`}
      GROUP BY o.id, a.name ORDER BY o.id
    `,
    includeRiskContexts ? listOperationRiskContexts({ clientIds }) : Promise.resolve([]),
  ]);
  return {
    clients: parseClients([...clientRows]),
    areas: parseAreas([...areaRows]),
    machines: parseMachines([...machineRows]),
    operations: parseOperations([...operationRows]),
    riskContexts,
  };
}

/**
 * Gestor Phase A intentionally reads only the relational portfolio.  Do not
 * add risk contexts here: those are fetched by the authenticated risk batch
 * after the user opens a ranking or a visible item.
 */
export async function listGestorRelationalPhaseA(clientIds: readonly string[] | null) {
  const sql = db();
  const ids = clientIds === null ? null : [...clientIds];
  const [clientRows, areaRows, machineRows, operationRows, alertRows] = await Promise.all([
    sql`
      SELECT c.id, c.name, c.municipality AS city, c.state,
        c.municipality || ' / ' || c.state AS location,
        c.main_operation AS "mainOperation",
        count(m.id)::int AS "machineCount", count(m.id)::int AS machines,
        c.avg_score AS "avgScore", c.risk_level AS level
      FROM agrorisk.clients c
      LEFT JOIN agrorisk.machines m ON m.client_id = c.id
      ${ids === null ? sql`` : sql`WHERE c.id = ANY(${ids})`}
      GROUP BY c.id ORDER BY c.id
    `,
    sql`
      SELECT a.id, a.name, a.client_id AS "clientId", c.name AS client,
        a.type, a.condition, a.near_water AS "nearWater",
        a.environmental_risk AS "envRisk", a.score, a.crop, a.hectares::float8 AS hectares
      FROM agrorisk.areas a JOIN agrorisk.clients c ON c.id = a.client_id
      ${ids === null ? sql`` : sql`WHERE a.client_id = ANY(${ids})`}
      ORDER BY a.id
    `,
    sql`
      SELECT m.id, m.code, m.name, m.model, m.type,
        m.client_id AS "clientId", c.name AS client,
        m.area_id AS "areaId", a.name AS area,
        m.operator_id AS "operatorId", u.name AS operator,
        m.status, m.score, m.risk_level AS level,
        m.last_alert AS "lastAlert", m.last_update AS "lastUpdate"
      FROM agrorisk.machines m
      JOIN agrorisk.clients c ON c.id = m.client_id
      JOIN agrorisk.areas a ON a.id = m.area_id
      JOIN agrorisk.users u ON u.id = m.operator_id
      ${ids === null ? sql`` : sql`WHERE m.client_id = ANY(${ids})`}
      ORDER BY m.id
    `,
    sql`
      SELECT o.id, o.machine_id AS "machineId", o.machine_id AS machine,
        o.operator_id AS "operatorId", o.client_id AS "clientId",
        o.area_id AS "areaId", a.name AS area, o.type,
        o.scheduled_at::text AS "scheduledAt", o.start_label AS start,
        o.duration_label AS duration, o.status, o.score,
        coalesce(array_agg(orf.risk_factor_id) FILTER (WHERE orf.risk_factor_id IS NOT NULL), '{}') AS factors,
        coalesce(o.recommendation_id, '') AS "recommendationId"
      FROM agrorisk.operations o
      JOIN agrorisk.areas a ON a.id = o.area_id
      LEFT JOIN agrorisk.operation_risk_factors orf ON orf.operation_id = o.id
      ${ids === null ? sql`` : sql`WHERE o.client_id = ANY(${ids})`}
      GROUP BY o.id, a.name ORDER BY o.id
    `,
    sql`
      SELECT al.id, al.machine_id AS "machineId", al.machine_id AS machine,
        al.operation_id AS "operationId", al.type, al.criticality,
        al.risk_level AS level, al.message,
        coalesce(al.main_factor_id, '') AS "mainFactor",
        al.status, al.occurred_at::text AS datetime, al.time_label AS time
      FROM agrorisk.alerts al
      JOIN agrorisk.machines m ON m.id = al.machine_id
      ${ids === null ? sql`` : sql`WHERE m.client_id = ANY(${ids})`}
      ORDER BY al.occurred_at DESC, al.id
    `,
  ]);
  return {
    clients: parseClients([...clientRows]),
    areas: parseAreas([...areaRows]),
    machines: parseMachines([...machineRows]),
    operations: parseOperations([...operationRows]),
    alerts: parseAlerts([...alertRows]),
  };
}

export async function listConsultorRelationalPhaseA(clientIds: readonly string[] | null) {
  const sql = db();
  const ids = clientIds === null ? null : [...clientIds];
  const clientRows = await sql`
    SELECT c.id, c.name, c.municipality AS city, c.state,
      c.municipality || ' / ' || c.state AS location,
      c.main_operation AS "mainOperation",
      count(m.id)::int AS "machineCount", count(m.id)::int AS machines,
      c.avg_score AS "avgScore", c.risk_level AS level
    FROM agrorisk.clients c
    LEFT JOIN agrorisk.machines m ON m.client_id = c.id
    ${ids === null ? sql`` : sql`WHERE c.id = ANY(${ids})`}
    GROUP BY c.id ORDER BY c.id
  `;
  const clients = parseClients([...clientRows]);
  if (clients.length === 0) {
    return { clients, areas: [], machines: [], operations: [], alerts: [], riskContexts: [] };
  }
  const [areaRows, machineRows, operationRows, alertRows] = await Promise.all([
    sql`
      SELECT a.id, a.name, a.client_id AS "clientId", c.name AS client,
        a.type, a.condition, a.near_water AS "nearWater",
        a.environmental_risk AS "envRisk", a.score, a.crop, a.hectares::float8 AS hectares
      FROM agrorisk.areas a JOIN agrorisk.clients c ON c.id = a.client_id
      ${ids === null ? sql`` : sql`WHERE a.client_id = ANY(${ids})`}
      ORDER BY a.id
    `,
    sql`
      SELECT m.id, m.code, m.name, m.model, m.type,
        m.client_id AS "clientId", c.name AS client,
        m.area_id AS "areaId", a.name AS area,
        m.operator_id AS "operatorId", u.name AS operator,
        m.status, m.score, m.risk_level AS level,
        m.last_alert AS "lastAlert", m.last_update AS "lastUpdate"
      FROM agrorisk.machines m
      JOIN agrorisk.clients c ON c.id = m.client_id
      JOIN agrorisk.areas a ON a.id = m.area_id
      JOIN agrorisk.users u ON u.id = m.operator_id
      ${ids === null ? sql`` : sql`WHERE m.client_id = ANY(${ids})`}
      ORDER BY m.id
    `,
    sql`
      SELECT o.id, o.machine_id AS "machineId", o.machine_id AS machine,
        o.operator_id AS "operatorId", o.client_id AS "clientId",
        o.area_id AS "areaId", a.name AS area, o.type,
        o.scheduled_at::text AS "scheduledAt", o.start_label AS start,
        o.duration_label AS duration, o.status, o.score,
        coalesce(array_agg(orf.risk_factor_id) FILTER (WHERE orf.risk_factor_id IS NOT NULL), '{}') AS factors,
        coalesce(o.recommendation_id, '') AS "recommendationId"
      FROM agrorisk.operations o
      JOIN agrorisk.areas a ON a.id = o.area_id
      LEFT JOIN agrorisk.operation_risk_factors orf ON orf.operation_id = o.id
      ${ids === null ? sql`` : sql`WHERE o.client_id = ANY(${ids})`}
      GROUP BY o.id, a.name ORDER BY o.id
    `,
    sql`
      SELECT al.id, al.machine_id AS "machineId", al.machine_id AS machine,
        al.operation_id AS "operationId", al.type, al.criticality,
        al.risk_level AS level, al.message,
        coalesce(al.main_factor_id, '') AS "mainFactor",
        al.status, al.occurred_at::text AS datetime, al.time_label AS time
      FROM agrorisk.alerts al
      JOIN agrorisk.machines m ON m.id = al.machine_id
      ${ids === null ? sql`` : sql`WHERE m.client_id = ANY(${ids})`}
      ORDER BY al.occurred_at DESC, al.id
    `,
  ]);
  return {
    clients,
    areas: parseAreas([...areaRows]),
    machines: parseMachines([...machineRows]),
    operations: parseOperations([...operationRows]),
    alerts: parseAlerts([...alertRows]),
    riskContexts: [],
  };
}

export async function listGestorOperationalOverview(
  clientIds: readonly string[] | null,
): Promise<GestorOperationalOverview> {
  if (clientIds !== null && clientIds.length === 0) {
    return { maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] }, activity: [] };
  }
  const sql = db();
  const ids = clientIds === null ? null : [...clientIds];
  const [maintenanceRows, activityRows] = await Promise.all([
    sql`
      SELECT r.id, m.client_id AS "clientId", r.machine_id AS "machineId", m.type AS "machineType",
        c.name AS client, r.next_due_at::text AS "nextDueAt", r.status, r.source,
        count(*) FILTER (WHERE r.status = 'overdue') OVER ()::int AS "overdueCount",
        count(*) FILTER (WHERE r.status = 'due_soon') OVER ()::int AS "dueSoonCount"
      FROM agrorisk.maintenance_records r
      JOIN agrorisk.machines m ON m.id = r.machine_id
      JOIN agrorisk.clients c ON c.id = m.client_id
      WHERE r.status IN ('due_soon', 'overdue')
        ${ids === null ? sql`` : sql`AND m.client_id = ANY(${ids})`}
      ORDER BY CASE WHEN r.status = 'overdue' THEN 0 ELSE 1 END,
        r.next_due_at ASC, r.id ASC
      LIMIT 5
    `,
    sql`
      SELECT l.id, o.client_id AS "clientId", u.name AS operator, l.operation_id AS "operationId",
        m.id AS "machineId", m.type AS "machineType",
        l.started_at::text AS "startedAt", l.finished_at::text AS "finishedAt",
        l.status, l.observation
      FROM agrorisk.operation_logs l
      JOIN agrorisk.operations o
        ON o.id = l.operation_id AND o.machine_id = l.machine_id
        AND o.operator_id = l.operator_id
      JOIN agrorisk.machines m ON m.id = o.machine_id AND m.client_id = o.client_id
        AND m.operator_id = l.operator_id
      JOIN agrorisk.clients c ON c.id = o.client_id
      JOIN agrorisk.users u ON u.id = l.operator_id AND u.profile = 'operador'
      ${ids === null ? sql`` : sql`WHERE o.client_id = ANY(${ids})`}
      ORDER BY l.created_at DESC, l.started_at DESC NULLS LAST, l.id DESC
      LIMIT 5
    `,
  ]);
  const first = maintenanceRows[0] as { overdueCount?: number; dueSoonCount?: number } | undefined;
  return {
    maintenance: {
      overdueCount: Number(first?.overdueCount ?? 0),
      dueSoonCount: Number(first?.dueSoonCount ?? 0),
      top: [...maintenanceRows],
    } as GestorOperationalOverview["maintenance"],
    activity: [...activityRows] as GestorOperationalOverview["activity"],
  };
}

export async function listAdminOperationalOverview(): Promise<AdminOperationalOverview> {
  const sql = db();
  const [maintenanceRows, activityRows] = await Promise.all([
    sql`
      SELECT r.id, r.machine_id AS "machineId", m.type AS "machineType",
        c.name AS client, r.performed_at::text AS "lastPerformedAt",
        r.next_due_at::text AS "nextDueAt", r.status, r.source,
        count(*) FILTER (WHERE r.status = 'overdue') OVER ()::int AS "overdueCount",
        count(*) FILTER (WHERE r.status = 'due_soon') OVER ()::int AS "dueSoonCount"
      FROM agrorisk.maintenance_records r
      JOIN agrorisk.machines m ON m.id = r.machine_id
      JOIN agrorisk.clients c ON c.id = m.client_id
      WHERE r.status IN ('due_soon', 'overdue')
      ORDER BY CASE WHEN r.status = 'overdue' THEN 0 ELSE 1 END,
        r.next_due_at ASC, r.id ASC
      LIMIT 5
    `,
    sql`
      SELECT l.id, u.name AS operator, c.name AS client,
        l.operation_id AS "operationId", m.id AS "machineId", m.type AS "machineType",
        l.started_at::text AS "startedAt", l.finished_at::text AS "finishedAt",
        l.status, l.observation
      FROM agrorisk.operation_logs l
      JOIN agrorisk.operations o
        ON o.id = l.operation_id AND o.machine_id = l.machine_id
        AND o.operator_id = l.operator_id
      JOIN agrorisk.machines m ON m.id = o.machine_id AND m.client_id = o.client_id
        AND m.operator_id = l.operator_id
      JOIN agrorisk.clients c ON c.id = o.client_id
      JOIN agrorisk.users u ON u.id = l.operator_id AND u.profile = 'operador'
      ORDER BY l.created_at DESC, l.started_at DESC NULLS LAST, l.id DESC
      LIMIT 5
    `,
  ]);
  const first = maintenanceRows[0] as { overdueCount?: number; dueSoonCount?: number } | undefined;
  return {
    maintenance: {
      overdueCount: Number(first?.overdueCount ?? 0),
      dueSoonCount: Number(first?.dueSoonCount ?? 0),
      top: [...maintenanceRows],
    } as AdminOperationalOverview["maintenance"],
    activity: [...activityRows] as AdminOperationalOverview["activity"],
  };
}

export async function listConsultorPreventiveOverview(
  clientIds: readonly string[] | null,
): Promise<ConsultorPreventiveOverview> {
  if (clientIds !== null && clientIds.length === 0) {
    return { maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] }, attentionPoints: [] };
  }
  const sql = db();
  const ids = clientIds === null ? null : [...clientIds];
  const [maintenanceRows, attentionRows] = await Promise.all([
    sql`
      SELECT r.id, m.client_id AS "clientId", c.name AS client,
        r.machine_id AS "machineId", m.type AS "machineType",
        r.next_due_at::text AS "nextDueAt", r.status, r.source,
        count(*) FILTER (WHERE r.status = 'overdue') OVER ()::int AS "overdueCount",
        count(*) FILTER (WHERE r.status = 'due_soon') OVER ()::int AS "dueSoonCount"
      FROM agrorisk.maintenance_records r
      JOIN agrorisk.machines m ON m.id = r.machine_id
      JOIN agrorisk.clients c ON c.id = m.client_id
      WHERE r.status IN ('due_soon', 'overdue')
        ${ids === null ? sql`` : sql`AND m.client_id = ANY(${ids})`}
      ORDER BY CASE WHEN r.status = 'overdue' THEN 0 ELSE 1 END,
        r.next_due_at ASC, r.id ASC
      LIMIT 5
    `,
    sql`
      SELECT l.id, o.client_id AS "clientId", c.name AS client,
        u.name AS operator, m.id AS "machineId", m.type AS "machineType",
        coalesce(l.finished_at, l.started_at, l.created_at)::text AS "occurredAt",
        l.status, l.observation
      FROM agrorisk.operation_logs l
      JOIN agrorisk.operations o
        ON o.id = l.operation_id AND o.machine_id = l.machine_id
        AND o.operator_id = l.operator_id
      JOIN agrorisk.machines m ON m.id = o.machine_id AND m.client_id = o.client_id
        AND m.operator_id = l.operator_id
      JOIN agrorisk.clients c ON c.id = o.client_id
      JOIN agrorisk.users u ON u.id = l.operator_id AND u.profile = 'operador'
      WHERE (
        nullif(btrim(l.observation), '') IS NOT NULL
        OR lower(l.status) IN ('interrupted', 'paused', 'error', 'cancelled')
      )
        ${ids === null ? sql`` : sql`AND o.client_id = ANY(${ids})`}
      ORDER BY coalesce(l.finished_at, l.started_at, l.created_at) DESC, l.id DESC
      LIMIT 5
    `,
  ]);
  const first = maintenanceRows[0] as { overdueCount?: number; dueSoonCount?: number } | undefined;
  return {
    maintenance: {
      overdueCount: Number(first?.overdueCount ?? 0),
      dueSoonCount: Number(first?.dueSoonCount ?? 0),
      top: [...maintenanceRows],
    } as ConsultorPreventiveOverview["maintenance"],
    attentionPoints: [...attentionRows] as ConsultorPreventiveOverview["attentionPoints"],
  };
}

export async function getOperatorRelationalScope(operatorId: string, includeRiskContext = true) {
  const sql = db();
  const currentOperation = sql`
    SELECT o.*
    FROM agrorisk.operations o
    WHERE o.operator_id = ${operatorId}
    ORDER BY (o.status = 'Em andamento') DESC, o.scheduled_at DESC, o.id
    LIMIT 1
  `;
  const [contextRows, riskContexts, countRows, alertRows, historyRows] = await Promise.all([
    sql`
      WITH current_operation AS (${currentOperation})
      SELECT
        json_build_object(
          'id', u.id, 'name', u.name, 'clientId', u.client_id
        ) AS operator,
        json_build_object(
          'id', c.id, 'name', c.name, 'city', c.municipality, 'state', c.state,
          'location', c.municipality || ' / ' || c.state, 'mainOperation', c.main_operation,
          'machineCount', 1, 'machines', 1, 'avgScore', 0, 'level', 'baixo'
        ) AS client,
        json_build_object(
          'id', a.id, 'name', a.name, 'clientId', a.client_id, 'client', c.name,
          'type', a.type, 'condition', a.condition, 'nearWater', a.near_water,
          'envRisk', a.environmental_risk, 'score', 0, 'crop', a.crop,
          'hectares', a.hectares::float8
        ) AS area,
        json_build_object(
          'id', m.id, 'code', m.code, 'name', m.name, 'model', m.model, 'type', m.type,
          'clientId', m.client_id, 'client', c.name, 'areaId', m.area_id, 'area', a.name,
          'operatorId', m.operator_id, 'operator', u.name, 'status', m.status,
          'score', 0, 'level', 'baixo', 'lastAlert', m.last_alert, 'lastUpdate', m.last_update
        ) AS machine,
        json_build_object(
          'id', o.id, 'machineId', o.machine_id, 'machine', o.machine_id,
          'operatorId', o.operator_id, 'clientId', o.client_id, 'areaId', o.area_id,
           'area', a.name, 'type', o.type, 'scheduledAt',
           to_char(o.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'start', o.start_label, 'duration', o.duration_label, 'status', o.status,
          'score', 0, 'factors', coalesce((
            SELECT json_agg(orf.risk_factor_id ORDER BY orf.risk_factor_id)
            FROM agrorisk.operation_risk_factors orf WHERE orf.operation_id = o.id
          ), '[]'::json), 'recommendationId', coalesce(o.recommendation_id, '')
        ) AS operation
      FROM current_operation o
       JOIN agrorisk.users u ON u.id = o.operator_id AND u.client_id = o.client_id
      JOIN agrorisk.machines m
         ON m.id = o.machine_id AND m.client_id = o.client_id AND m.area_id = o.area_id
      JOIN agrorisk.areas a ON a.id = o.area_id AND a.client_id = o.client_id
      JOIN agrorisk.clients c ON c.id = o.client_id
    `,
    includeRiskContext ? listOperationRiskContexts({ operatorId }) : Promise.resolve([]),
    sql`
      SELECT count(*)::int AS count
      FROM agrorisk.operations
      WHERE operator_id = ${operatorId}
    `,
    sql`
      WITH current_operation AS (${currentOperation})
      SELECT a.id, a.machine_id AS "machineId", a.machine_id AS machine,
        a.operation_id AS "operationId", a.type, a.criticality,
        a.risk_level AS level, a.message, coalesce(a.main_factor_id, '') AS "mainFactor",
        a.status, a.occurred_at::text AS datetime, a.time_label AS time
      FROM agrorisk.alerts a
      JOIN current_operation o ON a.operation_id = o.id AND a.machine_id = o.machine_id
      ORDER BY a.occurred_at DESC, a.id
      LIMIT 10
    `,
    sql`
      WITH current_operation AS (${currentOperation})
      SELECT h.id, h.occurred_on::text AS date, h.machine_id AS "machineId",
        h.operation_id AS "operationId", h.summary, h.score
      FROM agrorisk.operation_history h
       JOIN current_operation o
         ON h.machine_id = o.machine_id AND h.operation_id = o.id
      ORDER BY h.occurred_on DESC, h.id
      LIMIT 10
    `,
  ]);
  const context = contextRows[0];
  if (!context) throw new Error(`Operador PostgreSQL sem operação vinculada: ${operatorId}`);
  return {
    operator: context.operator as { id: string; name: string; clientId: string },
    clients: parseClients([context.client]),
    areas: parseAreas([context.area]),
    machines: parseMachines([context.machine]),
    operations: parseOperations([context.operation]),
    alerts: parseAlerts([...alertRows]),
    history: parseHistory([...historyRows]),
    operationCount: Number(countRows[0]?.count ?? 0),
    riskContexts,
  };
}

async function queryClients(id?: string) {
  const sql = db();
  const filter = id !== undefined ? sql`WHERE c.id = ${id}` : sql``;
  const rows = await sql`
    SELECT c.id, c.name, c.municipality AS city, c.state,
      c.municipality || ' / ' || c.state AS location,
      c.main_operation AS "mainOperation",
      count(m.id)::int AS "machineCount",
      count(m.id)::int AS machines,
      c.avg_score AS "avgScore",
      c.risk_level AS level
    FROM agrorisk.clients c
    LEFT JOIN agrorisk.machines m ON m.client_id = c.id
    ${filter}
    GROUP BY c.id
    ORDER BY c.id
  `;
  return parseClients([...rows]);
}

async function queryAreas(id?: string) {
  const sql = db();
  const filter = id !== undefined ? sql`WHERE a.id = ${id}` : sql``;
  const rows = await sql`
    SELECT a.id, a.name, a.client_id AS "clientId", c.name AS client,
      a.type, a.condition, a.near_water AS "nearWater",
      a.environmental_risk AS "envRisk", a.score, a.crop,
      a.hectares::float8 AS hectares
    FROM agrorisk.areas a
    JOIN agrorisk.clients c ON c.id = a.client_id
    ${filter}
    ORDER BY a.id
  `;
  return parseAreas([...rows]);
}

async function queryMachines(id?: string) {
  const sql = db();
  const filter = id !== undefined ? sql`WHERE m.id = ${id}` : sql``;
  const rows = await sql`
    SELECT m.id, m.code, m.name, m.model, m.type,
      m.client_id AS "clientId", c.name AS client,
      m.area_id AS "areaId", a.name AS area,
      m.operator_id AS "operatorId", u.name AS operator,
      m.status, m.score, m.risk_level AS level,
      m.last_alert AS "lastAlert", m.last_update AS "lastUpdate"
    FROM agrorisk.machines m
    JOIN agrorisk.clients c ON c.id = m.client_id
    JOIN agrorisk.areas a ON a.id = m.area_id
    JOIN agrorisk.users u ON u.id = m.operator_id
    ${filter}
    ORDER BY m.id
  `;
  return parseMachines([...rows]);
}

async function queryOperations(id?: string) {
  const sql = db();
  const filter = id !== undefined ? sql`WHERE o.id = ${id}` : sql``;
  const rows = await sql`
    SELECT o.id, o.machine_id AS "machineId", o.machine_id AS machine,
      o.operator_id AS "operatorId", o.client_id AS "clientId",
      o.area_id AS "areaId", a.name AS area, o.type,
      o.scheduled_at::text AS "scheduledAt", o.start_label AS start,
      o.duration_label AS duration, o.status, o.score,
      coalesce(array_agg(orf.risk_factor_id) FILTER (WHERE orf.risk_factor_id IS NOT NULL), '{}') AS factors,
      coalesce(o.recommendation_id, '') AS "recommendationId"
    FROM agrorisk.operations o
    JOIN agrorisk.areas a ON a.id = o.area_id
    LEFT JOIN agrorisk.operation_risk_factors orf ON orf.operation_id = o.id
    ${filter}
    GROUP BY o.id, a.name
    ORDER BY o.id
  `;
  return parseOperations([...rows]);
}

async function queryAlerts() {
  const rows = await db()`
    SELECT a.id, a.machine_id AS "machineId", a.machine_id AS machine,
      a.operation_id AS "operationId", a.type, a.criticality,
      a.risk_level AS level, a.message,
      coalesce(a.main_factor_id, '') AS "mainFactor",
      a.status, a.occurred_at::text AS datetime, a.time_label AS time
    FROM agrorisk.alerts a
    ORDER BY a.occurred_at DESC, a.id
  `;
  return parseAlerts([...rows]);
}

async function queryHistory() {
  const rows = await db()`
    SELECT h.id, h.occurred_on::text AS date, h.machine_id AS "machineId",
      h.operation_id AS "operationId", h.summary, h.score
    FROM agrorisk.operation_history h
    ORDER BY h.occurred_on DESC, h.id
  `;
  return parseHistory([...rows]);
}

export async function getOperationRiskInputSnapshot(
  operationId: string,
): Promise<PreparedOperationRiskInput | undefined> {
  const [row] = await db()`
    SELECT operation_id AS "operationId", reference_date::text AS "referenceDate",
      ml_input AS "mlInput", operational_rules_input AS "operationalRulesInput",
      latitude, longitude, provenance, generated_at::text AS "generatedAt",
      updated_at::text AS "updatedAt", version
    FROM agrorisk.operation_risk_input_snapshots
    WHERE operation_id = ${operationId}
  `;
  if (!row) return undefined;
  return {
    operationId: String(row.operationId),
    referenceDate: String(row.referenceDate),
    mlInput: row.mlInput,
    operationalRulesInput: row.operationalRulesInput,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    provenance: (row.provenance ?? {}) as Record<string, unknown>,
    generatedAt: String(row.generatedAt),
    updatedAt: String(row.updatedAt),
    version: String(row.version),
  } as PreparedOperationRiskInput;
}

export async function upsertOperationRiskInputSnapshot(
  snapshot: PreparedOperationRiskInput,
): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO agrorisk.operation_risk_input_snapshots (
      operation_id, reference_date, ml_input, operational_rules_input,
      latitude, longitude, provenance, generated_at, updated_at, version
    ) VALUES (
      ${snapshot.operationId}, ${snapshot.referenceDate},
      ${sql.json(JSON.parse(JSON.stringify(snapshot.mlInput)))},
      ${sql.json(JSON.parse(JSON.stringify(snapshot.operationalRulesInput)))},
      ${snapshot.latitude}, ${snapshot.longitude},
      ${sql.json(JSON.parse(JSON.stringify(snapshot.provenance)))},
      ${snapshot.generatedAt}, ${snapshot.updatedAt}, ${snapshot.version}
    )
    ON CONFLICT (operation_id) DO UPDATE SET
      reference_date = excluded.reference_date,
      ml_input = excluded.ml_input,
      operational_rules_input = excluded.operational_rules_input,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      provenance = excluded.provenance,
      generated_at = excluded.generated_at,
      updated_at = now(),
      version = excluded.version
  `;
}

export const postgresRepository: AgroRiskRepository = {
  listClients: () => queryClients(),
  listAreas: () => queryAreas(),
  listMachines: () => queryMachines(),
  listOperations: () => queryOperations(),
  listAlerts: queryAlerts,
  listOperationHistory: queryHistory,
  async getClient(id) { return (await queryClients(id))[0]; },
  async getArea(id) { return (await queryAreas(id))[0]; },
  async getMachine(id) { return (await queryMachines(id))[0]; },
  async getOperation(id) { return (await queryOperations(id))[0]; },
  getOperationRiskInputSnapshot,
  upsertOperationRiskInputSnapshot,
};