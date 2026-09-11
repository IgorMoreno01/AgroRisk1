export type OperationLogStatus = "not_started" | "in_progress" | "completed";

export interface OperationLog {
  id: string;
  operatorId: string;
  operationId: string;
  machineId: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: OperationLogStatus;
  observation: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationLogSnapshot {
  operationId: string;
  machineId: string;
  activeLog: OperationLog | null;
  latestLog: OperationLog | null;
  history: OperationLog[];
}