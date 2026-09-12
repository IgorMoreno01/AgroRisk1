import { alerts as demoAlerts, type Alert } from "./mock-data";
import type { AgroRiskRepository } from "./data/repository";
import { mockRepository } from "./data/mock-repository.server";
import {
  postgresRepository,
  listClientRelationalScope,
  listGestorOperationalOverview,
  listGestorRelationalPhaseA,
  listOperationRiskContexts,
} from "./data/postgres-repository.server";
import {
  buildAdminDashboardRelationalSnapshot,
  buildAdminDashboardSnapshot,
  memoizeAdminRiskServices,
} from "./admin-dashboard.server";
import { mergeAdminOperationRows } from "./admin-dashboard-merge";
import { getRiskEngineV2Configuration } from "./risk-config.server";
import { cacheOrFetch } from "./cache.server";
import type { GeneratedRecommendation, RecCategory } from "./recommendations";
import type { GestorDashboardSnapshot } from "./gestor-dashboard-types";
import {
  buildFallbackOperationRiskContext,
  evaluateOperationRiskV2,
  type OperationRiskExternalServices,
} from "./risk-engine-v2/operation-input.server";
import { geocodeMunicipality } from "./adapters/location.server";
import { getHistoricalClimate } from "./adapters/climate.server";
import { getElevationForRisk } from "./adapters/terrain.server";
import { getWaterGeo } from "./adapters/water-geo.server";
import type { AdminOperationRow } from "./admin-dashboard-types";
import type { Area, Client, Machine, Operation } from "./mock-data";
import {
  GESTOR_RISK_BATCH_LIMIT,
  selectGestorPriorityOperationIds,
} from "./gestor-risk-selection";
export { GESTOR_RISK_BATCH_LIMIT, selectGestorPriorityOperationIds } from "./gestor-risk-selection";

export interface GestorAccessScope {
  userId: string;
  clientIds: string[] | null;
}

type GestorRelationalData = {
  clients: Client[];
  areas: Area[];
  machines: Machine[];
  operations: Operation[];
  alerts: Alert[];
};

const emptyOperationalOverview: GestorDashboardSnapshot["operationalOverview"] = {
  maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
  activity: [],
};

const primaryOperation = (operations: readonly Operation[]): Operation | undefined =>
  [...operations].sort((left, right) =>
    Number(right.status === "Em andamento") - Number(left.status === "Em andamento") ||
    Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt) ||
    left.id.localeCompare(right.id))[0];

