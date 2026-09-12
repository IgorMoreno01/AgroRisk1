import type { Alert, Client, Operation, RiskLevel } from "./mock-data";
import type {
  AdminAreaRow,
  AdminMachineRow,
  AdminOperationRow,
  AdminOperationTypeRow,
  AdminRiskDistribution,
} from "./admin-dashboard-types";
import type { GeneratedRecommendation } from "./recommendations";

export interface GestorOperationalOverview {
  maintenance: {
    overdueCount: number;
    dueSoonCount: number;
    top: Array<{
      id: string;
      clientId: string;
      machineId: string;
      machineType: string;
      client: string;
      nextDueAt: string;
      status: "due_soon" | "overdue";
      source: "real" | "demo" | "synthetic";
    }>;
  };
  activity: Array<{
    id: string;
    clientId: string;
    operator: string;
    operationId: string;
    machineId: string;
    machineType: string;
    startedAt: string | null;
    finishedAt: string | null;
    status: string;
    observation: string;
  }>;
}

export interface GestorMachineRow extends AdminMachineRow {
  recommendation: GeneratedRecommendation;
}

export interface GestorDashboardSnapshot {
  source: "postgres" | "mock";
  degraded: boolean;
  loadedAt: string;
  scopeRule: string;
  weights: { ml: number; operationalRules: number };
  clients: Client[];
  /** Relational Phase A data is available before any risk evaluation. */
  areas: import("./mock-data").Area[];
  machines: import("./mock-data").Machine[];
  operations: import("./mock-data").Operation[];
  machineRows: GestorMachineRow[];
  areaRows: AdminAreaRow[];
  operationRows: AdminOperationRow[];
  operationTypeRows: AdminOperationTypeRow[];
  machineDistribution: AdminRiskDistribution;
  alerts: Alert[];
  alertsSource: "postgres" | "demo";
  criticalAlerts: number;
  averageScore: number;
  machinesAtRisk: number;
  operationalOverview: GestorOperationalOverview;
  primaryOperation?: import("./mock-data").Operation;
  alertCountsByMachine?: Record<string, number>;
  /** False while only a visible/selected batch has been evaluated. */
  riskCoverageComplete?: boolean;
  evaluatedOperationIds?: string[];
  relationalCounts?: {
    clients: number;
    areas: number;
    machines: number;
    operations: number;
    alerts: number;
  };
}

export interface GestorFilters {
  clientId: string;
  level: RiskLevel | "all";
  operationType: Operation["type"] | "all";
  areaId: string;
}