export type ActionableAlertSeverity = "low" | "medium" | "high" | "critical";
export type ActionableAlertStatus = "new" | "viewed" | "acknowledged" | "resolved";

export interface ActionableAlert {
  id: string;
  recipientUserId: string;
  type: string;
  severity: ActionableAlertSeverity;
  title: string;
  message: string;
  status: ActionableAlertStatus;
  clientId: string | null;
  operatorId: string | null;
  machineId: string | null;
  operationId: string | null;
  createdAt: string;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  source: string;
  updatedAt: string;
}

export interface ActionableAlertsSnapshot {
  alerts: ActionableAlert[];
  unreadCount: number;
}