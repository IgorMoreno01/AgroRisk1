import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getConsultorDashboard = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(2000) }))
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/consultor");
    if (!session || (session.profile !== "consultor" && session.profile !== "admin")) {
      return { ok: false as const, error: "Sessão Consultor/Corretor não autorizada." };
    }
    const { loadConsultorDashboardSnapshot } = await import("../consultor-dashboard.server");
    return { ok: true as const, snapshot: await loadConsultorDashboardSnapshot() };
  });