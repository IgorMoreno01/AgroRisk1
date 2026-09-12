import { describe, expect, test } from "bun:test";
import {
  createAdminDashboardLoadCoordinator,
  createSingleFlightRequestController,
  preserveAdminRiskSnapshot,
} from "../src/lib/admin-dashboard-loader";
import {
  buildAdminDashboardRelationalSnapshot,
  buildAdminDashboardSnapshot,
} from "../src/lib/admin-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";

describe("loader do Admin/Sompo", () => {
  test("mantém uma única requisição de transporte durante timeout e retry", async () => {
    const controller = createSingleFlightRequestController<string>();
    let active = 0;
    let maxActive = 0;
    let aborted = false;
    let timedOut = false;
    const first = controller.start(
      (signal) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        return new Promise<string>((resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            active -= 1;
            reject(new DOMException("aborted", "AbortError"));
          }, { once: true });
        });
      },
      { timeoutMs: 5, onTimeout: () => { timedOut = true; } },
    );

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(timedOut).toBe(true);
    expect(aborted).toBe(true);
    expect(controller.inFlight).toBe(false);

    const retry = controller.start(
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        active -= 1;
        return "retry";
      },
      { timeoutMs: 5 },
    );
    expect(retry.started).toBe(true);
    expect(maxActive).toBe(1);

    await first.promise.catch(() => undefined);
    expect(await retry.promise).toBe("retry");
    expect(controller.inFlight).toBe(false);
  });

  test("libera o controlador após erro para permitir retry posterior", async () => {
    const controller = createSingleFlightRequestController<string>();
    let rejectTransport!: (reason: Error) => void;
    const first = controller.start(() => new Promise<string>((_, reject) => {
      rejectTransport = reject;
    }));
    expect(controller.start(async () => "duplicada").started).toBe(false);

    await Promise.resolve();
    rejectTransport(new Error("falha de transporte"));
    await first.promise.catch(() => undefined);
    expect(controller.inFlight).toBe(false);

    const retry = controller.start(async () => "novo transporte");
    expect(retry.started).toBe(true);
    expect(await retry.promise).toBe("novo transporte");
  });

  test("ignora conclusão tardia de uma tentativa abortada após retry", async () => {
    const controller = createSingleFlightRequestController<string>();
    let releaseOld!: (value: string) => void;
    const accepted: string[] = [];
    const first = controller.start(
      () => new Promise<string>((resolve) => { releaseOld = resolve; }),
      { timeoutMs: 5 },
    );
    void first.promise.then((value) => {
      if (first.isCurrent()) accepted.push(value);
    });

    await new Promise((resolve) => setTimeout(resolve, 15));
    const retry = controller.start(async () => "novo");
    void retry.promise.then((value) => {
      if (retry.isCurrent()) accepted.push(value);
    });
    await retry.promise;
    releaseOld("antigo");
    await first.promise;
    expect(accepted).toEqual(["novo"]);
  });

  test("preserva scores locais quando uma atualização relacional chega", async () => {
    const relational = {
      clients: await mockRepository.listClients(),
      areas: await mockRepository.listAreas(),
      machines: await mockRepository.listMachines(),
      operations: await mockRepository.listOperations(),
      alerts: await mockRepository.listAlerts(),
    };
    const weights = { ml: 70, operationalRules: 30 };
    const phaseA = await buildAdminDashboardRelationalSnapshot(
      relational,
      "mock",
      false,
      weights,
    );
    const evaluated = await buildAdminDashboardSnapshot(
      relational,
      "mock",
      false,
      weights,
    );
    const refreshed = {
      ...phaseA,
      loadedAt: new Date(Date.now() + 1_000).toISOString(),
    };
    const preserved = preserveAdminRiskSnapshot(refreshed, evaluated);

    expect(preserved.clients).toEqual(refreshed.clients);
    expect(preserved.operations).toEqual(refreshed.operations);
    expect(preserved.operationRows.map((row) => row.operation.id))
      .toEqual(evaluated.operationRows.map((row) => row.operation.id));
    expect(preserved.operationRows.map((row) => row.score))
      .toEqual(evaluated.operationRows.map((row) => row.score));
  });

  test("faz a primeira carga sem depender da visibilidade da aba", async () => {
    const coordinator = createAdminDashboardLoadCoordinator<string>();
    let calls = 0;
    let release!: (value: string) => void;
    const request = () => {
      calls += 1;
      return new Promise<string>((resolve) => { release = resolve; });
    };

    const first = coordinator.first(request);
    expect(first.started).toBe(true);
    expect(coordinator.refresh(false, request)).toBeNull();
    expect(coordinator.refresh(true, request)?.started).toBe(false);
    await Promise.resolve();
    expect(calls).toBe(1);

    release("first");
    await first.promise;
    expect(coordinator.refresh(false, request)).toBeNull();
    const visibleRefresh = coordinator.refresh(true, request);
    expect(visibleRefresh?.started).toBe(true);
    await Promise.resolve();
    expect(calls).toBe(2);
    release("second");
    await visibleRefresh?.promise;
  });
});