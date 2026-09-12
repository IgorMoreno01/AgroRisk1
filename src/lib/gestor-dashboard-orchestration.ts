import type { Operation } from "./mock-data";
import { selectGestorPriorityOperationIds } from "./gestor-risk-selection";

/**
 * The Gestor has two independent transports: the relational dashboard and
 * lazy risk evaluation.  A transport may only have one active attempt.  This
 * keeps a timed-out request from racing a local retry and gives callers a
 * stable current-attempt check for filter/selection changes.
 */
export const GESTOR_DASHBOARD_REQUEST_TIMEOUT_MS = 10_000;
export const GESTOR_RISK_REQUEST_TIMEOUT_MS = 15_000;

export const GESTOR_DASHBOARD_TIMEOUT_MESSAGE =
  "Tempo limite excedido ao carregar a carteira do Gestor.";
export const GESTOR_PRIORITY_TIMEOUT_MESSAGE =
  "Tempo limite excedido ao calcular o risco prioritário.";
export const GESTOR_SECONDARY_TIMEOUT_MESSAGE =
  "Tempo limite excedido ao calcular os riscos solicitados.";

/**
 * Unlike the selector's empty request meaning ("choose the default page"),
 * an explicit detail/selection demand with no IDs must remain empty.
 */
export function selectGestorDemandOperationIds(
  operations: readonly Operation[],
  requestedIds: readonly string[],
  limit = 12,
): string[] {
  if (requestedIds.length === 0) return [];
  return selectGestorPriorityOperationIds(operations, requestedIds, limit, false);
}

export interface GestorRequestStart<T> {
  promise: Promise<T>;
  started: boolean;
  /**
   * False after a timeout, invalidation, or a later attempt has made this
   * response stale.  Consumers must check this before publishing state.
   */
  isCurrent: () => boolean;
}

export interface GestorRequestController<T> {
  readonly inFlight: boolean;
  start(
    request: (signal: AbortSignal) => Promise<T>,
    options?: {
      timeoutMs?: number;
      onTimeout?: () => void;
    },
  ): GestorRequestStart<T>;
  /** Abort the current attempt without turning it into a visible error. */
  invalidate(): void;
}

/**
 * Starts one abortable request at a time.
 *
 * A timeout is terminal for the current attempt: the underlying transport is
 * aborted, the slot is released, and a subsequent retry can start
 * immediately.  The transport promise is still observed after abort so an
 * adapter that rejects later cannot become an unhandled rejection.
 */
export function createGestorRequestController<T>(): GestorRequestController<T> {
  let active: {
    promise: Promise<T>;
    controller: AbortController;
    stale: boolean;
  } | null = null;

  const invalidate = () => {
    if (!active) return;
    const attempt = active;
    attempt.stale = true;
    active = null;
    attempt.controller.abort();
  };

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
      void transport.then(settle, settle);

      return {
        promise: transport,
        started: true,
        // `settle` clears the single-flight slot before consumer handlers run.
        // Staleness is therefore carried by the attempt itself, not `active`.
        isCurrent: () => !attempt.stale,
      };
    },
    invalidate,
  };
}