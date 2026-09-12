import { alerts as demoAlerts, type Alert, type Client, type Machine, type Operation } from "./mock-data";
import type { AgroRiskRepository } from "./data/repository";
import { mockRepository } from "./data/mock-repository.server";
import {
  listClientRelationalScope,
  listConsultorRelationalPhaseA,
  listConsultorPreventiveOverview,
  postgresRepository,
} from "./data/postgres-repository.server";
import {
  buildAdminDashboardRelationalSnapshot,
  buildAdminDashboardSnapshot,
  memoizeAdminRiskServices,
  selectPrioritizedAdminOperations,
} from "./admin-dashboard.server";
import { mergeAdminOperationRows } from "./admin-dashboard-merge";
import { getRiskEngineV2Configuration } from "./risk-config.server";
import { cacheOrFetch } from "./cache.server";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./risk-engine-v2/types";
import {
  buildFallbackOperationRiskContext,
  evaluateOperationRiskV2,
  type OperationRiskExternalServices,
} from "./risk-engine-v2/operation-input.server";
import { geocodeMunicipality } from "./adapters/location.server";
import { getHistoricalClimate } from "./adapters/climate.server";
import { getElevationForRisk } from "./adapters/terrain.server";
import { getWaterGeo } from "./adapters/water-geo.server";
import type { GeneratedRecommendation, NextBestAction, RecCategory } from "./recommendations";
import type {
  ConsultorClientView,
  ConsultorDashboardSnapshot,
  ConsultorPreventiveOverview,
} from "./consultor-dashboard-types";
import type { AdminOperationRow } from "./admin-dashboard-types";

export interface ConsultorAccessScope {
  userId: string;
  clientIds: string[] | null;
}
function newest(operations: Operation[]) {
  return [...operations].sort((a, b) =>
    Number(b.status === "Em andamento") - Number(a.status === "Em andamento") ||
    Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt) ||
    a.id.localeCompare(b.id))[0];
}

const categoryFor = (factor: string): RecCategory => {
  const value = factor.toLowerCase();
  if (value.includes("clima") || value.includes("chuva")) return "Horário";
  if (value.includes("água")) return "Rota";
  if (value.includes("solo") || value.includes("terreno")) return "Atenção ambiental";
  if (value.includes("operação")) return "Operação";
  return "Prevenção de sinistro";
};

function recommendationFor(clientId: string, score: number, factor: string): GeneratedRecommendation {
  return {
    id: `${clientId}-consultor-v2`,
    title: `Acompanhar ${factor.toLowerCase()}`,
    description: `Oriente o cliente a revisar preventivamente ${factor.toLowerCase()}.`,
    rationale: `Score ${score}/100 calculado pelo Risk Engine V2; principal origem explicativa: ${factor.toLowerCase()}.`,
    category: categoryFor(factor),
    priority: score >= 71 ? "alta" : score >= 41 ? "média" : "baixa",
    audience: "consultor",
    factor,
  };
}

