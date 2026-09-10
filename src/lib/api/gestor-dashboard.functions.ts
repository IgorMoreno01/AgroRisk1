import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getGestorDashboard = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(2000) }))
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/gestor");
    if (!session || (session.profile !== "gestor" && session.profile !== "admin")) {
      return { ok: false as const, error: "Sessão Gestor não autorizada." };
    }
    const { loadGestorDashboardSnapshot } = await import("../gestor-dashboard.server");
    return { ok: true as const, snapshot: await loadGestorDashboardSnapshot() };
  });