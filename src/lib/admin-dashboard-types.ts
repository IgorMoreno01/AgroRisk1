import type {
  Area,
  Client,
  Machine,
  Operation,
  RiskLevel,
} from "./mock-data";

export interface AdminEntityRisk {
  score: number;
  level: RiskLevel;
  mainFactor: string;
}

export interface AdminMachineRow extends AdminEntityRisk {
  machine: Machine;
  operation?: Operation;
  alertsCount: number;
}

export interface AdminAreaRow extends AdminEntityRisk {
  area: Area;
  activeOperations: number;
  machineCount: number;
}

export interface AdminClientRow extends AdminEntityRisk {
  client: Client;
  machinesHigh: number;
  topAreaName: string;
}

export interface AdminOperationRow extends AdminEntityRisk {
  operation: Operation;
}

export interface AdminOperationTypeRow extends AdminEntityRisk {
  type: Operation["type"];
  count: number;
}

export interface AdminRiskDistribution {
  alto: number;
  medio: number;
  baixo: number;
  total: number;
}

export interface AdminOperationalOverview {
  maintenance: {
    overdueCount: number;
    dueSoonCount: number;
    top: Array<{
      id: string;
      machineId: string;
      machineType: string;
      client: string;
      lastPerformedAt: string | null;
      nextDueAt: string;
      status: "due_soon" | "overdue";
    }>;
  };
  activity: Array<{
    id: string;
    operator: string;
    client: string;
    operationId: string;
    machineId: string;
    machineType: string;
    startedAt: string | null;
    finishedAt: string | null;
    status: string;
    observation: string | null;
  }>;
}

export interface AdminDashboardSnapshot {
  source: "postgres" | "mock";
  degraded: boolean;
  loadedAt: string;
  weights: {
    ml: number;
    operationalRules: number;
  };
  clients: Client[];
  areas: Area[];
  machines: Machine[];
  operations: Operation[];
  machineRows: AdminMachineRow[];
  areaRows: AdminAreaRow[];
  clientRows: AdminClientRow[];
  operationRows: AdminOperationRow[];
  operationTypeRows: AdminOperationTypeRow[];
  machineDistribution: AdminRiskDistribution;
  areaDistribution: AdminRiskDistribution;
  operationalOverview: AdminOperationalOverview;
}
