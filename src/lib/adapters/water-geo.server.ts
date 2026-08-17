// ============================================================
// AgroRisk · WaterGeoAdapter — Overpass API / OpenStreetMap (sem chave)
// Retorna feições hidrográficas próximas a uma coordenada.
// ============================================================

import { cacheOrFetch } from "../cache.server";
import type { WaterGeoData, WaterFeature, WaterFeatureType } from "../external-data.types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const TIMEOUT_MS = 12_000;
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

async function fetchFromOverpass(lat: number, lon: number, radiusM: number): Promise<WaterGeoData> {
  // Consulta Overpass QL: rios, córregos, lagos, reservatórios, canais, represas
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const data = (await res.json()) as OverpassResponse;

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
      .slice(0, 20); // limita a 20 feições

    const nearest = features[0] ?? null;

    return {
      source: "overpass",
      lat,
      lon,
      radiusM,
      fetchedAt: new Date().toISOString(),
      features,
      nearestDistanceM: nearest?.distanceM ?? null,
      nearestName: nearest?.name ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mockWaterGeoData(lat: number, lon: number): WaterGeoData {
  return {
    source: "mock",
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
 * Cache de 30 minutos. Fallback para mock em caso de erro.
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
