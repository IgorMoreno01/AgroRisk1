import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  token: z.string().min(1).max(2000),
});

const riskBatchInputSchema = z.object({
  token: z.string().min(1).max(2000),
  operationIds: z.array(z.string().min(1).max(200)).max(20).optional(),
  limit: z.number().int().min(1).max(20).optional(),
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

/** Authenticated, lazy V2 evaluation endpoint for Admin/Sompo only. */
export const evaluateAdminRiskBatch = createServerFn({ method: "POST" })
  .inputValidator(riskBatchInputSchema)
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/admin");
    if (!session || session.profile !== "admin" || !session.globalScope) {
      return { ok: false as const, error: "Sessão Admin/Sompo não autorizada." };
    }
    const { evaluateAdminDashboardRiskBatchDetails, ADMIN_RISK_BATCH_LIMIT } =
      await import("../admin-dashboard.server");
    const operationIds = [...new Set(data.operationIds ?? [])].slice(0, ADMIN_RISK_BATCH_LIMIT);
    const evaluation = await evaluateAdminDashboardRiskBatchDetails(operationIds, data.limit);
    const operationRows = evaluation.operationRows;
    const completed = new Set(operationRows.map((row) => row.operation.id));
    return {
      ok: true as const,
      operationRows,
      failedOperationIds: operationIds.filter((id) => !completed.has(id)),
      riskErrorsByOperationId: evaluation.riskErrorsByOperationId,
    };
  });
