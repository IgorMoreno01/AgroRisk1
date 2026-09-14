import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getOperadorDashboard = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(2000) }))
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/operador");
    if (!session || session.profile !== "operador" || !session.linkedOperatorId) {
      return { ok: false as const, error: "Sessão de Operador não autorizada." };
    }
    const { loadOperadorDashboardPhaseA } = await import("../operador-dashboard.server");
    return {
      ok: true as const,
      snapshot: await loadOperadorDashboardPhaseA(session.linkedOperatorId),
    };
  });

/** Authenticated Phase B endpoint; it only evaluates the operator's current operation. */
export const evaluateOperadorRisk = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    token: z.string().min(1).max(2000),
    operationId: z.string().min(1).max(120),
  }))
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/operador");
    if (!session || session.profile !== "operador" || !session.linkedOperatorId) {
      return { ok: false as const, error: "Sessão de Operador não autorizada." };
    }
    const { evaluateOperadorDashboardRisk } = await import("../operador-dashboard.server");
    return {
      ok: true as const,
      snapshot: await evaluateOperadorDashboardRisk(session.linkedOperatorId, data.operationId),
    };
  });