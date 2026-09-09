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
};