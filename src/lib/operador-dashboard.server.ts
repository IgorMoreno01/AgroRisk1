import { cacheGet, cacheSet } from "./cache.server";
import { getOperatorRelationalScope, postgresRepository } from "./data/postgres-repository.server";
import { mockRepository } from "./data/mock-repository.server";
import type { AgroRiskRepository } from "./data/repository";
import { users, type Client, type Operation } from "./mock-data";
import type {
  OperadorDashboardPhaseASnapshot,
  OperadorDashboardSnapshot,
  OperatorAlert,
  OperatorHistoryEntry,
} from "./operador-dashboard-types";
import type { GeneratedRecommendation } from "./recommendations";
import { getRiskEngineV2Configuration } from "./risk-config.server";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./risk-engine-v2/types";
import {
  buildFallbackOperationRiskContext,
  evaluateOperationRiskV2,
  type OperationRiskRelationalContext,
} from "./risk-engine-v2/operation-input.server";
import type { RiskResult } from "./risk-score";

const operatorScopeRule = (operatorId: string) =>
  `Operador autenticado ${operatorId}; somente sua operação atual, máquina, área, cliente, alertas e histórico relacionados.`;

const inFlight = new Map<string, Promise<OperadorDashboardSnapshot>>();

const stableNumber = (value: string) =>
  [...value].reduce((total, character) => total + character.charCodeAt(0), 0);

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

function syntheticBaseTime(operation: Operation) {
  const parsed = Date.parse(operation.scheduledAt);
  return Number.isFinite(parsed)
    ? parsed
    : Date.UTC(2026, 0, 1, 12) + stableNumber(operation.id) * 60_000;
}

function syntheticAlerts(
  operation: Operation,
  machineId: string,
  mainFactor: string,
): OperatorAlert[] {
  const baseTime = syntheticBaseTime(operation);
  const at = (minutesBefore: number) => new Date(baseTime - minutesBefore * 60_000).toISOString();
  return [
    {
      id: `${operation.operatorId}-${machineId}-demo-alert-climate`,
      machineId,
      machine: machineId,
      operationId: operation.id,
      type: "Aviso climático demonstrativo",
      criticality: "baixa",
      level: "baixo",
      message: `Monitoramento preventivo de ${mainFactor.toLowerCase()} para a operação atual (demonstração).`,
      mainFactor,
      status: "resolvido",
      datetime: at(75),
      time: "há 1h15 · demo",
      source: "demo",
    },
    {
      id: `${operation.operatorId}-${machineId}-demo-alert-operational`,
      machineId,
      machine: machineId,
      operationId: operation.id,
      type: "Atenção operacional demonstrativa",
      criticality: "média",
      level: "medio",
      message: "Verificação operacional recomendada antes de avançar para o próximo trecho (demonstração).",
      mainFactor: "Operacional",
      status: "em análise",
      datetime: at(35),
      time: "há 35 min · demo",
      source: "demo",
    },
    {
      id: `${operation.operatorId}-${machineId}-demo-alert-preventive`,
      machineId,
      machine: machineId,
      operationId: operation.id,
      type: "Aviso preventivo demonstrativo",
      criticality: "baixa",
      level: "baixo",
      message: "Conferência preventiva da máquina registrada somente para contexto visual (demonstração).",
      mainFactor: "Prevenção",
      status: "aberto",
      datetime: at(15),
      time: "há 15 min · demo",
      source: "demo",
    },
  ];
}

function syntheticHistory(operation: Operation, machineId: string): OperatorHistoryEntry[] {
  const baseTime = syntheticBaseTime(operation);
  const at = (hoursBefore: number) => new Date(baseTime - hoursBefore * 3_600_000).toISOString();
  return [
    {
      id: `${operation.operatorId}-${machineId}-demo-history-inspection`,
      date: at(8),
      machineId,
      operationId: operation.id,
      summary: "Inspeção pré-operacional concluída (demonstração).",
      score: 0,
      status: "inspecionada",
      source: "demo",
    },
    {
      id: `${operation.operatorId}-${machineId}-demo-history-preventive`,
      date: at(6),
      machineId,
      operationId: operation.id,
      summary: "Ocorrência preventiva registrada sem impacto no score (demonstração).",
      score: 0,
      status: "preventiva",
      source: "demo",
    },
    {
      id: `${operation.operatorId}-${machineId}-demo-history-interruption`,
      date: at(4),
      machineId,
      operationId: operation.id,
      summary: "Pausa operacional temporária para verificação da máquina (demonstração).",
      score: 0,
      status: "interrompida",
      source: "demo",
    },
    {
      id: `${operation.operatorId}-${machineId}-demo-history-resolved`,
      date: at(2),
      machineId,
      operationId: operation.id,
      summary: "Alerta preventivo anterior resolvido (demonstração).",
      score: 0,
      status: "resolvida",
      source: "demo",
    },
  ];
}

