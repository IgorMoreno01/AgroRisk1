import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  closePreventiveMaintenanceRepository,
  getPreventiveMaintenanceSnapshot,
  maintenanceStatusFor,
} from "../src/lib/preventive-maintenance.server";

afterAll(async () => {
  await closePreventiveMaintenanceRepository();
});

describe("Manutenção preventiva do Operador", () => {
  test("classifica em dia, próxima e atrasada com janela de sete dias", () => {
    const now = new Date("2026-09-11T12:00:00.000Z");
    expect(maintenanceStatusFor(new Date("2026-09-20T12:00:00.000Z"), now)).toBe("ok");
    expect(maintenanceStatusFor(new Date("2026-09-18T12:00:00.000Z"), now)).toBe("due_soon");
    expect(maintenanceStatusFor(new Date("2026-09-10T12:00:00.000Z"), now)).toBe("overdue");
  });

  test("carrega registros determinísticos para os três estados", async () => {
    const [ok, dueSoon, overdue] = await Promise.all([
      getPreventiveMaintenanceSnapshot("OPR-001"),
      getPreventiveMaintenanceSnapshot("OPR-010"),
      getPreventiveMaintenanceSnapshot("OPR-021"),
    ]);

    expect(ok).toMatchObject({
      machineId: "MQ-071",
      record: { machineId: "MQ-071", status: "ok", source: "synthetic" },
    });
    expect(dueSoon).toMatchObject({
      machineId: "MQ-080",
      record: { machineId: "MQ-080", status: "due_soon", source: "synthetic" },
    });
    expect(overdue).toMatchObject({
      machineId: "MQ-111",
      record: { machineId: "MQ-111", status: "overdue", source: "synthetic" },
    });
  });

  test("refresh preserva o mesmo registro da máquina atual", async () => {
    const first = await getPreventiveMaintenanceSnapshot("OPR-010");
    const refreshed = await getPreventiveMaintenanceSnapshot("OPR-010");
    expect(refreshed).toEqual(first);
  });

  test("outro Operador não acessa manutenção fora do próprio escopo", async () => {
    const diego = await getPreventiveMaintenanceSnapshot("OPR-010");
    const otherOperator = await getPreventiveMaintenanceSnapshot("OPR-021");
    expect(diego.machineId).toBe("MQ-080");
    expect(diego.record?.machineId).toBe("MQ-080");
    expect(otherOperator.machineId).toBe("MQ-111");
    expect(otherOperator.record?.machineId).toBe("MQ-111");
    expect(otherOperator.record?.id).not.toBe(diego.record?.id);
  });

  test("RPC aceita somente token e deriva máquina server-side", () => {
    const source = readFileSync(
      new URL("../src/lib/api/preventive-maintenance.functions.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('z.object({ token: z.string().min(1).max(2000) })');
    expect(source).toContain("session?.linkedOperatorId");
    expect(source).not.toContain("machineId: z.");
    expect(source).not.toContain("machine_id");
  });
});