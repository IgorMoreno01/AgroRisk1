export type MaintenanceStatus = "ok" | "due_soon" | "overdue";
export type MaintenanceSource = "real" | "demo" | "synthetic";

export interface PreventiveMaintenanceRecord {
  id: string;
  machineId: string;
  maintenanceType: string;
  performedAt: string;
  nextDueAt: string;
  observation: string;
  status: MaintenanceStatus;
  source: MaintenanceSource;
  createdAt: string;
  updatedAt: string;
}

export interface PreventiveMaintenanceSnapshot {
  machineId: string;
  record: PreventiveMaintenanceRecord | null;
}