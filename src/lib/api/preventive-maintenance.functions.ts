import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenInput = z.object({ token: z.string().min(1).max(2000) });

export const getPreventiveMaintenance = createServerFn({ method: "POST" })
  .inputValidator(tokenInput)
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/operador");
    const operatorId = session?.linkedOperatorId;
    if (!session || session.profile !== "operador" || !operatorId) {
      return { ok: false as const, error: "Sessão de Operador não autorizada." };
    }

    const { getPreventiveMaintenanceSnapshot } = await import(
      "../preventive-maintenance.server"
    );
    return {
      ok: true as const,
      snapshot: await getPreventiveMaintenanceSnapshot(operatorId),
    };
  });