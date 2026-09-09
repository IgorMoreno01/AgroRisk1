// ============================================================
// Sompo AgroRisk · Lógica de cálculo de score (Parte 3)
// Score 0–100, composição transparente, derivado dos mocks da Parte 2.
// ============================================================

import {
  operations, machines, clients, areas, alerts, riskFactors,
  type Operation, type OperationType, type RiskLevel,
  riskFromScore,
} from "./mock-data";

// ---------- Tipos de entrada ----------
export type Weather = "normal" | "leve" | "moderada" | "forte";
export type WaterDistance = "acima_150" | "100_150" | "50_100" | "abaixo_50";
export type Terrain = "normal" | "umido" | "critico" | "baixa_aderencia";

export interface RiskInputs {
  weather: Weather;
  waterDistance: WaterDistance;
  operationType: OperationType;
  historyAlertCount: number;
  inclinationDegrees: number;
  terrain: Terrain;
}

// ---------- Regras de pontos ----------
// Os máximos vêm dos pesos mockados da Sompo. A inclinação permanece como
// sinal de segurança operacional, mas não participa desta pontuação.
const factorWeight = (category: string) =>
  riskFactors.find((factor) => factor.category === category)?.weight ?? 0;

const WEATHER_MAX = factorWeight("Clima");
const WATER_MAX = factorWeight("Proximidade de água");
const OPERATION_MAX = factorWeight("Tipo de operação");
const HISTORY_MAX = factorWeight("Histórico operacional");
const TERRAIN_MAX = factorWeight("Condição do terreno");

const WEATHER_PTS: Record<Weather, number> = {
  normal: Math.round(WEATHER_MAX * 0.15),
  leve: Math.round(WEATHER_MAX * 0.4),
  moderada: Math.round(WEATHER_MAX * 0.7),
  forte: WEATHER_MAX,
};
const WATER_PTS: Record<WaterDistance, number>  = {
  acima_150: 0,
  "100_150": Math.round(WATER_MAX * 0.33),
  "50_100": Math.round(WATER_MAX * 0.67),
  abaixo_50: WATER_MAX,
};
const OPTYPE_PTS: Record<OperationType, number> = {
  "Trabalho no campo": Math.round(OPERATION_MAX * 0.4),
  "Transporte": Math.round(OPERATION_MAX * 0.6),
  "Pulverização": Math.round(OPERATION_MAX * 0.53),
  "Colheita": Math.round(OPERATION_MAX * 0.53),
  "Deslocamento interno": Math.round(OPERATION_MAX * 0.27),
  "Operação próxima de água": OPERATION_MAX,
};
const TERRAIN_PTS: Record<Terrain, number> = {
  normal: 0,
  umido: Math.round(TERRAIN_MAX * 0.47),
  critico: Math.round(TERRAIN_MAX * 0.87),
  baixa_aderencia: TERRAIN_MAX,
};

const historyPts = (n: number) =>
  n <= 0 ? 0 : n === 1 ? Math.round(HISTORY_MAX / 3) : n === 2 ? Math.round(HISTORY_MAX * 0.67) : HISTORY_MAX;

// ---------- Rótulos legíveis ----------
const weatherLabel: Record<Weather, string> = {
  normal: "Sem chuva", leve: "Chuva leve", moderada: "Chuva moderada", forte: "Chuva forte",
};
const waterLabel: Record<WaterDistance, string> = {
  acima_150: "Acima de 150 m", "100_150": "Entre 100 e 150 m",
  "50_100": "Entre 50 e 100 m", abaixo_50: "Abaixo de 50 m",
};
export const inclinationLabel = (degrees: number) => {
  const absoluteDegrees = Math.abs(degrees);
  const classification = absoluteDegrees < 5
    ? "estável"
    : absoluteDegrees < 15
    ? "atenção"
    : "crítica";
  return `${absoluteDegrees.toFixed(1)}° (${classification})`;
};
const terrainLabel: Record<Terrain, string> = {
  normal: "Terreno normal", umido: "Solo úmido", critico: "Solo crítico", baixa_aderencia: "Baixa aderência",
};

// ---------- Composição ----------
export interface ScorePart {
  category: string;
  label: string;
  detail: string;
  points: number;
  max: number;
}

export interface ScoreBreakdown {
  total: number;
  level: RiskLevel;
  parts: ScorePart[];
  mainFactor: string;
}

export interface RiskWeights {
  climate: number;
  operational: number;
}

