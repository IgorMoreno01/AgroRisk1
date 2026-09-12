// ============================================================
// AgroRisk · WaterGeoAdapter — Overpass API / OpenStreetMap (sem chave)
// Retorna feições hidrográficas próximas a uma coordenada.
//
// Estratégia multi-servidor:
//   1. overpass-api.de (principal)
//   2. overpass.kumi.systems (fallback 1)
//   3. overpass.private.coffee (fallback 2)
// Tenta o próximo automaticamente em 406, 429, 5xx ou timeout.
// ============================================================

import { cacheOrFetch } from "../cache.server";
import type { WaterGeoData, WaterFeature, WaterFeatureType } from "../external-data.types";

// Servidores Overpass públicos em ordem de preferência
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

// Códigos HTTP que justificam tentar o próximo servidor (não é erro permanente de query)
const RETRYABLE_STATUS = new Set([401, 406, 408, 429, 500, 502, 503, 504]);

// A query Overpass usa [timeout:20] internamente — o cliente precisa de pelo menos esse
// valor mais margem de rede. 12s abortava antes do servidor terminar. 25s dá folga segura.
// Fallbacks (kumi, private.coffee) não respondem da rede Replit, então 6s é suficiente
// para detectar o timeout sem bloquear o dashboard.
const TIMEOUT_MS = 25_000;
const FALLBACK_TIMEOUT_MS = 6_000;
const CACHE_TTL_S = 30 * 60; // 30 minutos (dados geográficos mudam pouco)
const DEFAULT_RADIUS_M = 5_000;
const inFlight = new Map<string, Promise<WaterGeoData>>();
const SERVER_BREAKER_COOLDOWN_MS = 30_000;
const serverUnavailableUntil = new Map<string, number>();

