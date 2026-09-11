import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  token: z.string().min(1).max(2000),
});

export const getAdminDashboard = createServerFn({ method: "POST" })
  .inputValidator(inputSchema)
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/admin");
    if (!session || session.profile !== "admin" || !session.globalScope) {
      return { ok: false as const, error: "Sessão Admin/Sompo não autorizada." };
    }

    const { loadAdminDashboardSnapshot } = await import("../admin-dashboard.server");
    return {
      ok: true as const,
      snapshot: await loadAdminDashboardSnapshot(),
    };
  });
