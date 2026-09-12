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
  assertOperationClientCoherence,
  buildAdminDashboardRelationalSnapshot,
  buildAdminDashboardSnapshot,
} from "./admin-dashboard.server";
import { mergeAdminOperationRows } from "./admin-dashboard-merge";
import { resolveRiskEngineV2Weights } from "./risk-config.server";
import { cacheOrFetch } from "./cache.server";
import type { GeneratedRecommendation, RecCategory } from "./recommendations";
import type { GestorDashboardSnapshot } from "./gestor-dashboard-types";
import {
  buildFallbackOperationRiskContext,
  evaluateOperationRiskV2,
} from "./risk-engine-v2/operation-input.server";
import type { RiskEngineV2Weights } from "./risk-engine-v2/types";
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
  weights: RiskEngineV2Weights = { ml: 70, operationalRules: 30 },
  operationalOverview: GestorDashboardSnapshot["operationalOverview"] = emptyOperationalOverview,
  alertsSource: GestorDashboardSnapshot["alertsSource"] =
    source === "postgres" ? "postgres" : "demo",
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
    alertsSource,
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
    riskErrorsByOperationId: {},
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
  repository: AgroRiskRepository,
): Promise<GestorDashboardSnapshot> {
  const resolved = await Promise.all(
    [...new Set(relational.operations.map((operation) => operation.clientId))]
      .map(async (clientId) => [clientId, await resolveRiskEngineV2Weights(clientId, repository)] as const),
  );
  const effectiveWeightsByClientId = new Map(
    resolved.map(([clientId, configuration]) => [clientId, configuration.weights]),
  );
  const globalConfiguration = await resolveRiskEngineV2Weights(undefined, repository);
  const base = await buildAdminDashboardSnapshot(
    relational,
    source,
    degraded,
    globalConfiguration.weights,
    undefined,
    effectiveWeightsByClientId,
  );
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
  _fallback: AgroRiskRepository,
  scope: GestorAccessScope,
): Promise<GestorDashboardSnapshot> {
  if (primary === postgresRepository) {
    const globalConfiguration = await resolveRiskEngineV2Weights(undefined, primary);
    const relational = await readGestorPhaseA(primary, scope);
    return await buildGestorRelationalSnapshot(
      relational, "postgres", false, scope, globalConfiguration.weights,
      emptyOperationalOverview, "postgres",
    );
  }
  const explicitMockMode = primary === mockRepository;
  return await buildSnapshot(
    await readScoped(primary, scope),
    explicitMockMode ? "mock" : "postgres",
    explicitMockMode,
    scope,
    {
      maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
      activity: [],
    },
    primary,
  );
}

export async function loadGestorDashboardSnapshot(
  scope: GestorAccessScope,
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<GestorDashboardSnapshot> {
  if (primary !== postgresRepository) {
    return loadUncached(primary, fallback, scope);
  }
  const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
  const globalConfiguration = await resolveRiskEngineV2Weights(undefined, primary);
  const key = `gestor-dashboard:v6:phase-a:${scope.userId}:${scopeKey}:${globalConfiguration.cacheSignature}`;
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
function snapshotWithRiskRows(
  base: GestorDashboardSnapshot,
  merged: Awaited<ReturnType<typeof buildAdminDashboardRelationalSnapshot>>,
  riskErrorsByOperationId: Record<string, string> = {},
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
    riskErrorsByOperationId,
  };
}

export async function evaluateGestorRiskBatch(
  scope: GestorAccessScope,
  operationIds: readonly string[] = [],
  limit = GESTOR_RISK_BATCH_LIMIT,
  repository: AgroRiskRepository = postgresRepository,
): Promise<GestorDashboardSnapshot> {
  const ids = [...new Set(operationIds)].slice(0, GESTOR_RISK_BATCH_LIMIT);
  const batchSize = Math.max(1, Math.min(limit, GESTOR_RISK_BATCH_LIMIT));
  const source = repository === postgresRepository ? "postgres" : "mock";
  const relational = await readGestorPhaseA(repository, scope);
  const selectedIds = selectGestorPriorityOperationIds(
    relational.operations, ids, batchSize, ids.length === 0,
  );
  const selected = relational.operations.filter((operation) => selectedIds.includes(operation.id));
  const resolvedByClientId = new Map(await Promise.all(
    [...new Set(relational.operations.map((operation) => operation.clientId))].map(
      async (clientId) => [clientId, await resolveRiskEngineV2Weights(clientId, repository)] as const,
    ),
  ));
  const configurationSignature = [...resolvedByClientId.values()]
    .map((configuration) => configuration.cacheSignature)
    .sort()
    .join("|");
  const globalConfiguration = await resolveRiskEngineV2Weights(undefined, repository);
  const run = async () => {
    const relationalSnapshot = await buildGestorRelationalSnapshot(
      relational, source, false, scope, globalConfiguration.weights,
      emptyOperationalOverview, source === "postgres" ? "postgres" : "demo",
    );
    const adminBase = await buildAdminDashboardRelationalSnapshot(
      relational, source, false, globalConfiguration.weights,
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
    const settled = await Promise.allSettled(selected.map(async (operation) => {
      const context = contextByOperationId.get(operation.id) ?? buildFallbackOperationRiskContext(
        operation,
        machines.get(operation.machineId)!,
        areas.get(operation.areaId)!,
        clients.get(operation.clientId)!,
      );
      assertOperationClientCoherence(operation, context);
      const evaluation = await evaluateOperationRiskV2(
        context,
        resolvedByClientId.get(operation.clientId)?.weights
          ?? (() => { throw new Error(`Pesos não resolvidos para ${operation.clientId}.`); })(),
      );
      return {
        operation,
        evaluation,
        score: evaluation.result.finalScore,
        level: evaluation.result.level,
        mainFactor: evaluation.result.drivers[0]?.label ?? "Sem fator dominante",
      };
    }));
    const rows = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const riskErrorsByOperationId = Object.fromEntries(settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [[selected[index].id, result.reason instanceof Error ? result.reason.message : "Não foi possível calcular o risco."]]
        : [],
    ));
    const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
    const accumulatedKey = `${scope.userId}:${scopeKey}:${configurationSignature}`;
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
      riskErrorsByOperationId,
    );
  };
  const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
  const key = `${scope.userId}:${scopeKey}:${ids.slice().sort().join(",")}:${batchSize}:${configurationSignature}`;
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