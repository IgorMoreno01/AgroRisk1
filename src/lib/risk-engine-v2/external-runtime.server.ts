import type {
  ElevationData,
  HistoricalWeatherFeatures,
  WaterGeoData,
} from "../external-data.types";
import type { GeocodedLocation } from "../adapters/location.server";

export type RiskExternalPriority = "interactive" | "background";

type Provider = "geocode" | "weather" | "elevation" | "water";
type ExternalValue =
  | GeocodedLocation
  | HistoricalWeatherFeatures
  | ElevationData
  | WaterGeoData
  | null;

const POSITIVE_TTL_MS = 10 * 60_000;
const NEGATIVE_TTL_MS = 30_000;

interface CacheEntry {
  value: ExternalValue;
  expiresAt: number;
}

interface QueueItem {
  key: string;
  priority: RiskExternalPriority;
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/**
 * A small shared priority executor. Background work deliberately leaves one
 * slot free in each provider queue, so an explicit limit=1 request does not
 * wait behind a dashboard batch already in progress.
 */
class ProviderQueue {
  private readonly queues = new Map<Provider, QueueItem[]>();
  private readonly queuedByKey = new Map<Provider, Map<string, QueueItem>>();
  private readonly running = new Map<Provider, number>();
  private readonly interactiveBurst = new Map<Provider, number>();
  private readonly limits: Record<Provider, number> = {
    geocode: 3,
    weather: 4,
    elevation: 3,
    water: 2,
  };

  run<T>(
    provider: Provider,
    key: string,
    priority: RiskExternalPriority,
    task: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queue = this.queues.get(provider) ?? [];
      const item: QueueItem = {
        key,
        priority,
        task,
        resolve: (value) => resolve(value as T),
        reject,
      };
      queue.push(item);
      this.queues.set(provider, queue);
      const queued = this.queuedByKey.get(provider) ?? new Map<string, QueueItem>();
      queued.set(key, item);
      this.queuedByKey.set(provider, queued);
      this.drain(provider);
    });
  }

  promote(provider: Provider, key: string): void {
    const item = this.queuedByKey.get(provider)?.get(key);
    if (!item || item.priority === "interactive") return;
    item.priority = "interactive";
    const queue = this.queues.get(provider);
    if (!queue) return;
    const index = queue.indexOf(item);
    if (index >= 0) {
      queue.splice(index, 1);
      const firstBackground = queue.findIndex((queued) => queued.priority === "background");
      queue.splice(firstBackground < 0 ? queue.length : firstBackground, 0, item);
    }
    this.drain(provider);
  }

  private drain(provider: Provider): void {
    const queue = this.queues.get(provider);
    if (!queue) return;
    const running = this.running.get(provider) ?? 0;
    const limit = this.limits[provider];
    if (queue.length === 0 || running >= limit) return;

    // A bounded burst prevents an endless stream of interactive requests from
    // starving background refreshes. A background task is still never started
    // in the reserved slot.
    const burst = this.interactiveBurst.get(provider) ?? 0;
    const backgroundIndex = queue.findIndex((queued) => queued.priority === "background");
    const interactiveIndex = queue.findIndex((queued) => queued.priority === "interactive");
    const enforcingFairness = burst >= 3 && backgroundIndex >= 0;
    let nextIndex = enforcingFairness
      ? backgroundIndex
      : interactiveIndex >= 0 ? interactiveIndex : backgroundIndex;
    if (nextIndex < 0) return;
    let next = queue[nextIndex];
    // Reserve one slot for interactive work while background work is queued.
    if (next.priority === "background" && running >= limit - 1 && !enforcingFairness) {
      if (interactiveIndex < 0) return;
      nextIndex = interactiveIndex;
      next = queue[nextIndex];
    }
    queue.splice(nextIndex, 1);
    this.queuedByKey.get(provider)?.delete(next.key);
    this.interactiveBurst.set(
      provider,
      next.priority === "interactive" ? burst + 1 : 0,
    );
    this.running.set(provider, running + 1);
    void next.task().then(next.resolve, next.reject).finally(() => {
      this.running.set(provider, (this.running.get(provider) ?? 1) - 1);
      this.drain(provider);
    });
    this.drain(provider);
  }
}

const providerQueue = new ProviderQueue();
const MAX_CACHE_ENTRIES = 2_000;
const CACHE_PURGE_INTERVAL_MS = 10_000;
const cache = new Map<string, CacheEntry>();
let lastCachePurgeAt = 0;
const inFlight = new Map<string, Promise<ExternalValue>>();
const functionIds = new WeakMap<Function, number>();
let nextFunctionId = 1;

