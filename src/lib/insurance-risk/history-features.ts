import type {
  InsuranceClaimEvent,
  InsuranceItemIdentity,
  SafeItemHistoryFeatures,
} from "./types";

const MILLISECONDS_PER_DAY = 86_400_000;

const civilDateToEpochDay = (value: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError(
      `Data civil inválida: "${value}". Use YYYY-MM-DD.`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`Data civil inválida: "${value}".`);
  }

  return timestamp / MILLISECONDS_PER_DAY;
};

const sameIdentity = (
  left: InsuranceItemIdentity,
  right: InsuranceItemIdentity,
): boolean =>
  left.codApo === right.codApo &&
  left.codItem === right.codItem &&
  left.codMod === right.codMod &&
  left.uf === right.uf;

export const calculateSafeItemHistoryFeatures = (
  identity: InsuranceItemIdentity,
  referenceDate: string,
  events: readonly InsuranceClaimEvent[],
): SafeItemHistoryFeatures => {
  const referenceDay = civilDateToEpochDay(referenceDate);

  const priorEventDistances = events
    .filter((event) => sameIdentity(event.identity, identity))
    .map((event) => referenceDay - civilDateToEpochDay(event.occurredOn))
    .filter((daysBeforeReference) => daysBeforeReference > 0);

  const total = priorEventDistances.length;

  return {
    HIST_ITEM_SAFE_N_TOTAL: total,
    HIST_ITEM_SAFE_TEM_ANT: total > 0 ? 1 : 0,
    HIST_ITEM_SAFE_DIAS_DESDE_ULT:
      total > 0 ? Math.min(...priorEventDistances) : null,
    HIST_ITEM_SAFE_N_90D: priorEventDistances.filter(
      (daysBeforeReference) => daysBeforeReference <= 90,
    ).length,
    HIST_ITEM_SAFE_N_365D: priorEventDistances.filter(
      (daysBeforeReference) => daysBeforeReference <= 365,
    ).length,
  };
};