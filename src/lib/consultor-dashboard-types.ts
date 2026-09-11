import type { Alert, Client } from "./mock-data";
import type { AdminAreaRow, AdminClientRow, AdminMachineRow } from "./admin-dashboard-types";
import type { GeneratedRecommendation, NextBestAction } from "./recommendations";

export interface ConsultorComposition {
  climateScore: number;
  operationalScore: number;
  climateContribution: number;
  operationalContribution: number;
  dominantComponent: "climate" | "operational" | "balanced";
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

export interface ConsultorPreventiveOverview {
  maintenance: {
    overdueCount: number;
    dueSoonCount: number;
    top: Array<{
      id: string;
      clientId: string;
      client: string;
      machineId: string;
      machineType: string;
      nextDueAt: string;
      status: "due_soon" | "overdue";
      source: "real" | "demo" | "synthetic";
    }>;
  };
  attentionPoints: Array<{
    id: string;
    clientId: string;
    client: string;
    operator: string;
    machineId: string;
    machineType: string;
    occurredAt: string | null;
    status: string;
    observation: string | null;
  }>;
}

export interface ConsultorDashboardSnapshot {
  source: "postgres" | "mock";
  degraded: boolean;
  loadedAt: string;
  scopeRule: string;
  weights: { ml: number; operationalRules: number };
  alertsSource: "demo";
  clients: ConsultorClientView[];
  preventiveOverview: ConsultorPreventiveOverview;
}