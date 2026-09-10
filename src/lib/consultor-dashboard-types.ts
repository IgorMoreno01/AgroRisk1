import type { Alert, Client } from "./mock-data";
import type { AdminAreaRow, AdminClientRow, AdminMachineRow } from "./admin-dashboard-types";
import type { GeneratedRecommendation, NextBestAction } from "./recommendations";

export interface ConsultorComposition {
  mlScore: number;
  operationalRulesScore: number;
  mlContribution: number;
  operationalRulesContribution: number;
  dominantComponent: "ml" | "operational_rules" | "balanced";
}

export interface ConsultorClientView {
  client: Client;
  summary: AdminClientRow;
  machines: AdminMachineRow[];
  areas: AdminAreaRow[];
  recurringFactors: { factor: string; count: number }[];
  composition: ConsultorComposition;
  recommendation: GeneratedRecommendation;
  nextAction: NextBestAction;
  explanation: string;
  alerts: Alert[];
}

export interface ConsultorDashboardSnapshot {
  source: "postgres" | "mock";
  degraded: boolean;
  loadedAt: string;
  scopeRule: string;
  weights: { ml: number; operationalRules: number };
  alertsSource: "demo";
  clients: ConsultorClientView[];
}