import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const token = z.string().min(1).max(2000);
const ids = z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(100)]);
async function sessionFor(tokenValue: string) {
  const { readSession } = await import("../auth-session.server");
  return readSession(tokenValue);
}

export const listActionableAlerts = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const session = await sessionFor(data.token);
    if (!session) return { ok: false as const, error: "Sessão não autorizada." };
    const { listActionableAlerts: list } = await import("../actionable-alerts.server");
    return { ok: true as const, ...(await list(session)) };
  });
export const getActionableAlerts = listActionableAlerts;

export const markActionableAlertsViewed = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, alertId: ids }))
  .handler(async ({ data }) => {
    const session = await sessionFor(data.token);
    if (!session) return { ok: false as const, error: "Sessão não autorizada." };
    const { markActionableAlertsViewed: mark } = await import("../actionable-alerts.server");
    return { ok: true as const, alerts: await mark(session, Array.isArray(data.alertId) ? data.alertId : [data.alertId]) };
  });

export const acknowledgeActionableAlerts = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, alertId: ids }))
  .handler(async ({ data }) => {
    const session = await sessionFor(data.token);
    if (!session) return { ok: false as const, error: "Sessão não autorizada." };
    const { acknowledgeActionableAlerts: acknowledge } = await import("../actionable-alerts.server");
    return { ok: true as const, alerts: await acknowledge(session, Array.isArray(data.alertId) ? data.alertId : [data.alertId]) };
  });