function isTransientProviderError(error: unknown): boolean {
  const candidate = error as { name?: unknown; status?: unknown; message?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : undefined;
  if (status !== undefined && (status === 401 || status === 408 || status === 429 || status >= 500)) return true;
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return candidate.name === "AbortError" ||
    /(?:http\s*)?(?:401|408|429|5\d{2})\b/.test(message) ||
    /\b(?:timeout|timed out|abort|aborted|network|fetch failed|unavailable|indisponível)\b/.test(message);
}

const WATER_TYPE_LABELS: Record<WaterFeatureType, string> = {
  river: "Rio",
  stream: "Córrego",
  lake: "Lago",
  reservoir: "Reservatório",
  dam: "Represa",
  canal: "Canal",
  wetland: "Área úmida",
  other: "Outro corpo d'água",
};

function tagToType(tags: Record<string, string>): WaterFeatureType {
  const waterway = tags["waterway"];
  const natural = tags["natural"];
  const landuse = tags["landuse"];
  if (waterway === "river") return "river";
  if (waterway === "stream" || waterway === "ditch") return "stream";
  if (waterway === "canal") return "canal";
  if (waterway === "dam" || waterway === "weir") return "dam";
  if (natural === "water") {
    const water = tags["water"];
    if (water === "reservoir") return "reservoir";
    if (water === "lake" || !water) return "lake";
    return "other";
  }
  if (landuse === "reservoir") return "reservoir";
  if (natural === "wetland") return "wetland";
  return "other";
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface OverpassElement {
  id: number;
  type: string;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ geometry?: Array<{ lat: number; lon: number }> }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

type GeoPoint = { lat: number; lon: number };

function pointInsideClosedPath(point: GeoPoint, path: readonly GeoPoint[]): boolean {
  if (path.length < 4) return false;
  const first = path[0];
  const last = path[path.length - 1];
  if (first.lat !== last.lat || first.lon !== last.lon) return false;
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const a = path[i];
    const b = path[j];
    if (
      (a.lat > point.lat) !== (b.lat > point.lat) &&
      point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegmentM(point: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const radiusM = 6_371_000;
  const radians = Math.PI / 180;
  const cosLat = Math.cos(point.lat * radians);
  const ax = (a.lon - point.lon) * radians * radiusM * cosLat;
  const ay = (a.lat - point.lat) * radians * radiusM;
  const bx = (b.lon - point.lon) * radians * radiusM * cosLat;
  const by = (b.lat - point.lat) * radians * radiusM;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  if (denominator === 0) return Math.hypot(ax, ay);
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function distanceToWaterGeometryM(
  point: GeoPoint,
  paths: readonly (readonly GeoPoint[])[],
): number | null {
  let nearest = Number.POSITIVE_INFINITY;
  for (const path of paths) {
    if (pointInsideClosedPath(point, path)) return 0;
    if (path.length === 1) {
      nearest = Math.min(nearest, haversineM(point.lat, point.lon, path[0].lat, path[0].lon));
      continue;
    }
    for (let index = 1; index < path.length; index++) {
      nearest = Math.min(nearest, distanceToSegmentM(point, path[index - 1], path[index]));
    }
  }
  return Number.isFinite(nearest) ? nearest : null;
}

export function parseOverpassWaterFeatures(
  elements: readonly OverpassElement[],
  lat: number,
  lon: number,
): WaterFeature[] {
  return elements
    .filter((element) => element.tags)
    .flatMap((element) => {
      const paths = [
        ...(element.geometry?.length ? [element.geometry] : []),
        ...(element.members ?? []).flatMap((member) =>
          member.geometry?.length ? [member.geometry] : [],
        ),
      ];
      const distanceM = distanceToWaterGeometryM({ lat, lon }, paths);
      if (distanceM === null) return [];
      const tags = element.tags ?? {};
      const type = tagToType(tags);
      return [{
        id: element.id,
        type,
        typeLabel: WATER_TYPE_LABELS[type],
        name: tags["name"] ?? tags["waterway"] ?? tags["natural"] ?? "Sem nome",
        distanceM,
      } satisfies WaterFeature];
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 20);
}

/** Extrai o hostname curto de uma URL para exibição em log */
function serverLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Tenta uma consulta Overpass num único servidor.
 * Lança erro se o servidor falhar (HTTP retryável ou timeout).
 * Lança erro com prefixo "PERMANENT:" se for erro de query (4xx não-retryável).
 */
async function tryServer(
  serverUrl: string,
  query: string,
  lat: number,
  lon: number,
  radiusM: number,
  isFallback = false,
): Promise<{ data: WaterGeoData; serverUsed: string; usedFallback: boolean }> {
  const label = serverLabel(serverUrl);
  // Fallbacks têm timeout menor — se o servidor não responde em 6s, passa para o próximo
  const timeoutMs = isFallback ? FALLBACK_TIMEOUT_MS : TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(serverUrl, {
      method: "POST",
      headers: {
        // POST com body URL-encoded — formato padrão Overpass
        "Content-Type": "application/x-www-form-urlencoded",
        // Identificação da aplicação conforme boas práticas do Overpass
        "User-Agent": "AgroRisk/1.0 (agroguard-vision; contato@agrorrisco.app)",
        // Aceita somente JSON
        "Accept": "application/json",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timer);
    // Timeout (AbortError) ou falha de rede — tentar próximo servidor
    throw new Error(`${label}: ${(fetchErr as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (RETRYABLE_STATUS.has(res.status)) {
      throw new Error(`${label}: HTTP ${res.status}`);
    }
    // Erro permanente (ex.: 400 query inválida) — não adianta tentar outro servidor
    throw new Error(`PERMANENT:${label}: HTTP ${res.status}`);
  }

  // Valida Content-Type antes de parsear JSON
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("text/plain")) {
    throw new Error(`${label}: Content-Type inesperado "${contentType}"`);
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new Error(`${label}: resposta não é JSON válido`);
  }

  // Valida estrutura mínima da resposta Overpass
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as OverpassResponse).elements)
  ) {
    throw new Error(`${label}: resposta sem campo "elements"`);
  }

  const data = parsed as OverpassResponse;

  const features = parseOverpassWaterFeatures(data.elements, lat, lon);

  const nearest = features[0] ?? null;

  return {
    data: {
      source: "overpass",
      serverUsed: label,
      usedFallbackServer: false, // preenchido pelo chamador
      lat,
      lon,
      radiusM,
      fetchedAt: new Date().toISOString(),
      features,
      nearestDistanceM: nearest?.distanceM ?? null,
      nearestName: nearest?.name ?? null,
    },
    serverUsed: label,
    usedFallback: false,
  };
}

async function fetchFromOverpass(lat: number, lon: number, radiusM: number): Promise<WaterGeoData> {
  const query = `
[out:json][timeout:20];
(
  way["waterway"~"^(river|stream|canal|drain|ditch)$"](around:${radiusM},${lat},${lon});
  way["natural"="water"](around:${radiusM},${lat},${lon});
  relation["natural"="water"](around:${radiusM},${lat},${lon});
  way["landuse"="reservoir"](around:${radiusM},${lat},${lon});
  way["waterway"="dam"](around:${radiusM},${lat},${lon});
  way["natural"="wetland"](around:${radiusM},${lat},${lon});
);
out geom;
  `.trim();

  const errors: string[] = [];

  for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
    const serverUrl = OVERPASS_SERVERS[i];
    const label = serverLabel(serverUrl);
    const isFallback = i > 0;
    const unavailableUntil = serverUnavailableUntil.get(label) ?? 0;
    if (unavailableUntil > Date.now()) {
      errors.push(`${label}: circuit breaker ativo`);
      continue;
    }

    try {
      const result = await tryServer(serverUrl, query, lat, lon, radiusM, isFallback);
      const { data } = result;
      data.usedFallbackServer = isFallback;
      data.serverUsed = label;

      if (isFallback) {
        console.info(
          `[WaterGeoAdapter] servidor principal falhou — respondeu fallback [${i}]: ${label}`,
          { errors },
        );
      } else {
        console.info(`[WaterGeoAdapter] ${label} respondeu OK (${data.features.length} feições)`);
      }

      return data;
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(msg);

      if (msg.startsWith("PERMANENT:")) {
        // Erro de query — não adianta tentar mais servidores
        console.error(`[WaterGeoAdapter] erro permanente em ${label}:`, msg);
        break;
      }
      // 401/429, timeout and network/provider-unavailable errors are
      // short-lived provider failures. Skip this endpoint for a short period
      // so concurrent batches immediately use the safe fallback path.
      if (isTransientProviderError(err)) {
        serverUnavailableUntil.set(label, Date.now() + SERVER_BREAKER_COOLDOWN_MS);
      }

      const isLast = i === OVERPASS_SERVERS.length - 1;
      if (isLast) {
        console.warn(
          `[WaterGeoAdapter] todos os ${OVERPASS_SERVERS.length} servidores falharam:`,
          errors,
        );
      } else {
        console.warn(`[WaterGeoAdapter] ${label} falhou, tentando próximo:`, msg);
      }
    }
  }

  throw new Error(`Overpass indisponível em todos os servidores. Erros: ${errors.join(" | ")}`);
}

function mockWaterGeoData(lat: number, lon: number): WaterGeoData {
  return {
    source: "mock",
    serverUsed: null,
    usedFallbackServer: false,
    lat,
    lon,
    radiusM: DEFAULT_RADIUS_M,
    fetchedAt: new Date().toISOString(),
    features: [
      { id: 0, type: "stream", typeLabel: "Córrego", name: "Córrego simulado", distanceM: 85 },
    ],
    nearestDistanceM: 85,
    nearestName: "Córrego simulado",
  };
}

/**
 * Retorna feições hidrográficas num raio de `radiusM` metros da coordenada.
 * Cache de 30 minutos. Fallback para mock somente se todos os servidores Overpass falharem.
 */
export async function getWaterGeo(
  lat: number,
  lon: number,
  radiusM: number = DEFAULT_RADIUS_M,
): Promise<WaterGeoData> {
  // Seis casas evitam compartilhar cache entre pontos separados por aproximadamente 10 cm.
  const key = `water-geo:${lat.toFixed(6)}:${lon.toFixed(6)}:${radiusM}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      return await cacheOrFetch(key, CACHE_TTL_S, () => fetchFromOverpass(lat, lon, radiusM));
    } catch (err) {
      console.warn("[WaterGeoAdapter] fallback para mock:", (err as Error).message);
      return mockWaterGeoData(lat, lon);
    }
  })();
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}