async function readGestorPhaseA(
  repository: AgroRiskRepository,
  scope: GestorAccessScope,
): Promise<GestorRelationalData> {
  if (repository === postgresRepository) {
    const relational = await listGestorRelationalPhaseA(scope.clientIds);
    return relational;
  }
  const [allClients, allAreas, allMachines, allOperations] = await Promise.all([
    repository.listClients(),
    repository.listAreas(),
    repository.listMachines(),
    repository.listOperations(),
  ]);
  const allowedIds = scope.clientIds === null ? null : new Set(scope.clientIds);
  const clients = allClients
    .filter((client) => allowedIds === null || allowedIds.has(client.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const clientIds = new Set(clients.map((client) => client.id));
  const machines = allMachines.filter((machine) => clientIds.has(machine.clientId));
  const machineIds = new Set(machines.map((machine) => machine.id));
  return {
    clients,
    areas: allAreas.filter((area) => clientIds.has(area.clientId)),
    machines,
    operations: allOperations.filter((operation) => clientIds.has(operation.clientId)),
    alerts: demoAlerts.filter((alert) => machineIds.has(alert.machineId)),
  };
}

function alertCounts(alerts: readonly Alert[]) {
  return alerts.reduce<Record<string, number>>((counts, alert) => {
    counts[alert.machineId] = (counts[alert.machineId] ?? 0) + 1;
    return counts;
  }, {});
}

export async function buildGestorRelationalSnapshot(
  relational: GestorRelationalData,
  source: "postgres" | "mock",
  degraded: boolean,
  scope: GestorAccessScope,
  weights = (() => {
    const config = getRiskEngineV2Configuration();
    return { ml: config.mlWeight, operationalRules: config.operationalRulesWeight };
  })(),
  operationalOverview: GestorDashboardSnapshot["operationalOverview"] = emptyOperationalOverview,
): Promise<GestorDashboardSnapshot> {
  const counts = alertCounts(relational.alerts);
  return {
    source,
    degraded,
    loadedAt: new Date().toISOString(),
    scopeRule: scope.clientIds === null
      ? "Escopo global autorizado pela conta Admin/Sompo"
      : `Clientes autorizados para a conta ${scope.userId}`,
    weights,
    clients: relational.clients,
    areas: relational.areas,
    machines: relational.machines,
    operations: relational.operations,
    machineRows: [],
    areaRows: [],
    operationRows: [],
    operationTypeRows: [],
    machineDistribution: { alto: 0, medio: 0, baixo: 0, total: 0 },
    alerts: relational.alerts,
    alertsSource: source === "postgres" ? "postgres" : "demo",
    criticalAlerts: relational.alerts.filter(
      (alert) => alert.level === "alto" && alert.status !== "resolvido",
    ).length,
    averageScore: 0,
    machinesAtRisk: 0,
    operationalOverview,
    primaryOperation: primaryOperation(relational.operations),
    alertCountsByMachine: counts,
    riskCoverageComplete: false,
    evaluatedOperationIds: [],
    relationalCounts: {
      clients: relational.clients.length,
      areas: relational.areas.length,
      machines: relational.machines.length,
      operations: relational.operations.length,
      alerts: relational.alerts.length,
    },
  };
}

const categoryForFactor = (factor: string): RecCategory => {
  const normalized = factor.toLowerCase();
  if (normalized.includes("clima") || normalized.includes("chuva")) return "Horário";
  if (normalized.includes("água")) return "Rota";
  if (normalized.includes("terreno") || normalized.includes("solo")) return "Atenção ambiental";
  if (normalized.includes("operação")) return "Operação";
  return "Prevenção de sinistro";
};

const recommendationFor = (
  id: string,
  score: number,
  factor: string,
): GeneratedRecommendation => ({
  id: `${id}-gestor-v2`,
  title: `Revisar ${factor.toLowerCase()}`,
  description: `Priorize este equipamento para revisão e controle de ${factor.toLowerCase()}.`,
  rationale: `Score ${score}/100 calculado pelo Risk Engine V2; principal origem explicativa: ${factor.toLowerCase()}.`,
  category: categoryForFactor(factor),
  priority: score >= 71 ? "alta" : score >= 41 ? "média" : "baixa",
  audience: "gestor",
  factor,
});

async function readScoped(repository: AgroRiskRepository, scope: GestorAccessScope) {
  if (repository === postgresRepository) {
    const scoped = await listClientRelationalScope(scope.clientIds);
    const machineIds = new Set(scoped.machines.map((machine) => machine.id));
    return {
      ...scoped,
      alerts: demoAlerts.filter((alert) => machineIds.has(alert.machineId)),
    };
  }
  // Quatro consultas independentes, executadas em paralelo. Alertas e histórico
  // não bloqueiam o dashboard inicial.
  const [allClients, allAreas, allMachines, allOperations] = await Promise.all([
    repository.listClients(),
    repository.listAreas(),
    repository.listMachines(),
    repository.listOperations(),
  ]);
  const allowedIds = scope.clientIds === null ? null : new Set(scope.clientIds);
  const clients = [...allClients]
    .filter((client) => allowedIds === null || allowedIds.has(client.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const clientIds = new Set(clients.map((client) => client.id));
  const areas = allAreas.filter((area) => clientIds.has(area.clientId));
  const machines = allMachines.filter((machine) => clientIds.has(machine.clientId));
  const operations = allOperations.filter((operation) => clientIds.has(operation.clientId));
  const machineIds = new Set(machines.map((machine) => machine.id));
  return {
    clients,
    areas,
    machines,
    operations,
    alerts: demoAlerts.filter((alert) => machineIds.has(alert.machineId)),
  };
}

async function buildSnapshot(
  relational: Awaited<ReturnType<typeof readScoped>>,
  source: "postgres" | "mock",
  degraded: boolean,
  scope: GestorAccessScope,
  operationalOverview: GestorDashboardSnapshot["operationalOverview"],
  externalServices?: OperationRiskExternalServices,
): Promise<GestorDashboardSnapshot> {
  const configuration = getRiskEngineV2Configuration();
  const base = await buildAdminDashboardSnapshot(relational, source, degraded, {
    ml: configuration.mlWeight,
    operationalRules: configuration.operationalRulesWeight,
  }, undefined, externalServices);
  const scopedMachineIds = new Set(base.machines.map((machine) => machine.id));
  const scopedDemoAlerts = relational.alerts.filter((alert) => scopedMachineIds.has(alert.machineId));
  const machineRows = base.machineRows.map((row) => ({
    ...row,
    recommendation: recommendationFor(row.machine.id, row.score, row.mainFactor),
  }));
  const averageScore = machineRows.length
    ? Math.round(machineRows.reduce((total, row) => total + row.score, 0) / machineRows.length)
    : 0;
  return {
    source,
    degraded,
    loadedAt: base.loadedAt,
    scopeRule: scope.clientIds === null
      ? "Escopo global autorizado pela conta Admin/Sompo"
      : `Clientes autorizados para a conta ${scope.userId}`,
    weights: base.weights,
    clients: base.clients,
    areas: base.areas,
    machines: base.machines,
    operations: base.operations,
    machineRows,
    areaRows: base.areaRows,
    operationRows: base.operationRows,
    operationTypeRows: base.operationTypeRows,
    machineDistribution: base.machineDistribution,
    alerts: scopedDemoAlerts,
    alertsSource: "demo",
    criticalAlerts: scopedDemoAlerts.filter(
      (alert) => alert.level === "alto" && alert.status !== "resolvido",
    ).length,
    averageScore,
    machinesAtRisk: machineRows.filter((row) => row.score >= 70).length,
    operationalOverview,
    primaryOperation: primaryOperation(base.operations),
    alertCountsByMachine: base.alertCountsByMachine,
    riskCoverageComplete: base.riskCoverageComplete ?? true,
    evaluatedOperationIds: base.operationRows.map((row) => row.operation.id),
    relationalCounts: {
      clients: base.clients.length,
      areas: base.areas.length,
      machines: base.machines.length,
      operations: base.operations.length,
      alerts: scopedDemoAlerts.length,
    },
  };
}

async function loadUncached(
  primary: AgroRiskRepository,
  fallback: AgroRiskRepository,
  scope: GestorAccessScope,
  externalServices?: OperationRiskExternalServices,
): Promise<GestorDashboardSnapshot> {
  const progressive =
    primary === postgresRepository && fallback === mockRepository && !externalServices;
  try {
    if (progressive) {
      const relational = await readGestorPhaseA(primary, scope);
      return await buildGestorRelationalSnapshot(relational, "postgres", false, scope);
    }
    if (primary === postgresRepository) {
      const [relational, operationalOverview] = await Promise.all([
        readScoped(primary, scope),
        listGestorOperationalOverview(scope.clientIds),
      ]);
      return await buildSnapshot(relational, "postgres", false, scope, operationalOverview, externalServices);
    }
    return await buildSnapshot(await readScoped(primary, scope), "postgres", false, scope, {
      maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
      activity: [],
    }, externalServices);
  } catch (error) {
    console.error("[gestor-dashboard] PostgreSQL indisponível; usando fallback mock.", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    if (progressive) {
      return await buildGestorRelationalSnapshot(
        await readGestorPhaseA(fallback, scope), "mock", true, scope,
      );
    }
    return await buildSnapshot(await readScoped(fallback, scope), "mock", true, scope, {
      maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
      activity: [],
    }, externalServices);
  }
}

export async function loadGestorDashboardSnapshot(
  scope: GestorAccessScope,
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
  externalServices?: OperationRiskExternalServices,
): Promise<GestorDashboardSnapshot> {
  if (primary !== postgresRepository || fallback !== mockRepository || externalServices) {
    return loadUncached(primary, fallback, scope, externalServices);
  }
  const config = getRiskEngineV2Configuration();
  const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
   const key = `gestor-dashboard:v5:phase-a:${scope.userId}:${scopeKey}:${config.mlWeight}:${config.operationalRulesWeight}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = cacheOrFetch(
    key,
    15,
    () => loadUncached(primary, fallback, scope),
  );
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

const inFlight = new Map<string, Promise<GestorDashboardSnapshot>>();

const gestorRiskBatchInFlight = new Map<string, Promise<GestorDashboardSnapshot>>();
const gestorRowsByScope = new Map<string, { expiresAt: number; rows: AdminOperationRow[] }>();
const gestorExternalServices: OperationRiskExternalServices = {
  geocode: geocodeMunicipality,
  historicalWeather: getHistoricalClimate,
  elevation: getElevationForRisk,
  water: getWaterGeo,
};

function snapshotWithRiskRows(
  base: GestorDashboardSnapshot,
  merged: Awaited<ReturnType<typeof buildAdminDashboardRelationalSnapshot>>,
): GestorDashboardSnapshot {
  const machineRows = merged.machineRows.map((row) => ({
    ...row,
    recommendation: recommendationFor(row.machine.id, row.score, row.mainFactor),
  }));
  const averageScore = machineRows.length
    ? Math.round(machineRows.reduce((total, row) => total + row.score, 0) / machineRows.length)
    : 0;
  return {
    ...base,
    machineRows,
    areaRows: merged.areaRows,
    operationRows: merged.operationRows,
    operationTypeRows: merged.operationTypeRows,
    machineDistribution: merged.machineDistribution,
    averageScore,
    machinesAtRisk: machineRows.filter((row) => row.score >= 70).length,
    riskCoverageComplete: merged.riskCoverageComplete,
    evaluatedOperationIds: merged.operationRows.map((row) => row.operation.id),
  };
}

export async function evaluateGestorRiskBatch(
  scope: GestorAccessScope,
  operationIds: readonly string[] = [],
  limit = GESTOR_RISK_BATCH_LIMIT,
  externalServices?: OperationRiskExternalServices,
  repository: AgroRiskRepository = postgresRepository,
): Promise<GestorDashboardSnapshot> {
  const ids = [...new Set(operationIds)].slice(0, GESTOR_RISK_BATCH_LIMIT);
  const batchSize = Math.max(1, Math.min(limit, GESTOR_RISK_BATCH_LIMIT));
  const configuration = getRiskEngineV2Configuration();
  const weights = { ml: configuration.mlWeight, operationalRules: configuration.operationalRulesWeight };
  const source = repository === postgresRepository ? "postgres" : "mock";
  const run = async () => {
    const relational = await readGestorPhaseA(repository, scope);
    const selectedIds = selectGestorPriorityOperationIds(
      relational.operations, ids, batchSize, ids.length === 0,
    );
    const selected = relational.operations.filter((operation) => selectedIds.includes(operation.id));
    const relationalSnapshot = await buildGestorRelationalSnapshot(
      relational, source, false, scope, weights,
    );
    const adminBase = await buildAdminDashboardRelationalSnapshot(
      relational, source, false, weights,
    );
    const clients = new Map(relational.clients.map((client) => [client.id, client]));
    const areas = new Map(relational.areas.map((area) => [area.id, area]));
    const machines = new Map(relational.machines.map((machine) => [machine.id, machine]));
    const contextByOperationId = new Map(
      (repository === postgresRepository
        ? await listOperationRiskContexts({ clientIds: scope.clientIds, operationIds: selectedIds })
        : []
      ).map((context) => [context.operation.id, context]),
    );
    const services = externalServices ?? gestorExternalServices;
    const rows = await Promise.all(selected.map(async (operation) => {
      const context = contextByOperationId.get(operation.id) ?? buildFallbackOperationRiskContext(
        operation,
        machines.get(operation.machineId)!,
        areas.get(operation.areaId)!,
        clients.get(operation.clientId)!,
      );
      const evaluation = await evaluateOperationRiskV2(
        context,
        weights,
        services,
        { priority: batchSize === 1 ? "interactive" : "background" },
      );
      return {
        operation,
        evaluation,
        score: evaluation.result.finalScore,
        level: evaluation.result.level,
        mainFactor: evaluation.result.drivers[0]?.label ?? "Sem fator dominante",
      };
    }));
    const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
    const accumulatedKey = `${scope.userId}:${scopeKey}:${weights.ml}:${weights.operationalRules}`;
    const previous = gestorRowsByScope.get(accumulatedKey);
    const accumulated = previous && previous.expiresAt > Date.now()
      ? [...new Map([...previous.rows, ...rows].map((row) => [row.operation.id, row])).values()]
      : rows;
    gestorRowsByScope.set(accumulatedKey, {
      expiresAt: Date.now() + 15 * 60_000,
      rows: accumulated,
    });
    return snapshotWithRiskRows(
      relationalSnapshot,
      mergeAdminOperationRows(adminBase, accumulated),
    );
  };
  if (externalServices) return run();
  const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
  const key = `${scope.userId}:${scopeKey}:${ids.slice().sort().join(",")}:${batchSize}:${weights.ml}:${weights.operationalRules}`;
  const pending = gestorRiskBatchInFlight.get(key);
  if (pending) return pending;
  const request = run();
  gestorRiskBatchInFlight.set(key, request);
  try {
    return await request;
  } finally {
    gestorRiskBatchInFlight.delete(key);
  }
}