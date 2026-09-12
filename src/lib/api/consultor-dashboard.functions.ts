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
    const authorizedClients = session.globalScope ? null : session.clientIds;
    if (authorizedClients !== null && authorizedClients.length === 0) {
      return { ok: false as const, error: "Conta Consultor/Corretor sem clientes autorizados." };
    }
    const { loadConsultorDashboardSnapshot } = await import("../consultor-dashboard.server");
    return {
      ok: true as const,
      snapshot: await loadConsultorDashboardSnapshot({ userId: session.userId, clientIds: authorizedClients }),
    };
  });

const batchInput = z.object({
  token: z.string().min(1).max(2000),
  clientId: z.string().min(1).max(120),
  operationIds: z.array(z.string().min(1).max(120)).max(12),
  limit: z.number().int().min(1).max(12).default(12),
});

export const evaluateConsultorRiskBatch = createServerFn({ method: "POST" })
  .inputValidator(batchInput)
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/consultor");
    if (!session || (session.profile !== "consultor" && session.profile !== "admin")) {
      return { ok: false as const, error: "Sessão Consultor/Corretor não autorizada." };
    }
    const authorizedClients = session.globalScope ? null : session.clientIds;
    if (authorizedClients !== null && !authorizedClients.includes(data.clientId)) {
      return { ok: false as const, error: "Cliente fora do escopo autorizado." };
    }
    const { evaluateConsultorRiskBatch: evaluate } = await import("../consultor-dashboard.server");
    return {
      ok: true as const,
      client: await evaluate(
        { userId: session.userId, clientIds: authorizedClients },
        data.clientId,
        [...new Set(data.operationIds)],
        data.limit,
      ),
    };
  });

export const getConsultorPreventiveData = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(2000) }))
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/consultor");
    if (!session || (session.profile !== "consultor" && session.profile !== "admin")) {
      return { ok: false as const, error: "Sessão Consultor/Corretor não autorizada." };
    }
    const authorizedClients = session.globalScope ? null : session.clientIds;
    const { loadConsultorPreventiveData } = await import("../consultor-dashboard.server");
    return {
      ok: true as const,
      overview: await loadConsultorPreventiveData({
        userId: session.userId,
        clientIds: authorizedClients,
      }),
    };
  });