async function readFallback(repository: AgroRiskRepository, operatorId: string) {
  const [clients, areas, machines, operations, alerts, history] = await Promise.all([
    repository.listClients(),
    repository.listAreas(),
    repository.listMachines(),
    repository.listOperations(),
    repository.listAlerts(),
    repository.listOperationHistory(),
  ]);
  const operator = users.find((item) =>
    item.id === operatorId &&
    item.profile === "operador" &&
    operations.some((operation) => operation.operatorId === item.id)
  );
  if (!operator) throw new Error(`Fallback sem dados para o operador autenticado ${operatorId}.`);
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
    history: history.filter((item) =>
      item.machineId === machine.id && item.operationId === operation.id
    ),
    operationCount: operatorOperations.length,
  };
}

type OperadorRelationalData = Omit<Awaited<ReturnType<typeof getOperatorRelationalScope>>, "riskContexts"> & {
  riskContexts?: OperationRiskRelationalContext[];
};

/**
 * Phase A has a strict relational boundary: it prepares the usable operator
 * screen without invoking Risk Engine V2 or any external provider.
 */
export async function buildOperadorDashboardPhaseA(
  relational: OperadorRelationalData,
  source: "postgres" | "mock",
  degraded: boolean,
  engineWeights: RiskEngineV2Weights,
  operatorId: string,
): Promise<OperadorDashboardPhaseASnapshot> {
  const operation = relational.operations[0];
  const machine = relational.machines[0];
  const area = relational.areas[0];
  const client = relational.clients[0];
  if (!operation || !machine || !area || !client) throw new Error("Contexto relacional do Operador incompleto.");
  const areaConditionSource = area.condition.trim() ? "postgres" as const : "synthetic" as const;
  const presentedArea = areaConditionSource === "postgres"
    ? area
    : { ...area, condition: "Condição estável (demonstração)" };
  const telemetry = syntheticInclination(operation.id);
  const hour = Number(operation.start.slice(0, 2));
  const recordsSource = source === "postgres" ? "postgres" as const : "demo" as const;
  const scopedAlerts: OperatorAlert[] = relational.alerts.length
    ? relational.alerts.map((alert) => ({ ...alert, source: recordsSource }))
    : syntheticAlerts(operation, machine.id, "Prevenção");
  const scopedHistory: OperatorHistoryEntry[] = relational.history.length
    ? relational.history.map((entry) => ({
        ...entry,
        score: 0,
        status: "concluída" as const,
        source: recordsSource,
      }))
    : syntheticHistory(operation, machine.id);
  return {
    source,
    degraded,
    loadedAt: new Date().toISOString(),
    scopeRule: operatorScopeRule(operatorId),
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
    alerts: scopedAlerts,
    alertsSource: source === "postgres" && relational.alerts.length ? "postgres" : "demo",
    history: scopedHistory,
    historySource: source === "postgres" && relational.history.length ? "postgres" : "demo",
  };
}

async function buildSnapshot(
  relational: OperadorRelationalData,
  source: "postgres" | "mock",
  degraded: boolean,
  engineWeights: RiskEngineV2Weights,
  operatorId: string,
): Promise<OperadorDashboardSnapshot> {
  const phaseA = await buildOperadorDashboardPhaseA(
    relational, source, degraded, engineWeights, operatorId,
  );
  const { operation, machine, area, client } = phaseA;
  const context = relational.riskContexts?.find((item) => item.operation.id === operation.id)
    ?? buildFallbackOperationRiskContext(operation, machine, area, client);
  return buildSnapshotFromPhaseA(phaseA, context, engineWeights);
}

