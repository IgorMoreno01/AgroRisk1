import { alerts as demoAlerts, type Alert } from "./mock-data";
import type { AgroRiskRepository } from "./data/repository";
import { mockRepository } from "./data/mock-repository.server";
import { postgresRepository } from "./data/postgres-repository.server";
import { listClientRelationalScope, listGestorOperationalOverview } from "./data/postgres-repository.server";
import { buildAdminDashboardSnapshot } from "./admin-dashboard.server";
import { getRiskEngineV2Configuration } from "./risk-config.server";
import { cacheOrFetch } from "./cache.server";
import type { GeneratedRecommendation, RecCategory } from "./recommendations";
import type { GestorDashboardSnapshot } from "./gestor-dashboard-types";

export interface GestorAccessScope {
  userId: string;
  clientIds: string[] | null;
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

function buildSnapshot(
  relational: Awaited<ReturnType<typeof readScoped>>,
  source: "postgres" | "mock",
  degraded: boolean,
  scope: GestorAccessScope,
  operationalOverview: GestorDashboardSnapshot["operationalOverview"],
): GestorDashboardSnapshot {
  const configuration = getRiskEngineV2Configuration();
  const base = buildAdminDashboardSnapshot(relational, source, degraded, {
    ml: configuration.mlWeight,
    operationalRules: configuration.operationalRulesWeight,
  });
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
  };
}

async function loadUncached(
  primary: AgroRiskRepository,
  fallback: AgroRiskRepository,
  scope: GestorAccessScope,
): Promise<GestorDashboardSnapshot> {
  try {
    if (primary === postgresRepository) {
      const [relational, operationalOverview] = await Promise.all([
        readScoped(primary, scope),
        listGestorOperationalOverview(scope.clientIds),
      ]);
      return buildSnapshot(relational, "postgres", false, scope, operationalOverview);
    }
    return buildSnapshot(await readScoped(primary, scope), "postgres", false, scope, {
      maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
      activity: [],
    });
  } catch (error) {
    console.error("[gestor-dashboard] PostgreSQL indisponível; usando fallback mock.", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    return buildSnapshot(await readScoped(fallback, scope), "mock", true, scope, {
      maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
      activity: [],
    });
  }
}

export async function loadGestorDashboardSnapshot(
  scope: GestorAccessScope,
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<GestorDashboardSnapshot> {
  if (primary !== postgresRepository || fallback !== mockRepository) {
    return loadUncached(primary, fallback, scope);
  }
  const config = getRiskEngineV2Configuration();
  const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
  const key = `gestor-dashboard:v4:${scope.userId}:${scopeKey}:${config.mlWeight}:${config.operationalRulesWeight}`;
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