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
    const { loadOperadorDashboardSnapshot } = await import("../operador-dashboard.server");
    return {
      ok: true as const,
      snapshot: await loadOperadorDashboardSnapshot(session.linkedOperatorId),
    };
  });