export interface RiskResult {
  climateScore: number;
  operationalScore: number;
  climateContribution: number;
  operationalContribution: number;
  finalScore: number;
  level: RiskLevel;
  dominantFactor: "climate" | "operational" | "balanced";
  breakdown: ScoreBreakdown;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  climate: 50,
  operational: 50,
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const roundOneDecimal = (n: number) => Math.round(n * 10) / 10;

export function isValidRiskWeights(value: RiskWeights): boolean {
  return Number.isFinite(value.climate) &&
    Number.isFinite(value.operational) &&
    Number.isInteger(value.climate) &&
    Number.isInteger(value.operational) &&
    value.climate >= 0 &&
    value.climate <= 100 &&
    value.operational >= 0 &&
    value.operational <= 100 &&
    value.climate + value.operational === 100;
}

export function normalizeRiskWeights(value?: Partial<RiskWeights>): RiskWeights {
  const candidate: RiskWeights = {
    climate: value?.climate ?? DEFAULT_RISK_WEIGHTS.climate,
    operational: value?.operational ?? DEFAULT_RISK_WEIGHTS.operational,
  };
  return isValidRiskWeights(candidate) ? candidate : { ...DEFAULT_RISK_WEIGHTS };
}

export function calculateScore(inputs: RiskInputs): ScoreBreakdown {
  const parts: ScorePart[] = [
    { category: "Clima",                 label: "Clima",                 detail: weatherLabel[inputs.weather],     points: WEATHER_PTS[inputs.weather], max: WEATHER_MAX },
    { category: "Proximidade de água",   label: "Proximidade de água",   detail: waterLabel[inputs.waterDistance], points: WATER_PTS[inputs.waterDistance], max: WATER_MAX },
    { category: "Tipo de operação",      label: "Tipo de operação",      detail: inputs.operationType,             points: OPTYPE_PTS[inputs.operationType], max: OPERATION_MAX },
    { category: "Histórico operacional", label: "Histórico operacional", detail: `${inputs.historyAlertCount} alerta(s) anterior(es)`, points: historyPts(inputs.historyAlertCount), max: HISTORY_MAX },
    { category: "Condição do terreno",   label: "Condição do terreno",   detail: terrainLabel[inputs.terrain],     points: TERRAIN_PTS[inputs.terrain], max: TERRAIN_MAX },
  ];
  const total = clamp(parts.reduce((s, p) => s + p.points, 0));
  const main  = [...parts].sort((a, b) => b.points - a.points)[0];
  return { total, level: riskFromScore(total), parts, mainFactor: main.category };
}

/**
 * Combina os componentes já calculados, sem alterar os dados ou retreinar
 * qualquer modelo. O clima usa seu máximo próprio; os demais fatores formam
 * o componente operacional e também são normalizados para a escala 0–100.
 */
export function calculateWeightedRisk(
  breakdown: ScoreBreakdown,
  inputWeights?: Partial<RiskWeights>,
): RiskResult {
  const weights = normalizeRiskWeights(inputWeights);
  const climatePart = breakdown.parts.find((part) => part.category === "Clima");
  const operationalParts = breakdown.parts.filter((part) => part.category !== "Clima");
  const operationalMax = operationalParts.reduce((sum, part) => sum + part.max, 0);
  const operationalPoints = operationalParts.reduce((sum, part) => sum + part.points, 0);
  const climateScore = climatePart
    ? Math.round(clamp((climatePart.points / Math.max(1, climatePart.max)) * 100))
    : 0;
  const factorOperationalScore = Math.round(
    clamp((operationalPoints / Math.max(1, operationalMax)) * 100),
  );
  const operationalScore = factorOperationalScore;
  const climateContribution = roundOneDecimal(climateScore * (weights.climate / 100));
  const operationalContribution = roundOneDecimal(operationalScore * (weights.operational / 100));
  const finalScore = Math.round(clamp(climateContribution + operationalContribution));
  const dominantFactor = climateContribution === operationalContribution
    ? "balanced"
    : climateContribution > operationalContribution
    ? "climate"
    : "operational";

  return {
    climateScore,
    operationalScore,
    climateContribution,
    operationalContribution,
    finalScore,
    level: riskFromScore(finalScore),
    dominantFactor,
    breakdown,
  };
}

export const dominantFactorLabel = (factor: RiskResult["dominantFactor"]) =>
  factor === "climate"
    ? "Risco climático"
    : factor === "operational"
    ? "Risco operacional"
    : "Risco balanceado";

// ---------- Derivação determinística dos inputs a partir do mock ----------
const has = (op: Operation, factorId: string) => op.factors.includes(factorId);

function deriveWeather(op: Operation): Weather {
  // Se a operação possui o fator de clima adverso, considera chuva moderada.
  if (has(op, "RF-01")) return op.score >= 80 ? "forte" : "moderada";
  if (op.type === "Pulverização") return "leve";
  return "normal";
}

function deriveWaterDistance(op: Operation): WaterDistance {
  if (op.type === "Operação próxima de água" || has(op, "RF-02")) return "abaixo_50";
  const area = areas.find((a) => a.id === op.areaId);
  if (!area) return "acima_150";
  if (area.nearWater === "alta")  return "abaixo_50";
  if (area.nearWater === "média") return "50_100";
  return "acima_150";
}

function deriveTerrain(op: Operation): Terrain {
  const area = areas.find((a) => a.id === op.areaId);
  const c = area?.condition.toLowerCase() ?? "";
  if (c.includes("encharc"))  return "critico";
  if (c.includes("úmido") || c.includes("umido")) return "umido";
  if (c.includes("arenoso") || c.includes("aderência")) return "baixa_aderencia";
  return "normal";
}

function deriveInclinationDegrees(op: Operation): number {
  // Fallback determinístico até o ESP32 + MPU6050 enviar a leitura real.
  if (has(op, "RF-05")) return 18;
  const terrain = deriveTerrain(op);
  if (terrain === "critico" || terrain === "baixa_aderencia") return 10;
  return 2;
}

function deriveHistoryCount(op: Operation): number {
  // Conta alertas anteriores resolvidos da mesma máquina (histórico).
  return alerts.filter((a) => a.machineId === op.machineId && a.status === "resolvido").length;
}

export function inputsForOperation(op: Operation): RiskInputs {
  return {
    weather: deriveWeather(op),
    waterDistance: deriveWaterDistance(op),
    operationType: op.type,
    historyAlertCount: deriveHistoryCount(op),
    inclinationDegrees: deriveInclinationDegrees(op),
    terrain: deriveTerrain(op),
  };
}

// ---------- Funções de score por entidade ----------
export const scoreOperation = (op: Operation): ScoreBreakdown =>
  calculateScore(inputsForOperation(op));

export function riskResultForOperation(
  op: Operation,
  weights?: Partial<RiskWeights>,
  overrides?: Partial<RiskInputs>,
): RiskResult {
  const inputs = inputsForOperationWithOverrides(op, overrides);
  return calculateWeightedRisk(calculateScore(inputs), weights);
}

export function currentOperationFor(machineId: string): Operation | undefined {
  const owned = operations.filter((o) => o.machineId === machineId);
  return owned.find((o) => o.status === "Em andamento") ?? owned[owned.length - 1];
}

export function scoreMachine(machineId: string): ScoreBreakdown {
  const op = currentOperationFor(machineId);
  if (!op) {
    return { total: 0, level: "baixo", parts: [], mainFactor: "—" };
  }
  return scoreOperation(op);
}

export function riskResultForMachine(
  machineId: string,
  weights?: Partial<RiskWeights>,
): RiskResult {
  const op = currentOperationFor(machineId);
  const breakdown = op
    ? scoreOperation(op)
    : { total: 0, level: "baixo" as const, parts: [], mainFactor: "—" };
  return op
    ? riskResultForOperation(op, weights)
    : calculateWeightedRisk(breakdown, weights);
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : 0);
const avgOneDecimal = (xs: number[]) =>
  xs.length ? Math.round((xs.reduce((sum, value) => sum + value, 0) / xs.length) * 10) / 10 : 0;

function aggregateRiskResults(
  results: RiskResult[],
  summary: { score: number; level: RiskLevel; topFactor: string },
): RiskResult | undefined {
  if (results.length === 0) return undefined;
  const parts = results[0].breakdown.parts.map((part) => ({
    ...part,
    points: Math.round(avgOneDecimal(results.map((result) =>
      result.breakdown.parts.find((candidate) => candidate.category === part.category)?.points ?? 0
    ))),
    detail: "Média consolidada",
  }));
  const dominantFactor = summary.topFactor === "Risco climático"
    ? "climate"
    : summary.topFactor === "Risco operacional"
    ? "operational"
    : "balanced";
  return {
    climateScore: Math.round(avgOneDecimal(results.map((result) => result.climateScore))),
    operationalScore: Math.round(avgOneDecimal(results.map((result) => result.operationalScore))),
    climateContribution: avgOneDecimal(results.map((result) => result.climateContribution)),
    operationalContribution: avgOneDecimal(results.map((result) => result.operationalContribution)),
    finalScore: summary.score,
    level: summary.level,
    dominantFactor,
    breakdown: {
      total: Math.round(avgOneDecimal(results.map((result) => result.breakdown.total))),
      level: summary.level,
      parts,
      mainFactor: [...parts].sort((a, b) => b.points - a.points)[0]?.category ?? "—",
    },
  };
}

export interface ClientScore {
  clientId: string; name: string; score: number; level: RiskLevel;
  machinesHigh: number; topAreaName: string; topFactor: string;
}

export function scoreClient(clientId: string): ClientScore {
  const client = clients.find((c) => c.id === clientId)!;
  const ms = machines.filter((m) => m.clientId === clientId);
  const breakdowns = ms.map((m) => scoreMachine(m.id));
  const total = avg(breakdowns.map((b) => b.total));
  const machinesHigh = breakdowns.filter((b) => b.level === "alto").length;

  // Fator mais recorrente entre as máquinas do cliente
  const tally: Record<string, number> = {};
  breakdowns.forEach((b) => { if (b.mainFactor) tally[b.mainFactor] = (tally[b.mainFactor] ?? 0) + 1; });
  const topFactor = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Área mais crítica do cliente
  const clientAreas = areas.filter((a) => a.clientId === clientId);
  const areaScored = clientAreas.map((a) => ({ a, s: scoreArea(a.id).score }))
    .sort((x, y) => y.s - x.s);
  const topAreaName = areaScored[0]?.a.name ?? "—";

  return { clientId, name: client.name, score: total, level: riskFromScore(total), machinesHigh, topAreaName, topFactor };
}

export function scoreClientWithWeights(
  clientId: string,
  weights?: Partial<RiskWeights>,
): ClientScore {
  const client = clients.find((c) => c.id === clientId)!;
  const ms = machines.filter((m) => m.clientId === clientId);
  const results = ms.map((m) => riskResultForMachine(m.id, weights));
  const total = avg(results.map((result) => result.finalScore));
  const machinesHigh = results.filter((result) => result.level === "alto").length;
  const dominantTally: Record<string, number> = {};
  results.forEach((result) => {
    const label = dominantFactorLabel(result.dominantFactor);
    dominantTally[label] = (dominantTally[label] ?? 0) + 1;
  });
  const topFactor = Object.entries(dominantTally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const clientAreas = areas.filter((area) => area.clientId === clientId);
  const areaScored = clientAreas
    .map((area) => ({ area, score: scoreAreaWithWeights(area.id, weights).score }))
    .sort((a, b) => b.score - a.score);

  return {
    clientId,
    name: client.name,
    score: total,
    level: riskFromScore(total),
    machinesHigh,
    topAreaName: areaScored[0]?.area.name ?? "—",
    topFactor,
  };
}

export function riskResultForClient(
  clientId: string,
  weights?: Partial<RiskWeights>,
): RiskResult | undefined {
  const results = machines
    .filter((machine) => machine.clientId === clientId)
    .map((machine) => riskResultForMachine(machine.id, weights));
  return aggregateRiskResults(results, scoreClientWithWeights(clientId, weights));
}

export interface AreaScore {
  areaId: string; name: string; clientName: string; score: number; level: RiskLevel;
  condition: string; topFactor: string;
}

export function scoreArea(areaId: string): AreaScore {
  const area = areas.find((a) => a.id === areaId)!;
  const ops = operations.filter((o) => o.areaId === areaId);
  const breakdowns = ops.map(scoreOperation);
  const total = avg(breakdowns.map((b) => b.total));
  const tally: Record<string, number> = {};
  breakdowns.forEach((b) => { if (b.mainFactor) tally[b.mainFactor] = (tally[b.mainFactor] ?? 0) + 1; });
  const topFactor = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return {
    areaId, name: area.name, clientName: area.client, score: total,
    level: riskFromScore(total), condition: area.condition, topFactor,
  };
}

export function scoreAreaWithWeights(
  areaId: string,
  weights?: Partial<RiskWeights>,
): AreaScore {
  const area = areas.find((item) => item.id === areaId)!;
  const results = operations
    .filter((operation) => operation.areaId === areaId)
    .map((operation) => riskResultForOperation(operation, weights));
  const score = avg(results.map((result) => result.finalScore));
  const dominantTally: Record<string, number> = {};
  results.forEach((result) => {
    const label = dominantFactorLabel(result.dominantFactor);
    dominantTally[label] = (dominantTally[label] ?? 0) + 1;
  });
  const topFactor = Object.entries(dominantTally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return {
    areaId,
    name: area.name,
    clientName: area.client,
    score,
    level: riskFromScore(score),
    condition: area.condition,
    topFactor,
  };
}

export function riskResultForArea(
  areaId: string,
  weights?: Partial<RiskWeights>,
): RiskResult | undefined {
  const results = operations
    .filter((operation) => operation.areaId === areaId)
    .map((operation) => riskResultForOperation(operation, weights));
  return aggregateRiskResults(results, scoreAreaWithWeights(areaId, weights));
}

export interface OperationTypeStats {
  type: OperationType; score: number; level: RiskLevel; count: number;
}

export function scoreByOperationType(): OperationTypeStats[] {
  const types: OperationType[] = [
    "Trabalho no campo", "Transporte", "Operação próxima de água",
    "Deslocamento interno", "Pulverização", "Colheita",
  ];
  return types.map((t) => {
    const ops = operations.filter((o) => o.type === t);
    const scores = ops.map((o) => scoreOperation(o).total);
    const score = avg(scores);
    return { type: t, score, level: riskFromScore(score), count: ops.length };
  });
}

export function scoreByOperationTypeWithWeights(
  weights?: Partial<RiskWeights>,
): OperationTypeStats[] {
  const types: OperationType[] = [
    "Trabalho no campo", "Transporte", "Operação próxima de água",
    "Deslocamento interno", "Pulverização", "Colheita",
  ];
  return types.map((type) => {
    const results = operations
      .filter((operation) => operation.type === type)
      .map((operation) => riskResultForOperation(operation, weights));
    const score = avg(results.map((result) => result.finalScore));
    return { type, score, level: riskFromScore(score), count: results.length };
  });
}

// ---------- Helpers de apresentação ----------
export function machinePrincipalFactorLabel(machineId: string): string {
  return scoreMachine(machineId).mainFactor;
}

export const fleetAverageScore = (weights?: Partial<RiskWeights>) =>
  weights
    ? avg(machines.map((machine) => riskResultForMachine(machine.id, weights).finalScore))
    : avg(machines.map((machine) => scoreMachine(machine.id).total));

export const fleetMachinesAtRisk = (weights?: Partial<RiskWeights>) =>
  weights
    ? machines.filter((machine) => {
      const result = riskResultForMachine(machine.id, weights);
      return result.level !== "baixo" && result.finalScore >= 70;
    }).length
    : machines.filter((machine) => scoreMachine(machine.id).level !== "baixo" && scoreMachine(machine.id).total >= 70).length;

// Re-export para conveniência
export { riskFromScore };
export type { RiskLevel };
// Mapeia nome de fator → descrição do RiskFactor mock (se existir)
export const factorDescription = (category: string): string | undefined =>
  riskFactors.find((f) => f.category === category)?.description;

// ============================================================
// Conversores: dados reais → enums internos do score engine
// ============================================================

import type { WeatherData, WaterGeoData } from "./external-data.types";

/**
 * Converte dados climáticos reais (Open-Meteo) para o enum `Weather`
 * usado pelo score engine. Prioriza precipitação; usa código WMO como fallback.
 */
export function deriveWeatherFromReal(data: WeatherData): Weather {
  const precip = data.current.precipitation; // mm/h
  if (precip >= 8) return "forte";
  if (precip >= 2) return "moderada";
  if (precip > 0) return "leve";
  // Sem chuva agora — verifica previsão horária (próximas 3h)
  const next3h = data.hourlyForecast.slice(0, 3);
  const maxProb = Math.max(0, ...next3h.map((h) => h.precipitationProbability));
  if (maxProb >= 70) return "moderada";
  if (maxProb >= 40) return "leve";
  return "normal";
}

/**
 * Converte distância real até corpo d'água (metros) para o enum `WaterDistance`.
 */
export function deriveWaterDistanceFromReal(data: WaterGeoData): WaterDistance {
  const d = data.nearestDistanceM;
  if (d === null || d > 150) return "acima_150";
  if (d > 100) return "100_150";
  if (d > 50) return "50_100";
  return "abaixo_50";
}

/**
 * Deriva inputs para uma operação com possibilidade de override de dados reais.
 * Os campos fornecidos em `overrides` substituem a derivação do mock.
 */
export function inputsForOperationWithOverrides(
  op: Operation,
  overrides?: Partial<RiskInputs>,
): RiskInputs {
  return { ...inputsForOperation(op), ...overrides };
}
