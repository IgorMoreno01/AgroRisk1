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
const RETRYABLE_STATUS = new Set([406, 429, 500, 502, 503, 504]);

// Timeout por servidor. Os servidores de fallback (kumi, private.coffee) aceitam TCP
// mas não respondem da rede Replit — timeout curto evita bloquear o dashboard 15s por servidor.
const TIMEOUT_MS = 12_000;
const FALLBACK_TIMEOUT_MS = 6_000;
const CACHE_TTL_S = 30 * 60; // 30 minutos (dados geográficos mudam pouco)
const DEFAULT_RADIUS_M = 5_000;

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

interface OverpassElement {
  id: number;
  type: string;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
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

  const features: WaterFeature[] = data.elements
    .filter((el) => el.tags)
    .map((el) => {
      const elLat = el.center?.lat ?? el.lat;
      const elLon = el.center?.lon ?? el.lon;
      const distanceM =
        elLat !== undefined && elLon !== undefined
          ? Math.round(haversineM(lat, lon, elLat, elLon))
          : radiusM;
      const tags = el.tags ?? {};
      const type = tagToType(tags);
      return {
        id: el.id,
        type,
        typeLabel: WATER_TYPE_LABELS[type],
        name: tags["name"] ?? tags["waterway"] ?? tags["natural"] ?? "Sem nome",
        distanceM,
        lat: elLat,
        lon: elLon,
      } satisfies WaterFeature;
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 20);

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
out center tags;
  `.trim();

  const errors: string[] = [];

  for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
    const serverUrl = OVERPASS_SERVERS[i];
    const label = serverLabel(serverUrl);
    const isFallback = i > 0;

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
  const key = `water-geo:${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusM}`;
  try {
    return await cacheOrFetch(key, CACHE_TTL_S, () => fetchFromOverpass(lat, lon, radiusM));
  } catch (err) {
    console.warn("[WaterGeoAdapter] fallback para mock:", (err as Error).message);
    return mockWaterGeoData(lat, lon);
  }
}
