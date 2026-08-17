// ============================================================
// AgroRisk · Cache em memória com TTL — server-side only
// Evita chamadas repetidas às APIs externas a cada renderização.
// ============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Tenta retornar do cache; retorna undefined se ausente ou expirado. */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/** Armazena um valor no cache com TTL em segundos. */
export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Wrapper: retorna do cache se disponível; caso contrário executa `fn`, armazena
 * o resultado e retorna. Erros em `fn` propagam normalmente (não são cacheados).
 */
export async function cacheOrFetch<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await fn();
  cacheSet(key, value, ttlSeconds);
  return value;
}

/** Invalida uma entrada específica do cache. */
export function cacheInvalidate(key: string): void {
  store.delete(key);
}

/** Limpa entradas expiradas (pode ser chamado periodicamente). */
export function cachePurgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}