function buildClientView(
  client: Client,
  base: Awaited<ReturnType<typeof buildAdminDashboardSnapshot>>,
  resultByMachine: Map<string, RiskEngineV2Result>,
  alerts: Alert[],
): ConsultorClientView {
  const summary = base.clientRows.find((row) => row.client.id === client.id);
  const machines = base.machineRows.filter((row) => row.machine.clientId === client.id);
  const areas = base.areaRows.filter((row) => row.area.clientId === client.id);
  const results = machines.map((row) => resultByMachine.get(row.machine.id)!).filter(Boolean);
  const avg = (select: (result: RiskEngineV2Result) => number) =>
    results.length ? results.reduce((sum, result) => sum + select(result), 0) / results.length : 0;
  const climateContribution = avg((result) => result.contributions.find((item) => item.component === "ml")?.weightedContribution ?? 0);
  const operationalContribution = avg((result) => result.contributions.find((item) => item.component === "operational_rules")?.weightedContribution ?? 0);
  const dominantComponent = Math.abs(climateContribution - operationalContribution) < 0.05
    ? "balanced" as const
    : climateContribution > operationalContribution ? "climate" as const : "operational" as const;
  const recurringFactors = Object.entries(machines.reduce<Record<string, number>>((counts, row) => {
    counts[row.mainFactor] = (counts[row.mainFactor] ?? 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([factor, count]) => ({ factor, count }));
  const recommendation = summary
    ? recommendationFor(client.id, summary.score, summary.mainFactor)
    : undefined;
  const componentLabel = dominantComponent === "climate" ? "componente climático" : dominantComponent === "operational" ? "componente operacional" : "componentes balanceados";
  const nextAction: NextBestAction | undefined = recommendation ? {
    title: recommendation.title,
    description: recommendation.description,
    factor: recommendation.factor,
    priority: recommendation.priority,
    category: recommendation.category,
  } : undefined;
  return {
    client,
    machinesData: base.machines.filter((machine) => machine.clientId === client.id),
    areasData: base.areas.filter((area) => area.clientId === client.id),
    operations: base.operations.filter((operation) => operation.clientId === client.id),
    evaluatedOperationIds: base.operationRows.map((row) => row.operation.id),
    summary,
    machines,
    areas,
    recurringFactors,
    composition: summary ? {
      climateScore: Math.round(avg((result) => result.ml.mlRelativeScore)),
      operationalScore: Math.round(avg((result) => result.operationalRules.operationalRulesScore)),
      climateContribution,
      operationalContribution,
      dominantComponent,
    } : undefined,
    recommendation,
    nextAction,
    explanation: summary && recommendation
      ? `O cliente apresenta score ${summary.score}/100, classificado como risco ${summary.level}. A origem predominante está em ${componentLabel}, com atenção principal em ${summary.mainFactor.toLowerCase()}. A recomendação é ${recommendation.title.toLowerCase()}.`
      : undefined,
    alerts: alerts.filter((alert) => machines.some((row) => row.machine.id === alert.machineId)),
  };
}

function buildRelationalClientView(
  client: Client,
  relational: Awaited<ReturnType<typeof readScope>>,
): ConsultorClientView {
  const machinesData = relational.machines.filter((machine) => machine.clientId === client.id);
  const machineIds = new Set(machinesData.map((machine) => machine.id));
  return {
    client,
    machinesData,
    areasData: relational.areas.filter((area) => area.clientId === client.id),
    operations: relational.operations.filter((operation) => operation.clientId === client.id),
    evaluatedOperationIds: [],
    machines: [],
    areas: [],
    recurringFactors: [],
    alerts: relational.alerts.filter((alert) => machineIds.has(alert.machineId)),
  };
}

async function readScope(repository: AgroRiskRepository, scope: ConsultorAccessScope) {
  if (repository === postgresRepository) {
    const relational = await listClientRelationalScope(scope.clientIds);
    const ids = new Set(relational.machines.map((machine) => machine.id));
    return { ...relational, alerts: demoAlerts.filter((alert) => ids.has(alert.machineId)) };
  }
  const [allClients, allAreas, allMachines, allOperations] = await Promise.all([
    repository.listClients(), repository.listAreas(), repository.listMachines(), repository.listOperations(),
  ]);
  const allowedIds = scope.clientIds === null ? null : new Set(scope.clientIds);
  const clients = [...allClients]
    .filter((client) => allowedIds === null || allowedIds.has(client.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(clients.map((client) => client.id));
  const machines = allMachines.filter((machine) => ids.has(machine.clientId));
  const machineIds = new Set(machines.map((machine) => machine.id));
  return {
    clients,
    areas: allAreas.filter((area) => ids.has(area.clientId)),
    machines,
    operations: allOperations.filter((operation) => ids.has(operation.clientId)),
    alerts: demoAlerts.filter((alert) => machineIds.has(alert.machineId)),
    riskContexts: [],
  };
}

async function buildSnapshot(
  relational: Awaited<ReturnType<typeof readScope>>,
  source: "postgres" | "mock",
  degraded: boolean,
  weights: RiskEngineV2Weights,
  scope: ConsultorAccessScope,
  preventiveOverview: ConsultorPreventiveOverview = {
    maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
    attentionPoints: [],
  },
  externalServices?: OperationRiskExternalServices,
) {
  const base = await buildAdminDashboardSnapshot(
    relational, source, degraded, weights, undefined, externalServices,
  );
  const resultByMachine = new Map<string, RiskEngineV2Result>();
  base.machineRows.forEach((row) => {
    resultByMachine.set(row.machine.id, row.evaluation.result);
  });
  return {
    source,
    degraded,
    loadedAt: base.loadedAt,
    scopeRule: scope.clientIds === null
      ? "Escopo global autorizado pela conta Admin/Sompo"
      : `Carteira autorizada para a conta ${scope.userId}`,
    weights,
    alertsSource: "demo" as const,
    clients: relational.clients.map((client) => buildClientView(client, base, resultByMachine, relational.alerts)),
    preventiveOverview,
  };
}

export async function buildConsultorRelationalSnapshot(
  relational: Awaited<ReturnType<typeof readScope>>,
  source: "postgres" | "mock",
  degraded: boolean,
  weights: RiskEngineV2Weights,
  scope: ConsultorAccessScope,
  preventiveOverview: ConsultorPreventiveOverview = {
    maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
    attentionPoints: [],
  },
): Promise<ConsultorDashboardSnapshot> {
  return {
    source,
    degraded,
    loadedAt: new Date().toISOString(),
    scopeRule: scope.clientIds === null
      ? "Escopo global autorizado pela conta Admin/Sompo"
      : `Carteira autorizada para a conta ${scope.userId}`,
    weights,
    alertsSource: "demo",
    clients: relational.clients.map((client) => buildRelationalClientView(client, relational)),
    preventiveOverview,
  };
}

async function loadUncached(
  primary: AgroRiskRepository,
  fallback: AgroRiskRepository,
  weights: RiskEngineV2Weights,
  scope: ConsultorAccessScope,
  externalServices?: OperationRiskExternalServices,
): Promise<ConsultorDashboardSnapshot> {
  const progressive =
    primary === postgresRepository && fallback === mockRepository && !externalServices;
  try {
    if (progressive) {
      const relational = await listConsultorRelationalPhaseA(scope.clientIds);
      return await buildConsultorRelationalSnapshot(
        relational, "postgres", false, weights, scope,
      );
    }
    const [relational, preventiveOverview] = await Promise.all([
      readScope(primary, scope),
      primary === postgresRepository
        ? listConsultorPreventiveOverview(scope.clientIds)
        : Promise.resolve({
            maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
            attentionPoints: [],
          }),
    ]);
    return await buildSnapshot(
      relational, "postgres", false, weights, scope, preventiveOverview, externalServices,
    );
  } catch (error) {
    console.error("[consultor-dashboard] PostgreSQL indisponível; usando fallback mock.", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    let relational = await readScope(fallback, scope);
    if (progressive) {
      const firstClientId = relational.clients[0]?.id;
      relational = {
        ...relational,
        areas: relational.areas.filter((area) => area.clientId === firstClientId),
        machines: relational.machines.filter((machine) => machine.clientId === firstClientId),
        operations: relational.operations.filter((operation) => operation.clientId === firstClientId),
        riskContexts: [],
      };
    }
    return progressive
      ? await buildConsultorRelationalSnapshot(relational, "mock", true, weights, scope)
      : await buildSnapshot(relational, "mock", true, weights, scope, undefined, externalServices);
  }
}

export async function loadConsultorDashboardSnapshot(
  scope: ConsultorAccessScope,
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
  externalServices?: OperationRiskExternalServices,
): Promise<ConsultorDashboardSnapshot> {
  const config = getRiskEngineV2Configuration();
  const weights = { ml: config.mlWeight, operationalRules: config.operationalRulesWeight };
  if (primary !== postgresRepository || fallback !== mockRepository || externalServices) {
    return loadUncached(primary, fallback, weights, scope, externalServices);
  }
  const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
  const key = `consultor-dashboard:v3:${scope.userId}:${scopeKey}:${config.mlWeight}:${config.operationalRulesWeight}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = cacheOrFetch(key, 15, () => loadUncached(primary, fallback, weights, scope));
  inFlight.set(key, request);
  try { return await request; } finally { inFlight.delete(key); }
}

export async function loadConsultorPreventiveData(
  scope: ConsultorAccessScope,
): Promise<ConsultorPreventiveOverview> {
  return listConsultorPreventiveOverview(scope.clientIds);
}

const inFlight = new Map<string, Promise<ConsultorDashboardSnapshot>>();

const consultorBatchInFlight = new Map<string, Promise<ConsultorClientView>>();
const consultorRowsByClient = new Map<string, { expiresAt: number; rows: AdminOperationRow[] }>();
const consultorExternalServices: OperationRiskExternalServices = {
  geocode: geocodeMunicipality,
  historicalWeather: getHistoricalClimate,
  elevation: getElevationForRisk,
  water: getWaterGeo,
};

export async function evaluateConsultorRiskBatch(
  scope: ConsultorAccessScope,
  clientId: string,
  operationIds: readonly string[],
  limit = 12,
  externalServices?: OperationRiskExternalServices,
  repository: AgroRiskRepository = postgresRepository,
): Promise<ConsultorClientView> {
  if (scope.clientIds !== null && !scope.clientIds.includes(clientId)) {
    throw new Error("Cliente fora do escopo autorizado.");
  }
  const ids = [...new Set(operationIds)].slice(0, 12);
  const config = getRiskEngineV2Configuration();
  const weights = { ml: config.mlWeight, operationalRules: config.operationalRulesWeight };
  const run = async () => {
    const relational = await readScope(repository, scope);
    const client = relational.clients.find((item) => item.id === clientId);
    if (!client) throw new Error("Cliente fora do escopo autorizado.");
    const clientOperations = relational.operations.filter((operation) => operation.clientId === clientId);
    const selected = selectPrioritizedAdminOperations(
      clientOperations,
      ids.filter((id) => clientOperations.some((operation) => operation.id === id)),
      Math.min(limit, 12),
    );
    const clientAreas = relational.areas.filter((area) => area.clientId === clientId);
    const clientMachines = relational.machines.filter((machine) => machine.clientId === clientId);
    const base = await buildAdminDashboardRelationalSnapshot(
      {
        ...relational,
        clients: [client],
        areas: clientAreas,
        machines: clientMachines,
        operations: clientOperations,
      },
      "postgres",
      false,
      weights,
    );
    const clientById = new Map(base.clients.map((item) => [item.id, item]));
    const areaById = new Map(base.areas.map((area) => [area.id, area]));
    const machineById = new Map(base.machines.map((machine) => [machine.id, machine]));
    const contexts = new Map((relational.riskContexts ?? []).map((context) => [context.operation.id, context]));
    const services = memoizeAdminRiskServices(externalServices ?? consultorExternalServices);
    const rows = await mapWithConcurrency(selected, 6, async (operation) => {
      const context = contexts.get(operation.id) ?? buildFallbackOperationRiskContext(
        operation,
        machineById.get(operation.machineId)!,
        areaById.get(operation.areaId)!,
        clientById.get(operation.clientId)!,
      );
      const evaluation = await evaluateOperationRiskV2(context, weights, services);
      return {
        operation,
        evaluation,
        score: evaluation.result.finalScore,
        level: evaluation.result.level,
        mainFactor: evaluation.result.drivers[0]?.label ?? "Sem fator dominante",
      };
    });
    const accumulatedKey = `${scope.userId}:${clientId}:${weights.ml}:${weights.operationalRules}`;
    const previous = consultorRowsByClient.get(accumulatedKey);
    const accumulated = previous && previous.expiresAt > Date.now()
      ? [...new Map([...previous.rows, ...rows].map((row) => [row.operation.id, row])).values()]
      : rows;
    consultorRowsByClient.set(accumulatedKey, { expiresAt: Date.now() + 15 * 60_000, rows: accumulated });
    const merged = mergeAdminOperationRows(base, accumulated);
    const resultByMachine = new Map<string, RiskEngineV2Result>();
    merged.machineRows.forEach((row) => resultByMachine.set(row.machine.id, row.evaluation.result));
    return buildClientView(client, merged, resultByMachine, relational.alerts);
  };
  if (externalServices) return run();
  const key = `${scope.userId}:${clientId}:${ids.slice().sort().join(",")}:${Math.min(limit, 12)}:${weights.ml}:${weights.operationalRules}`;
  const pending = consultorBatchInFlight.get(key);
  if (pending) return pending;
  const request = run();
  consultorBatchInFlight.set(key, request);
  try {
    return await request;
  } finally {
    consultorBatchInFlight.delete(key);
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }));
  return results;
}