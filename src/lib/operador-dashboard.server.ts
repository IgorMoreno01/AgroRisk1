import { cacheGet, cacheSet } from "./cache.server";
import { getOperatorRelationalScope, postgresRepository } from "./data/postgres-repository.server";
import { mockRepository } from "./data/mock-repository.server";
import type { AgroRiskRepository } from "./data/repository";
import { users, type Alert, type Client, type HistoryEntry, type Operation } from "./mock-data";
import type { OperadorDashboardSnapshot } from "./operador-dashboard-types";
import type { GeneratedRecommendation } from "./recommendations";
import { getRiskEngineV2Configuration } from "./risk-config.server";
import { evaluateRiskEngineV2 } from "./risk-engine-v2/evaluate";
import { RISK_ENGINE_V2_DEMO_SCENARIOS } from "./risk-engine-v2/demo-scenario";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./risk-engine-v2/types";
import type { RiskResult } from "./risk-score";

export const DEMO_OPERATOR_ID = "OPR-001";
export const OPERATOR_SCOPE_RULE =
  "Operador demonstrativo OPR-001; somente sua operação atual, máquina, área, cliente, alertas e histórico relacionados.";

const inFlight = new Map<string, Promise<OperadorDashboardSnapshot>>();

const stableNumber = (value: string) =>
  [...value].reduce((total, character) => total + character.charCodeAt(0), 0);

const scenarioForClient = (clientId: string) =>
  (["low", "medium", "high"] as const)[stableNumber(clientId) % 3];

function evaluateOperation(
  operation: Operation,
  client: Client,
  weights: RiskEngineV2Weights,
): RiskEngineV2Result {
  const scenario = RISK_ENGINE_V2_DEMO_SCENARIOS[scenarioForClient(operation.clientId)];
  return evaluateRiskEngineV2({
    mlInput: {
      ...scenario.mlInput,
      DT_REFERENCIA: operation.scheduledAt.slice(0, 10),
      UF: client.state,
    },
    operationalRulesInput: {
      ...scenario.operationalRulesInput,
      operationType: operation.type,
    },
    weights,
  });
}

function toPresentationRisk(result: RiskEngineV2Result): RiskResult {
  const climateScore = Math.round(result.ml.mlRelativeScore);
  const operationalScore = result.operationalRules.operationalRulesScore;
  const climateContribution =
    result.contributions.find((item) => item.component === "ml")?.weightedContribution ?? 0;
  const operationalContribution =
    result.contributions.find((item) => item.component === "operational_rules")?.weightedContribution ?? 0;
  const mainFactor = result.drivers[0]?.label ?? "Sem fator dominante";
  return {
    climateScore,
    operationalScore,
    climateContribution,
    operationalContribution,
    finalScore: result.finalScore,
    level: result.level,
    dominantFactor:
      result.dominantComponent === "ml"
        ? "climate"
        : result.dominantComponent === "operational_rules"
          ? "operational"
          : "balanced",
    breakdown: {
      total: result.finalScore,
      level: result.level,
      mainFactor,
      parts: [
        { category: "Clima", label: "Score climático", detail: "Resultado do componente climático", points: climateScore, max: 100 },
        { category: "Operacional", label: "Score operacional", detail: "Resultado do componente operacional", points: operationalScore, max: 100 },
      ],
    },
  };
}

function centralRecommendation(operation: Operation, result: RiskEngineV2Result): GeneratedRecommendation {
  const factor = result.drivers[0]?.label ?? "Sem fator dominante";
  return {
    id: `${operation.id}-operador-v2`,
    title: result.level === "alto" ? "Revisar a operação antes de prosseguir" : result.level === "medio" ? "Reforçar o acompanhamento da operação" : "Manter monitoramento preventivo",
    description: `Revise preventivamente ${factor.toLowerCase()} e siga os controles operacionais indicados.`,
    rationale: `Score ${result.finalScore}/100 calculado pelo Risk Engine V2; principal origem explicativa: ${factor.toLowerCase()}.`,
    category: factor.toLowerCase().includes("água") ? "Rota" : "Prevenção de sinistro",
    priority: result.level === "alto" ? "alta" : result.level === "medio" ? "média" : "baixa",
    audience: "operador",
    factor,
  };
}

function syntheticInclination(operationId: string) {
  const inclinationDegrees = Number((2 + (stableNumber(operationId) % 150) / 10).toFixed(1));
  const inclinationStatus: "estável" | "atenção" | "crítica" =
    inclinationDegrees < 5 ? "estável" : inclinationDegrees < 15 ? "atenção" : "crítica";
  return { inclinationDegrees, inclinationStatus, source: "synthetic" as const };
}

function telemetryRecommendations(
  operation: Operation,
  telemetry: ReturnType<typeof syntheticInclination>,
): GeneratedRecommendation[] {
  if (telemetry.inclinationDegrees < 5) return [];
  return [{
    id: `${operation.id}-synthetic-inclination`,
    title: "Selecionar rota com menor inclinação",
    description: "Interrompa o avanço e retome somente por um trecho com inclinação segura.",
    rationale: `Leitura sintética separada do score: inclinação ${telemetry.inclinationDegrees.toFixed(1)}° (${telemetry.inclinationStatus}).`,
    category: "Inclinação",
    priority: telemetry.inclinationStatus === "crítica" ? "alta" : "média",
    audience: "operador",
    factor: "Inclinação",
  }];
}

function syntheticCoordinates(client: Client) {
  const byState: Record<string, { lat: number; lon: number }> = {
    MT: { lat: -12.5502, lon: -55.7220 },
    PR: { lat: -24.9578, lon: -53.4595 },
    GO: { lat: -17.7989, lon: -50.9267 },
  };
  return { ...(byState[client.state] ?? { lat: -15.6014, lon: -56.0979 }), source: "synthetic" as const };
}

