import type { Alert, Area, Client, HistoryEntry, Machine, Operation } from "./mock-data";
import type { GeneratedRecommendation, NextBestAction } from "./recommendations";
import type { RiskResult, RiskWeights } from "./risk-score";
import type { RiskEngineV2Result } from "./risk-engine-v2/types";

export interface OperatorIdentity {
  id: string;
  name: string;
  clientId: string;
}

export interface OperatorTelemetry {
  inclinationDegrees: number;
  inclinationStatus: "estável" | "atenção" | "crítica";
  source: "synthetic";
}

export interface OperatorGeoContext {
  lat: number;
  lon: number;
  source: "synthetic";
}

export interface OperatorAlert extends Alert {
  source: "postgres" | "demo";
}

export interface OperatorHistoryEntry extends HistoryEntry {
  status: "concluída" | "interrompida" | "preventiva" | "inspecionada" | "resolvida";
  source: "postgres" | "demo";
}

export interface OperadorDashboardSnapshot {
  source: "postgres" | "mock";
  degraded: boolean;
  loadedAt: string;
  scopeRule: string;
  operationCount: number;
  operator: OperatorIdentity;
  operation: Operation;
  machine: Machine;
  area: Area;
  client: Client;
  shift: { value: string; source: "synthetic" };
  fieldSources: { areaCondition: "postgres" | "synthetic" };
  geo: OperatorGeoContext;
  telemetry: OperatorTelemetry;
  weights: RiskWeights;
  risk: RiskResult;
  engineResult: RiskEngineV2Result;
  mainFactor: string;
  recommendation: GeneratedRecommendation;
  nextAction: NextBestAction;
  telemetryRecommendations: GeneratedRecommendation[];
  alerts: OperatorAlert[];
  alertsSource: "postgres" | "demo";
  history: OperatorHistoryEntry[];
  historySource: "postgres" | "demo";
}