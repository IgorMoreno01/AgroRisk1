import { alerts as demoAlerts, type Alert } from "./mock-data";
import type { AgroRiskRepository } from "./data/repository";
import { mockRepository } from "./data/mock-repository.server";
import { postgresRepository } from "./data/postgres-repository.server";
import { listGestorRelationalScope } from "./data/postgres-repository.server";
import { buildAdminDashboardSnapshot } from "./admin-dashboard.server";
import { getRiskEngineV2Configuration } from "./risk-config.server";
import { cacheOrFetch } from "./cache.server";
import type { GeneratedRecommendation, RecCategory } from "./recommendations";
import type { GestorDashboardSnapshot } from "./gestor-dashboard-types";

const GESTOR_CLIENT_LIMIT = 5;
const SCOPE_RULE = "Primeiros 5 clientes por ID e todos os registros relacionados";

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

async function readScoped(repository: AgroRiskRepository) {
  if (repository === postgresRepository) {
    const scoped = await listGestorRelationalScope(GESTOR_CLIENT_LIMIT);
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
  const clients = [...allClients]
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, GESTOR_CLIENT_LIMIT);
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
    scopeRule: SCOPE_RULE,
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
  };
}

async function loadUncached(
  primary: AgroRiskRepository,
  fallback: AgroRiskRepository,
): Promise<GestorDashboardSnapshot> {
  try {
    return buildSnapshot(await readScoped(primary), "postgres", false);
  } catch (error) {
    console.error("[gestor-dashboard] PostgreSQL indisponível; usando fallback mock.", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    return buildSnapshot(await readScoped(fallback), "mock", true);
  }
}

export async function loadGestorDashboardSnapshot(
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<GestorDashboardSnapshot> {
  if (primary !== postgresRepository || fallback !== mockRepository) {
    return loadUncached(primary, fallback);
  }
  const config = getRiskEngineV2Configuration();
  const key = `gestor-dashboard:v2:${config.mlWeight}:${config.operationalRulesWeight}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = cacheOrFetch(
    key,
    15,
    () => loadUncached(primary, fallback),
  );
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

const inFlight = new Map<string, Promise<GestorDashboardSnapshot>>();