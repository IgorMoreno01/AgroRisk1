import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getStoredSessionToken, useAuth } from "./auth";
import { listActionableAlerts, markActionableAlertsViewed, acknowledgeActionableAlerts } from "./api/actionable-alerts.functions";
import type { ActionableAlertsSnapshot } from "./actionable-alerts-types";

type AlertsContextValue = {
  snapshot: ActionableAlertsSnapshot;
  loading: boolean;
  refresh: () => Promise<void>;
  markViewed: (ids: string[]) => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
};
const empty: ActionableAlertsSnapshot = { alerts: [], unreadCount: 0 };
const Context = createContext<AlertsContextValue | null>(null);

export function ActionableAlertsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [snapshot, setSnapshot] = useState(empty);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    const token = getStoredSessionToken();
    if (!token) { setSnapshot(empty); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await listActionableAlerts({ data: { token } });
      if (result.ok) setSnapshot({ alerts: result.alerts, unreadCount: result.unreadCount });
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [profile]);
  const mutate = async (fn: (token: string) => Promise<unknown>) => {
    const token = getStoredSessionToken();
    if (!token) return;
    await fn(token);
    await refresh();
  };
  const value = useMemo(() => ({
    snapshot, loading, refresh,
    markViewed: async (ids: string[]) => {
      if (ids.length === 0) return;
      await mutate((token) => markActionableAlertsViewed({ data: { token, alertId: ids } }));
    },
    acknowledge: (id: string) => mutate((token) => acknowledgeActionableAlerts({ data: { token, alertId: id } })),
  }), [snapshot, loading]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useActionableAlerts() {
  const value = useContext(Context);
  if (!value) throw new Error("useActionableAlerts must be used within ActionableAlertsProvider");
  return value;
}