async function buildSnapshotFromPhaseA(
  phaseA: OperadorDashboardPhaseASnapshot,
  context: OperationRiskRelationalContext,
  engineWeights: RiskEngineV2Weights,
): Promise<OperadorDashboardSnapshot> {
  const { operation } = phaseA;
  const evaluation = await evaluateOperationRiskV2(
    context,
    engineWeights,
  );
  const result = evaluation.result;
  const risk = toPresentationRisk(result);
  const recommendation = centralRecommendation(operation, result);
  return {
    ...phaseA,
    risk,
    engineResult: {
      ...result,
      ml: { ...result.ml, sampleProbabilityInternal: undefined },
    },
    evaluationContext: evaluation,
    mainFactor: recommendation.factor,
    recommendation,
    nextAction: {
      title: recommendation.title,
      description: recommendation.description,
      factor: recommendation.factor,
      priority: recommendation.priority,
      category: recommendation.category,
    },
    telemetryRecommendations: telemetryRecommendations(operation, phaseA.telemetry),
  };
}

async function loadUncached(
  primary: AgroRiskRepository,
  fallback: AgroRiskRepository,
  weights: RiskEngineV2Weights,
  operatorId: string,
) {
  try {
    const relational = primary === postgresRepository
      ? await getOperatorRelationalScope(operatorId)
      : await readFallback(primary, operatorId);
    return await buildSnapshot(relational, "postgres", false, weights, operatorId);
  } catch (error) {
    console.error("[operador-dashboard] PostgreSQL indisponível; usando fallback mock.", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    const relational = await readFallback(fallback, operatorId);
    return await buildSnapshot(relational, "mock", true, weights, operatorId);
  }
}

export async function loadOperadorDashboardPhaseA(
  operatorId: string,
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<OperadorDashboardPhaseASnapshot> {
  const config = getRiskEngineV2Configuration();
  const weights = { ml: config.mlWeight, operationalRules: config.operationalRulesWeight };
  try {
    const relational = primary === postgresRepository
      ? await getOperatorRelationalScope(operatorId, false)
      : await readFallback(primary, operatorId);
    return await buildOperadorDashboardPhaseA(relational, "postgres", false, weights, operatorId);
  } catch (error) {
    console.error("[operador-dashboard] PostgreSQL indisponível; usando fallback mock.", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    return await buildOperadorDashboardPhaseA(
      await readFallback(fallback, operatorId), "mock", true, weights, operatorId,
    );
  }
}

/** Evaluates exactly the current authenticated operation with interactive V2 priority. */
export async function evaluateOperadorDashboardRisk(
  operatorId: string,
  operationId: string,
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<OperadorDashboardSnapshot> {
  const config = getRiskEngineV2Configuration();
  const weights = { ml: config.mlWeight, operationalRules: config.operationalRulesWeight };
  let relational: OperadorRelationalData;
  let source: "postgres" | "mock" = "postgres";
  let degraded = false;
  try {
    relational = primary === postgresRepository
      ? await getOperatorRelationalScope(operatorId)
      : await readFallback(primary, operatorId);
  } catch {
    relational = await readFallback(fallback, operatorId);
    source = "mock";
    degraded = true;
  }
  const currentOperation = relational.operations[0];
  if (!currentOperation || currentOperation.id !== operationId) {
    throw new Error("A operação atual mudou; atualize o painel antes de calcular o risco.");
  }
  const phaseA = await buildOperadorDashboardPhaseA(relational, source, degraded, weights, operatorId);
  const context = relational.riskContexts?.find((item) => item.operation.id === operationId)
    ?? buildFallbackOperationRiskContext(
      currentOperation,
      relational.machines[0]!,
      relational.areas[0]!,
      relational.clients[0]!,
    );
  const evaluated = await buildSnapshotFromPhaseA(phaseA, context, weights);
  if (evaluated.operation.id !== operationId) {
    throw new Error("A operação avaliada não corresponde ao snapshot da Fase A.");
  }
  return evaluated;
}

export async function loadOperadorDashboardSnapshot(
  operatorId: string,
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<OperadorDashboardSnapshot> {
  const config = getRiskEngineV2Configuration();
  const weights = { ml: config.mlWeight, operationalRules: config.operationalRulesWeight };
  if (primary !== postgresRepository || fallback !== mockRepository) {
    return loadUncached(primary, fallback, weights, operatorId);
  }
  const key = `operador-dashboard:v3:${operatorId}:${weights.ml}:${weights.operationalRules}`;
  const cached = cacheGet<OperadorDashboardSnapshot>(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = loadUncached(primary, fallback, weights, operatorId).then((snapshot) => {
    cacheSet(key, snapshot, 15);
    return snapshot;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}