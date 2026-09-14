import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { loadAccountsSeed } from "../scripts/import-agrorisk-accounts";
import {
  authenticateAccount,
  closeAuthAccountRepository,
} from "../src/lib/auth-account.server";
import {
  closeOperationLogRepository,
  finishOperationLog,
  getOperationLogSnapshot,
  saveOperationObservation,
  startOperationLog,
} from "../src/lib/operation-log.server";

const seed = loadAccountsSeed();
const diego = seed.accounts.find((account) => account.email === "diego.nunes.operador@agrorisk.demo")!;
const anotherOperator = seed.accounts.find((account) => account.id === "OPR-021")!;

afterAll(async () => {
  await Promise.all([closeAuthAccountRepository(), closeOperationLogRepository()]);
});

describe("Registro persistido da operação", () => {
  test("persiste o ciclo de Diego e isola outro Operador", async () => {
    const authenticated = await authenticateAccount("operador", diego.email, diego.password);
    const anotherAuthenticated = await authenticateAccount(
      "operador",
      anotherOperator.email,
      anotherOperator.password,
    );
    expect(authenticated.ok).toBe(true);
    expect(anotherAuthenticated.ok).toBe(true);
    if (
      !authenticated.ok ||
      !anotherAuthenticated.ok ||
      !authenticated.account.linkedOperatorId ||
      !anotherAuthenticated.account.linkedOperatorId
    ) return;

    const operatorId = authenticated.account.linkedOperatorId;
    const otherOperatorId = anotherAuthenticated.account.linkedOperatorId;
    expect(operatorId).toBe("OPR-010");

    const before = await getOperationLogSnapshot(operatorId);
    expect(before.operationId).toBe("OP-1200");
    expect(before.machineId).toBe("MQ-080");
    expect(before.activeLog).toBeNull();

    let createdLogId: string | null = null;
    try {
      const started = await startOperationLog(operatorId);
      createdLogId = started.log.id;
      expect(started.alreadyActive).toBe(false);
      expect(started.log).toMatchObject({
        operatorId,
        operationId: "OP-1200",
        machineId: "MQ-080",
        status: "in_progress",
      });
      expect(started.log.startedAt).not.toBeNull();
      expect(started.log.finishedAt).toBeNull();

      const duplicate = await startOperationLog(operatorId);
      expect(duplicate.alreadyActive).toBe(true);
      expect(duplicate.log.id).toBe(createdLogId);

      const afterRefresh = await getOperationLogSnapshot(operatorId);
      expect(afterRefresh.activeLog?.id).toBe(createdLogId);
      expect(afterRefresh.activeLog?.status).toBe("in_progress");

      const observation = "Teste de persistência: solo úmido na área de operação.";
      const saved = await saveOperationObservation(operatorId, observation);
      expect(saved.id).toBe(createdLogId);
      expect(saved.observation).toBe(observation);

      const afterObservationRefresh = await getOperationLogSnapshot(operatorId);
      expect(afterObservationRefresh.activeLog?.observation).toBe(observation);

      await expect(
        saveOperationObservation(otherOperatorId, "Tentativa de alteração por outro Operador."),
      ).rejects.toThrow("Não há registro de operação em andamento");
      const afterOtherAttempt = await getOperationLogSnapshot(operatorId);
      expect(afterOtherAttempt.activeLog?.observation).toBe(observation);

      const completed = await finishOperationLog(operatorId);
      expect(completed.id).toBe(createdLogId);
      expect(completed.status).toBe("completed");
      expect(completed.finishedAt).not.toBeNull();
      expect(new Date(completed.finishedAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(completed.startedAt!).getTime(),
      );

      const finalState = await getOperationLogSnapshot(operatorId);
      expect(finalState.activeLog).toBeNull();
      expect(finalState.latestLog).toMatchObject({
        id: createdLogId,
        status: "completed",
        observation,
      });
      expect(finalState.history.some((log) => log.id === createdLogId)).toBe(true);
    } finally {
      if (createdLogId) {
        const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
        try {
          await sql`DELETE FROM agrorisk.operation_logs WHERE id = ${createdLogId}`;
        } finally {
          await sql.end({ timeout: 1 });
        }
      }
    }
  }, 30_000);

  test("RPCs não recebem operador, operação ou máquina do navegador", () => {
    const source = readFileSync(
      new URL("../src/lib/api/operation-logs.functions.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('z.object({ token: z.string().min(1).max(2000) })');
    expect(source).toContain("session?.linkedOperatorId");
    expect(source).not.toContain("operatorId: z.");
    expect(source).not.toContain("operationId: z.");
    expect(source).not.toContain("machineId: z.");
  });
});