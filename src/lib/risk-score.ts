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
export type Speed = "ok" | "leve" | "muito";
export type Terrain = "normal" | "umido" | "critico" | "baixa_aderencia";

export interface RiskInputs {
  weather: Weather;
  waterDistance: WaterDistance;
  operationType: OperationType;
  historyAlertCount: number;
  speed: Speed;
  terrain: Terrain;
}

// ---------- Regras de pontos (cada fator com seu máximo) ----------
const WEATHER_PTS: Record<Weather, number> = { normal: 3, leve: 8, moderada: 14, forte: 20 };
const WATER_PTS: Record<WaterDistance, number>  = { acima_150: 0, "100_150": 8, "50_100": 16, abaixo_50: 25 };
const OPTYPE_PTS: Record<OperationType, number> = {
  "Trabalho no campo": 8,
  "Transporte": 12,
  "Pulverização": 10,
  "Colheita": 10,
  "Deslocamento interno": 6,
  "Operação próxima de água": 20,
};
const SPEED_PTS: Record<Speed, number> = { ok: 0, leve: 5, muito: 10 };
const TERRAIN_PTS: Record<Terrain, number> = { normal: 0, umido: 4, critico: 8, baixa_aderencia: 10 };

const historyPts = (n: number) => (n <= 0 ? 0 : n === 1 ? 5 : n === 2 ? 10 : 15);

// ---------- Rótulos legíveis ----------
const weatherLabel: Record<Weather, string> = {
  normal: "Sem chuva", leve: "Chuva leve", moderada: "Chuva moderada", forte: "Chuva forte",
};
const waterLabel: Record<WaterDistance, string> = {
  acima_150: "Acima de 150 m", "100_150": "Entre 100 e 150 m",
  "50_100": "Entre 50 e 100 m", abaixo_50: "Abaixo de 50 m",
};
const speedLabel: Record<Speed, string> = {
  ok: "Dentro do recomendado", leve: "Levemente acima", muito: "Muito acima",
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

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function calculateScore(inputs: RiskInputs): ScoreBreakdown {
  const parts: ScorePart[] = [
    { category: "Clima",                 label: "Clima",                 detail: weatherLabel[inputs.weather],     points: WEATHER_PTS[inputs.weather], max: 20 },
    { category: "Proximidade de água",   label: "Proximidade de água",   detail: waterLabel[inputs.waterDistance], points: WATER_PTS[inputs.waterDistance], max: 25 },
    { category: "Tipo de operação",      label: "Tipo de operação",      detail: inputs.operationType,             points: OPTYPE_PTS[inputs.operationType], max: 20 },
    { category: "Histórico operacional", label: "Histórico operacional", detail: `${inputs.historyAlertCount} alerta(s) anterior(es)`, points: historyPts(inputs.historyAlertCount), max: 15 },
    { category: "Velocidade/rota",       label: "Velocidade / rota",     detail: speedLabel[inputs.speed],         points: SPEED_PTS[inputs.speed], max: 10 },
    { category: "Condição do terreno",   label: "Condição do terreno",   detail: terrainLabel[inputs.terrain],     points: TERRAIN_PTS[inputs.terrain], max: 10 },
  ];
  const total = clamp(parts.reduce((s, p) => s + p.points, 0));
  const main  = [...parts].sort((a, b) => b.points - a.points)[0];
  return { total, level: riskFromScore(total), parts, mainFactor: main.category };
}

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

function deriveSpeed(op: Operation): Speed {
  if (has(op, "RF-05")) return op.score >= 85 ? "muito" : "muito";
  return "ok";
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
    speed: deriveSpeed(op),
    terrain: deriveTerrain(op),
  };
}

// ---------- Funções de score por entidade ----------
export const scoreOperation = (op: Operation): ScoreBreakdown =>
  calculateScore(inputsForOperation(op));

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

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : 0);

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

// ---------- Helpers de apresentação ----------
export function machinePrincipalFactorLabel(machineId: string): string {
  return scoreMachine(machineId).mainFactor;
}

export const fleetAverageScore = () =>
  avg(machines.map((m) => scoreMachine(m.id).total));

export const fleetMachinesAtRisk = () =>
  machines.filter((m) => scoreMachine(m.id).level !== "baixo" && scoreMachine(m.id).total >= 70).length;

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
