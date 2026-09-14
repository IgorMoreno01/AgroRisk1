import type { Operation } from "./mock-data";

export const GESTOR_RISK_BATCH_LIMIT = 12;

/** Orders the first visible page without ever dropping an active operation. */
export function selectGestorPriorityOperationIds(
  operations: readonly Operation[],
  requestedIds: readonly string[] = [],
  limit = GESTOR_RISK_BATCH_LIMIT,
  includeActive = true,
): string[] {
  const requested = new Set(requestedIds.filter((id): id is string => typeof id === "string"));
  const ordered = [...operations].sort((left, right) =>
    Number(right.status === "Em andamento") - Number(left.status === "Em andamento") ||
    Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt) ||
    left.id.localeCompare(right.id));
  const active = ordered.find((operation) => operation.status === "Em andamento");
  const selected = requested.size === 0 ? ordered : ordered.filter((operation) => requested.has(operation.id));
  const candidates = includeActive ? [active, ...selected] : selected;
  return [...new Set(candidates
    .filter((operation): operation is Operation => operation !== undefined)
    .map((operation) => operation.id))]
    .slice(0, Math.max(1, Math.min(limit, GESTOR_RISK_BATCH_LIMIT)));
}