function functionId(fn: Function): number {
  const existing = functionIds.get(fn);
  if (existing !== undefined) return existing;
  const id = nextFunctionId++;
  functionIds.set(fn, id);
  return id;
}

const normalized = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

const coordinateKey = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(6) : "invalid";

export function purgeRiskExternalCache(now = Date.now()): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  lastCachePurgeAt = now;
}

export function getRiskExternalCacheStats(): { size: number; maxSize: number } {
  return { size: cache.size, maxSize: MAX_CACHE_ENTRIES };
}

export function clearRiskExternalRuntimeCache(): void {
  cache.clear();
  lastCachePurgeAt = Date.now();
}

function maintainCache(now = Date.now()): void {
  if (now - lastCachePurgeAt >= CACHE_PURGE_INTERVAL_MS) purgeRiskExternalCache(now);
}

function remember(key: string, value: ExternalValue): void {
  const isSyntheticFallback =
    value !== null &&
    typeof value === "object" &&
    "source" in value &&
    value.source === "mock";
  cache.set(key, {
    value,
    expiresAt: Date.now() + (value === null || isSyntheticFallback ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS),
  });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function isTransientExternalError(error: unknown): boolean {
  const candidate = error as { name?: unknown; status?: unknown; message?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : undefined;
  if (status !== undefined && (status === 401 || status === 408 || status === 429 || status >= 500)) return true;
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return candidate.name === "AbortError" ||
    /(?:http\s*)?(?:401|408|429|5\d{2})\b/.test(message) ||
    /\b(?:timeout|timed out|abort|aborted|network|fetch failed|unavailable|indisponível)\b/.test(message);
}

async function memoized<T extends ExternalValue>(
  provider: Provider,
  key: string,
  priority: RiskExternalPriority,
  task: () => Promise<T>,
): Promise<T> {
  maintainCache();
  const cached = cache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      // Map insertion order is the LRU order.
      cache.delete(key);
      cache.set(key, cached);
      return cached.value as T;
    }
    cache.delete(key);
  }
  const pending = inFlight.get(key);
  if (pending) {
    if (priority === "interactive") providerQueue.promote(provider, key);
    return pending as Promise<T>;
  }
  const request = providerQueue.run<T>(provider, key, priority, async (): Promise<T> => {
    try {
      const value = await task();
      remember(key, value);
      return value;
    } catch (error) {
      if (!isTransientExternalError(error)) throw error;
      // Only transient provider failures become missing data. Unexpected
      // programming/query errors must remain visible to the caller.
      remember(key, null);
      return null as T;
    }
  });
  inFlight.set(key, request as Promise<ExternalValue>);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export interface RiskExternalRuntime {
  geocode: (municipality: string, state: string) => Promise<GeocodedLocation | null>;
  historicalWeather: (
    lat: number,
    lon: number,
    referenceDate: string,
  ) => Promise<HistoricalWeatherFeatures | null>;
  elevation: (lat: number, lon: number) => Promise<ElevationData | null>;
  water: (lat: number, lon: number) => Promise<WaterGeoData | null>;
}

/**
 * Adds cross-operation memoization and priority scheduling without changing
 * provider adapters or the Risk Engine V2 input/model.
 */
export function createRiskExternalRuntime(
  services: RiskExternalRuntime,
  priority: RiskExternalPriority = "background",
): RiskExternalRuntime {
  const geocodeId = functionId(services.geocode);
  const weatherId = functionId(services.historicalWeather);
  const elevationId = functionId(services.elevation);
  const waterId = functionId(services.water);
  return {
    geocode: (municipality, state) => memoized(
      "geocode",
      `risk-geocode:${geocodeId}:${normalized(municipality)}:${normalized(state)}`,
      priority,
      () => services.geocode(municipality, state),
    ),
    historicalWeather: (lat, lon, referenceDate) => memoized(
      "weather",
      `risk-weather:${weatherId}:${coordinateKey(lat)}:${coordinateKey(lon)}:${referenceDate}`,
      priority,
      () => services.historicalWeather(lat, lon, referenceDate),
    ),
    elevation: (lat, lon) => memoized(
      "elevation",
      `risk-elevation:${elevationId}:${coordinateKey(lat)}:${coordinateKey(lon)}`,
      priority,
      () => services.elevation(lat, lon),
    ),
    water: (lat, lon) => memoized(
      "water",
      `risk-water:${waterId}:${coordinateKey(lat)}:${coordinateKey(lon)}`,
      priority,
      () => services.water(lat, lon),
    ),
  };
}