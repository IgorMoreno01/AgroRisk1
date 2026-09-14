import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createGestorRequestController,
  GESTOR_PRIORITY_TIMEOUT_MESSAGE,
  selectGestorDemandOperationIds,
} from "../src/lib/gestor-dashboard-orchestration";
import { selectGestorPriorityOperationIds } from "../src/lib/gestor-risk-selection";
import { gestorRiskBatchInputSchema } from "../src/lib/api/gestor-dashboard.functions";
import type { Operation } from "../src/lib/mock-data";

const operation = (id: string, scheduledAt: string): Operation => ({
  id,
  clientId: "CL-01",
  areaId: "AR-01",
  machineId: "M-01",
  machine: "M-01",
  operatorId: "USR-01",
  type: "Colheita",
  status: "Agendada",
  scheduledAt,
  area: "AR-01",
  start: scheduledAt,
  duration: "1h",
  score: 0,
  factors: [],
  recommendationId: "",
});

describe("orquestração estabilizada do Gestor", () => {
  test("KPIs do topo usam apenas contagens relacionais definitivas", () => {
    const source = readFileSync("src/routes/gestor.tsx", "utf8");

    expect(source).toContain('label="Máquinas monitoradas"');
    expect(source).toContain('label="Operações ativas"');
    expect(source).toContain('label="Áreas monitoradas"');
    expect(source).toContain('label="Alertas críticos"');
    expect(source).toContain('operation.status === "Em andamento"');
    expect(source).not.toContain('label="Operações em risco"');
    expect(source).not.toContain('label="Score médio da frota"');
  });

  test("publica uma resposta bem-sucedida e libera a tentativa", async () => {
    const controller = createGestorRequestController<string>();
    const request = controller.start(async () => "ok");

    expect(request.started).toBe(true);
    expect(await request.promise).toBe("ok");
    expect(request.isCurrent()).toBe(true);
    expect(controller.inFlight).toBe(false);
  });

  test("mantém erro terminal observável e permite retry local", async () => {
    const controller = createGestorRequestController<string>();
    const first = controller.start(async () => {
      throw new Error("falha relacional");
    });
    await expect(first.promise).rejects.toThrow("falha relacional");
    expect(controller.inFlight).toBe(false);

    const retry = controller.start(async () => "recuperado");
    expect(await retry.promise).toBe("recuperado");
  });

  test("timeout aborta a tentativa, notifica terminalmente e libera retry", async () => {
    const controller = createGestorRequestController<string>();
    let aborted = false;
    let timeoutMessage: string | undefined;
    const request = controller.start(
      (signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }),
      {
        timeoutMs: 5,
        onTimeout: () => { timeoutMessage = GESTOR_PRIORITY_TIMEOUT_MESSAGE; },
      },
    );

    await expect(request.promise).rejects.toThrow("aborted");
    expect(aborted).toBe(true);
    expect(timeoutMessage).toBe(GESTOR_PRIORITY_TIMEOUT_MESSAGE);
    expect(controller.inFlight).toBe(false);

    const retry = controller.start(async () => "retry");
    expect(await retry.promise).toBe("retry");
  });

  test("resposta stale após seleção nova não se torna a tentativa atual", async () => {
    const controller = createGestorRequestController<string>();
    let resolveOld!: (value: string) => void;
    const old = controller.start(() => new Promise<string>((resolve) => {
      resolveOld = resolve;
    }));

    controller.invalidate();
    const current = controller.start(async () => "novo");
    expect(await current.promise).toBe("novo");
    resolveOld("antigo");
    expect(await old.promise).toBe("antigo");
    expect(old.isCurrent()).toBe(false);
    expect(current.isCurrent()).toBe(true);
  });

  test("primeira chamada usa exatamente um operation.id string e limit 1", async () => {
    const operations = [
      operation("OP-1", "2026-01-01T10:00:00Z"),
      operation("OP-2", "2026-01-02T10:00:00Z"),
    ];
    const ids = selectGestorPriorityOperationIds(
      operations,
      operations.map((item) => item.id),
      1,
      false,
    );
    const calls: Array<{ operationIds: string[]; limit: number }> = [];
    const controller = createGestorRequestController<string>();
    const request = controller.start(async () => {
      calls.push({ operationIds: ids, limit: 1 });
      return "ok";
    });

    await request.promise;
    expect(calls).toEqual([{ operationIds: ["OP-2"], limit: 1 }]);
    expect(gestorRiskBatchInputSchema.safeParse({
      token: "sessao-de-teste",
      operationIds: calls[0]!.operationIds,
      limit: calls[0]!.limit,
    }).success).toBe(true);
  });

  test("demanda explícita sem seleção não cria uma página implícita", () => {
    const calls: string[][] = [];
    const ids = selectGestorDemandOperationIds(
      [operation("OP-1", "2026-01-01T10:00:00Z")],
      [],
      12,
    );
    if (ids.length > 0) calls.push(ids);
    expect(ids).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("demanda de seleção é event-keyed e retry usa o mesmo priorityOperationId", () => {
    const route = readFileSync("src/routes/gestor.tsx", "utf8");
    const selectionStart = route.indexOf("// Selection is an explicit demand event.");
    const selectionEnd = route.indexOf("}, [selectedMachine?.id", selectionStart);
    const selectionEffect = route.slice(selectionStart, selectionEnd);

    expect(selectionEffect).toContain("discardPendingRiskIds(false)");
    expect(selectionEffect).toContain("secondaryRequest.invalidate()");
    expect(selectionEffect).not.toContain("[snapshot, selectedMachine");
    expect(route).toContain(
      "}, [selectedMachine?.id, selectedArea?.id, priorityPublished, selectionDemandVersion]);",
    );
    expect(route).toContain("onClick={() => retryPriorityRisk(priorityOperationId)}");
    expect(route).toContain("(row) => row.operation.id === priorityOperationId");
    expect(route).toContain("batchLoading");
    expect(route).toContain("if (selectedIds.length === 0) return;");
    expect(route).toContain("if (pendingIds.length === 0) return;");
    expect(route).toContain("if (!cancelled && result.ok)");
    expect(route).toContain("}, [Boolean(snapshot)]");
  });
});