async function readFallback(repository: AgroRiskRepository) {
  const [clients, areas, machines, operations, alerts, history] = await Promise.all([
    repository.listClients(),
    repository.listAreas(),
    repository.listMachines(),
    repository.listOperations(),
    repository.listAlerts(),
    repository.listOperationHistory(),
  ]);
  const operator = users.find((item) => item.profile === "operador" && operations.some((op) => op.operatorId === item.id));
  if (!operator) throw new Error("Fallback sem operador demonstrativo.");
  const operatorOperations = operations.filter((item) => item.operatorId === operator.id);
  const operation = [...operatorOperations].sort((a, b) =>
    Number(b.status === "Em andamento") - Number(a.status === "Em andamento") ||
    Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt) ||
    a.id.localeCompare(b.id))[0];
  const machine = machines.find((item) => item.id === operation.machineId)!;
  return {
    operator: { id: operator.id, name: operator.name, clientId: operator.clientId! },
    clients: clients.filter((item) => item.id === operation.clientId),
    areas: areas.filter((item) => item.id === operation.areaId),
    machines: [machine],
    operations: [operation],
    alerts: alerts.filter((item) => item.operationId === operation.id && item.machineId === machine.id),
    history: history.filter((item) => item.machineId === machine.id),
    operationCount: operatorOperations.length,
  };
}

function buildSnapshot(
  relational: Awaited<ReturnType<typeof getOperatorRelationalScope>>,
  source: "postgres" | "mock",
  degraded: boolean,
  engineWeights: RiskEngineV2Weights,
): OperadorDashboardSnapshot {
  const operation = relational.operations[0];
  const machine = relational.machines[0];
  const area = relational.areas[0];
  const client = relational.clients[0];
  if (!operation || !machine || !area || !client) throw new Error("Contexto relacional do Operador incompleto.");
  const areaConditionSource = area.condition.trim() ? "postgres" as const : "synthetic" as const;
  const presentedArea = areaConditionSource === "postgres"
    ? area
    : { ...area, condition: "Condição estável (demonstração)" };
  const result = evaluateOperation(operation, client, engineWeights);
  const risk = toPresentationRisk(result);
  const recommendation = centralRecommendation(operation, result);
  const telemetry = syntheticInclination(operation.id);
  const hour = Number(operation.start.slice(0, 2));
  const scopedAlerts: Alert[] = relational.alerts.length
    ? relational.alerts
    : result.level === "baixo"
      ? []
      : [{
          id: `${operation.id}-demo-alert`,
          machineId: machine.id,
          machine: machine.id,
          operationId: operation.id,
          type: `Atenção: ${recommendation.factor}`,
          criticality: result.level === "alto" ? "alta" : "média",
          level: result.level,
          message: `Alerta demonstrativo coerente com o fator principal ${recommendation.factor.toLowerCase()}.`,
          mainFactor: recommendation.factor,
          status: "aberto",
          datetime: operation.scheduledAt,
          time: "demonstração",
        }];
  return {
    source,
    degraded,
    loadedAt: new Date().toISOString(),
    scopeRule: OPERATOR_SCOPE_RULE,
    operationCount: relational.operationCount,
    operator: relational.operator,
    operation,
    machine,
    area: presentedArea,
    client,
    shift: { value: hour < 12 ? "Matutino" : hour < 18 ? "Vespertino" : "Noturno", source: "synthetic" },
    fieldSources: { areaCondition: areaConditionSource },
    geo: syntheticCoordinates(client),
    telemetry,
    weights: { climate: engineWeights.ml, operational: engineWeights.operationalRules },
    risk,
    engineResult: {
      ...result,
      ml: { ...result.ml, sampleProbabilityInternal: undefined },
    },
    mainFactor: recommendation.factor,
    recommendation,
    nextAction: {
      title: recommendation.title,
      description: recommendation.description,
      factor: recommendation.factor,
      priority: recommendation.priority,
      category: recommendation.category,
    },
    telemetryRecommendations: telemetryRecommendations(operation, telemetry),
    alerts: scopedAlerts,
    alertsSource:
      source === "postgres"
        ? relational.alerts.length > 0 || scopedAlerts.length === 0
          ? "postgres"
          : "demo"
        : "demo",
    history: relational.history.map((entry: HistoryEntry) => ({ ...entry, score: 0 })),
  };
}

async function loadUncached(
  primary: AgroRiskRepository,
  fallback: AgroRiskRepository,
  weights: RiskEngineV2Weights,
) {
  try {
    const relational = primary === postgresRepository
      ? await getOperatorRelationalScope(DEMO_OPERATOR_ID)
      : await readFallback(primary);
    return buildSnapshot(relational, "postgres", false, weights);
  } catch (error) {
    console.error("[operador-dashboard] PostgreSQL indisponível; usando fallback mock.", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    const relational = await readFallback(fallback);
    return buildSnapshot(relational, "mock", true, weights);
  }
}

export async function loadOperadorDashboardSnapshot(
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<OperadorDashboardSnapshot> {
  const config = getRiskEngineV2Configuration();
  const weights = { ml: config.mlWeight, operationalRules: config.operationalRulesWeight };
  if (primary !== postgresRepository || fallback !== mockRepository) return loadUncached(primary, fallback, weights);
  const key = `operador-dashboard:v1:${DEMO_OPERATOR_ID}:${weights.ml}:${weights.operationalRules}`;
  const cached = cacheGet<OperadorDashboardSnapshot>(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = loadUncached(primary, fallback, weights).then((snapshot) => {
    cacheSet(key, snapshot, 15);
    return snapshot;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}