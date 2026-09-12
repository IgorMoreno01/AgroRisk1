import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredSessionToken } from "./auth";
import { getAdminDashboard } from "./api/admin-dashboard.functions";
import { mergeAdminOperationRows } from "./admin-dashboard-merge";
import type { AdminDashboardSnapshot } from "./admin-dashboard-types";

/**
 * The relational dashboard is intentionally bounded separately from risk
 * evaluation.  Timeouts abort the transport before releasing the single-flight
 * slot, so a retry cannot overlap the request that just timed out.
 */
export const ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS = 10_000;
export const ADMIN_RISK_REQUEST_TIMEOUT_MS = 15_000;

export const ADMIN_DASHBOARD_TIMEOUT_MESSAGE =
  "Tempo limite excedido ao carregar os dados do Admin/Sompo.";
export const ADMIN_PRIORITY_TIMEOUT_MESSAGE =
  "Tempo limite excedido ao calcular o risco prioritário.";
export const ADMIN_SECONDARY_TIMEOUT_MESSAGE =
  "Tempo limite excedido ao calcular os riscos solicitados.";

export interface SingleFlightStart<T> {
  promise: Promise<T>;
  started: boolean;
  /** False after this attempt was terminally aborted by its timeout. */
  isCurrent: () => boolean;
}

export interface SingleFlightRequestController<T> {
  readonly inFlight: boolean;
  start(
    request: (signal: AbortSignal) => Promise<T>,
    options?: {
      timeoutMs?: number;
      onTimeout?: () => void;
    },
  ): SingleFlightStart<T>;
}

export interface AdminDashboardLoadCoordinator<T> {
  readonly inFlight: boolean;
  first(
    request: (signal: AbortSignal) => Promise<T>,
    options?: { timeoutMs?: number; onTimeout?: () => void },
  ): SingleFlightStart<T>;
  refresh(
    visible: boolean,
    request: (signal: AbortSignal) => Promise<T>,
    options?: { timeoutMs?: number; onTimeout?: () => void },
  ): SingleFlightStart<T> | null;
  retry(
    request: (signal: AbortSignal) => Promise<T>,
    options?: { timeoutMs?: number; onTimeout?: () => void },
  ): SingleFlightStart<T>;
}

/**
 * Runs one transport at a time.  Unlike Promise.race, timeout handling aborts
 * the actual request and releases the slot immediately; stale completions are
 * identified by isCurrent and cannot update UI state after a retry.
 */
export function createSingleFlightRequestController<T>(): SingleFlightRequestController<T> {
  let active: {
    promise: Promise<T>;
    controller: AbortController;
    stale: boolean;
  } | null = null;

  return {
    get inFlight() {
      return active !== null;
    },
    start(request, options = {}) {
      if (active) {
        const existing = active;
        return {
          promise: existing.promise,
          started: false,
          isCurrent: () => active === existing && !existing.stale,
        };
      }

      const controller = new AbortController();
      const transport = Promise.resolve().then(() => request(controller.signal));
      const attempt = { promise: transport, controller, stale: false };
      active = attempt;
      const timeoutMs = options.timeoutMs ?? 0;
      const timeoutHandle = timeoutMs > 0
        ? setTimeout(() => {
            if (active !== attempt || attempt.stale) return;
            attempt.stale = true;
            active = null;
            controller.abort();
            options.onTimeout?.();
          }, timeoutMs)
        : undefined;

      const settle = () => {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
        if (active === attempt) active = null;
      };
      // Both branches are handled here so a request that times out and later
      // rejects cannot become an unhandled rejection.
      void transport.then(settle, settle);

      return {
        promise: transport,
        started: true,
        isCurrent: () => !attempt.stale,
      };
    },
  };
}

/**
 * Keeps first-load and later refresh policy explicit and testable. `first` and
 * `retry` are unconditional; only a later refresh observes visibility.
 */
export function createAdminDashboardLoadCoordinator<T>(): AdminDashboardLoadCoordinator<T> {
  const controller = createSingleFlightRequestController<T>();
  return {
    get inFlight() {
      return controller.inFlight;
    },
    first: (request, options) => controller.start(request, options),
    refresh: (visible, request, options) =>
      visible ? controller.start(request, options) : null,
    retry: (request, options) => controller.start(request, options),
  };
}

/**
 * Replaces the relational portion of a refreshed snapshot while retaining
 * successful local V2 rows.  Scores are never fabricated or recomputed here;
 * they remain the output previously returned by evaluateOperationRiskV2.
 */
export function preserveAdminRiskSnapshot(
  relationalSnapshot: AdminDashboardSnapshot,
  currentSnapshot: AdminDashboardSnapshot | null,
): AdminDashboardSnapshot {
  if (!currentSnapshot) return relationalSnapshot;

  const operationById = new Map(
    relationalSnapshot.operations.map((operation) => [operation.id, operation]),
  );
  const retainedRows = currentSnapshot.operationRows.flatMap((row) => {
    const operation = operationById.get(row.operation.id);
    return operation ? [{ ...row, operation }] : [];
  });
  return mergeAdminOperationRows(relationalSnapshot, retainedRows);
}

type AdminDashboardResponse = Awaited<ReturnType<typeof getAdminDashboard>>;

export interface AdminDashboardLoaderState {
  snapshot: AdminDashboardSnapshot | null;
  error: string | null;
  retry: () => void;
}

/**
 * IMMEDIATE Admin/Sompo loader.  The first request is unconditional: browser
 * visibility is only a gate for later focus/visibility refreshes.
 */
export function useAdminDashboardLoader(): AdminDashboardLoaderState {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const coordinator = useRef(
    createAdminDashboardLoadCoordinator<AdminDashboardResponse>(),
  ).current;

  const startLoad = useCallback((kind: "first" | "refresh" | "retry", visible = true) => {
    if (!mounted.current) return;
    const token = getStoredSessionToken();
    if (!token) {
      setError("Sessão Admin/Sompo não encontrada.");
      return;
    }

    const options = {
      timeoutMs: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS,
      onTimeout: () => {
        if (mounted.current) setError(ADMIN_DASHBOARD_TIMEOUT_MESSAGE);
      },
    };
    const request = kind === "refresh"
      ? coordinator.refresh(
          visible,
          (signal) => getAdminDashboard({ data: { token }, signal }),
          options,
        )
      : (kind === "first" ? coordinator.first : coordinator.retry)(
          (signal) => getAdminDashboard({ data: { token }, signal }),
          options,
        );
    if (!request) return;
    // A focus event while the first transport is pending must not attach a
    // second lifecycle to it or start another transport.
    if (!request.started) return;

    void request.promise.then(
      (result) => {
        if (!mounted.current || !request.isCurrent()) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSnapshot(result.snapshot);
        setError(null);
      },
      (requestError) => {
        if (!mounted.current || !request.isCurrent()) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Não foi possível carregar os dados do Admin/Sompo.",
        );
      },
    );
  }, [coordinator]);

  const load = useCallback(() => {
    startLoad("retry");
  }, [startLoad]);

  useEffect(() => {
    mounted.current = true;
    const loadIfActive = () => {
      if (mounted.current && document.visibilityState === "visible") {
        startLoad("refresh", true);
      }
    };

    // Do not gate the first request on visibilityState.  A hidden tab still
    // needs a bounded request and a visible error/retry state.
    startLoad("first");
    const refreshWhenVisible = () => loadIfActive();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [startLoad]);

  return { snapshot, error, retry: load };
}