import { alerts as demoAlerts, type Alert, type Client, type Machine, type Operation } from "./mock-data";
import type { AgroRiskRepository } from "./data/repository";
import { mockRepository } from "./data/mock-repository.server";
import { listClientRelationalScope, postgresRepository } from "./data/postgres-repository.server";
import { buildAdminDashboardSnapshot } from "./admin-dashboard.server";
import { getRiskEngineV2Configuration } from "./risk-config.server";
import { cacheOrFetch } from "./cache.server";
import { evaluateRiskEngineV2 } from "./risk-engine-v2/evaluate";
import { RISK_ENGINE_V2_DEMO_SCENARIOS, type RiskEngineV2DemoScenarioId } from "./risk-engine-v2/demo-scenario";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./risk-engine-v2/types";
import type { GeneratedRecommendation, NextBestAction, RecCategory } from "./recommendations";
import type { ConsultorClientView, ConsultorDashboardSnapshot } from "./consultor-dashboard-types";

export interface ConsultorAccessScope {
  userId: string;
  clientIds: string[] | null;
}
const stableNumber = (value: string) => [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
const scenarioFor = (clientId: string): RiskEngineV2DemoScenarioId =>
  (["low", "medium", "high"] as const)[stableNumber(clientId) % 3];

function evaluateOperation(operation: Operation, client: Client | undefined, weights: RiskEngineV2Weights) {
  const scenario = RISK_ENGINE_V2_DEMO_SCENARIOS[scenarioFor(operation.clientId)];
  return evaluateRiskEngineV2({
    mlInput: { ...scenario.mlInput, DT_REFERENCIA: operation.scheduledAt.slice(0, 10), UF: client?.state ?? scenario.mlInput.UF },
    operationalRulesInput: { ...scenario.operationalRulesInput, operationType: operation.type },
    weights,
  });
}

function evaluateReference(clientId: string, weights: RiskEngineV2Weights) {
  const scenario = RISK_ENGINE_V2_DEMO_SCENARIOS[scenarioFor(clientId)];
  return evaluateRiskEngineV2({
    mlInput: scenario.mlInput,
    operationalRulesInput: { waterDistance: "acima_150", operationType: "Trabalho no campo", terrain: "normal" },
    weights,
  });
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
  base: ReturnType<typeof buildAdminDashboardSnapshot>,
  resultByMachine: Map<string, RiskEngineV2Result>,
  alerts: Alert[],
): ConsultorClientView {
  const summary = base.clientRows.find((row) => row.client.id === client.id)!;
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
  const recommendation = recommendationFor(client.id, summary.score, summary.mainFactor);
  const componentLabel = dominantComponent === "climate" ? "componente climático" : dominantComponent === "operational" ? "componente operacional" : "componentes balanceados";
  const nextAction: NextBestAction = {
    title: recommendation.title,
    description: recommendation.description,
    factor: recommendation.factor,
    priority: recommendation.priority,
    category: recommendation.category,
  };
  return {
    client,
    summary,
    machines,
    areas,
    recurringFactors,
    composition: {
      climateScore: Math.round(avg((result) => result.ml.mlRelativeScore)),
      operationalScore: Math.round(avg((result) => result.operationalRules.operationalRulesScore)),
      climateContribution,
      operationalContribution,
      dominantComponent,
    },
    recommendation,
    nextAction,
    explanation: `O cliente apresenta score ${summary.score}/100, classificado como risco ${summary.level}. A origem predominante está em ${componentLabel}, com atenção principal em ${summary.mainFactor.toLowerCase()}. A recomendação é ${recommendation.title.toLowerCase()}.`,
    alerts: alerts.filter((alert) => machines.some((row) => row.machine.id === alert.machineId)),
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
  };
}

function buildSnapshot(
  relational: Awaited<ReturnType<typeof readScope>>,
  source: "postgres" | "mock",
  degraded: boolean,
  weights: RiskEngineV2Weights,
  scope: ConsultorAccessScope,
) {
  const base = buildAdminDashboardSnapshot(relational, source, degraded, weights);
  const clients = new Map(relational.clients.map((client) => [client.id, client]));
  const operationsByMachine = new Map<string, Operation[]>();
  relational.operations.forEach((operation) => operationsByMachine.set(operation.machineId, [...(operationsByMachine.get(operation.machineId) ?? []), operation]));
  const resultByMachine = new Map<string, RiskEngineV2Result>();
  relational.machines.forEach((machine: Machine) => {
    const operation = newest(operationsByMachine.get(machine.id) ?? []);
    resultByMachine.set(machine.id, operation ? evaluateOperation(operation, clients.get(machine.clientId), weights) : evaluateReference(machine.clientId, weights));
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
  };
}

async function loadUncached(
  primary: AgroRiskRepository,
  fallback: AgroRiskRepository,
  weights: RiskEngineV2Weights,
  scope: ConsultorAccessScope,
): Promise<ConsultorDashboardSnapshot> {
  try {
    return buildSnapshot(await readScope(primary, scope), "postgres", false, weights, scope);
  } catch (error) {
    console.error("[consultor-dashboard] PostgreSQL indisponível; usando fallback mock.", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    return buildSnapshot(await readScope(fallback, scope), "mock", true, weights, scope);
  }
}

export async function loadConsultorDashboardSnapshot(
  scope: ConsultorAccessScope,
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<ConsultorDashboardSnapshot> {
  const config = getRiskEngineV2Configuration();
  const weights = { ml: config.mlWeight, operationalRules: config.operationalRulesWeight };
  if (primary !== postgresRepository || fallback !== mockRepository) {
    return loadUncached(primary, fallback, weights, scope);
  }
  const scopeKey = scope.clientIds === null ? "global" : [...scope.clientIds].sort().join(",");
  const key = `consultor-dashboard:v2:${scope.userId}:${scopeKey}:${config.mlWeight}:${config.operationalRulesWeight}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = cacheOrFetch(key, 15, () => loadUncached(primary, fallback, weights, scope));
  inFlight.set(key, request);
  try { return await request; } finally { inFlight.delete(key); }
}

const inFlight = new Map<string, Promise<ConsultorDashboardSnapshot>>();