import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenInput = z.object({ token: z.string().min(1).max(2000) });

async function authorizedOperator(token: string) {
  const { authorize } = await import("../auth-session.server");
  const session = await authorize(token, "/operador");
  if (!session || session.profile !== "operador" || !session.linkedOperatorId) {
    return null;
  }
  return session;
}

export const getOperationLog = createServerFn({ method: "POST" })
  .inputValidator(tokenInput)
  .handler(async ({ data }) => {
    const session = await authorizedOperator(data.token);
    const operatorId = session?.linkedOperatorId;
    if (!session || !operatorId) return { ok: false as const, error: "Sessão de Operador não autorizada." };
    const { getOperationLogSnapshot } = await import("../operation-log.server");
    return { ok: true as const, snapshot: await getOperationLogSnapshot(operatorId) };
  });

export const startOperation = createServerFn({ method: "POST" })
  .inputValidator(tokenInput)
  .handler(async ({ data }) => {
    const session = await authorizedOperator(data.token);
    const operatorId = session?.linkedOperatorId;
    if (!session || !operatorId) return { ok: false as const, error: "Sessão de Operador não autorizada." };
    const { startOperationLog } = await import("../operation-log.server");
    const result = await startOperationLog(operatorId);
    return { ok: true as const, ...result };
  });

export const saveOperationLogObservation = createServerFn({ method: "POST" })
  .inputValidator(tokenInput.extend({ observation: z.string().max(2_000) }))
  .handler(async ({ data }) => {
    const session = await authorizedOperator(data.token);
    const operatorId = session?.linkedOperatorId;
    if (!session || !operatorId) return { ok: false as const, error: "Sessão de Operador não autorizada." };
    const { saveOperationObservation } = await import("../operation-log.server");
    return { ok: true as const, log: await saveOperationObservation(operatorId, data.observation.trim()) };
  });

export const finishOperation = createServerFn({ method: "POST" })
  .inputValidator(tokenInput)
  .handler(async ({ data }) => {
    const session = await authorizedOperator(data.token);
    const operatorId = session?.linkedOperatorId;
    if (!session || !operatorId) return { ok: false as const, error: "Sessão de Operador não autorizada." };
    const { finishOperationLog } = await import("../operation-log.server");
    return { ok: true as const, log: await finishOperationLog(operatorId) };
  });