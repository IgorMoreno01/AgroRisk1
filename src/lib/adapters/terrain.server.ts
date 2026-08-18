// ============================================================
// AgroRisk · TerrainAdapter — OpenTopography (requer OPENTOPO_API_KEY)
// Fallback: Open-Elevation API (público, sem chave)
// ============================================================

import { cacheOrFetch } from "../cache.server";
import type { ElevationData, SlopeClass, SlopePoint } from "../external-data.types";

const OPENTOPO_URL = "https://portal.opentopography.org/API/globaldem";
const OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup";
const TIMEOUT_MS = 12_000;
const CACHE_TTL_S = 60 * 60; // 1 hora (elevação muda raramente)

// Offsets para calcular declividade (em graus ~ 111m por grau lat)
const SLOPE_OFFSET_DEG = 0.001; // ~111m

const SLOPE_LABELS: Record<SlopeClass, string> = {
  flat: "Plano (< 3%)",
  gentle: "Suave (3–8%)",
  moderate: "Moderado (8–20%)",
  steep: "Acentuado (20–45%)",
  very_steep: "Muito acentuado (> 45%)",
};

function classifySlope(pct: number): SlopeClass {
  if (pct < 3) return "flat";
  if (pct < 8) return "gentle";
  if (pct < 20) return "moderate";
  if (pct < 45) return "steep";
  return "very_steep";
}

function calcSlope(center: number, north: number, east: number): number {
  const dH_ns = Math.abs(north - center); // m
  const dH_ew = Math.abs(east - center);  // m
  const dist = SLOPE_OFFSET_DEG * 111_000; // ~111m
  const slope = (Math.sqrt(dH_ns ** 2 + dH_ew ** 2) / dist) * 100;
  return Math.round(slope * 10) / 10;
}

// ---------- Open-Elevation API (fallback público) ----------

interface OpenElevationResult {
  results: Array<{ latitude: number; longitude: number; elevation: number }>;
}

async function fetchOpenElevation(
  locations: Array<{ latitude: number; longitude: number }>,
): Promise<number[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPEN_ELEVATION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Open-Elevation HTTP ${res.status}`);
    const data = (await res.json()) as OpenElevationResult;
    return data.results.map((r) => r.elevation);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchElevationViaOpenElevation(lat: number, lon: number): Promise<ElevationData> {
  const locations = [
    { latitude: lat, longitude: lon },
    { latitude: lat + SLOPE_OFFSET_DEG, longitude: lon },
    { latitude: lat, longitude: lon + SLOPE_OFFSET_DEG },
  ];
  const [center, north, east] = await fetchOpenElevation(locations);
  const slope = calcSlope(center, north, east);
  const slopeClass = classifySlope(slope);

  const nearbyPoints: SlopePoint[] = [
    { lat, lon, elevationM: center },
    { lat: lat + SLOPE_OFFSET_DEG, lon, elevationM: north },
    { lat, lon: lon + SLOPE_OFFSET_DEG, elevationM: east },
  ];

  return {
    source: "open-elevation",
    lat,
    lon,
    fetchedAt: new Date().toISOString(),
    elevationM: center,
    slopePercent: slope,
    slopeClass,
    slopeLabel: SLOPE_LABELS[slopeClass],
    nearbyPoints,
  };
}

// ---------- OpenTopography API (primário com chave) ----------

async function fetchOpenTopography(lat: number, lon: number, apiKey: string): Promise<ElevationData> {
  // SRTMGL3 tem resolução de 3 arc-seconds (~90m/pixel). Uma bounding box muito pequena
  // (< 0.005°) resulta em HTTP 400 — a API exige área mínima de alguns pixels.
  // Usamos 0.011° (~1.2km), suficiente para ~13×13 pixels, e extraímos o pixel central.
  const BOX = 0.011;
  const params = new URLSearchParams({
    demtype: "SRTMGL3",
    south: (lat - BOX).toFixed(4),
    north: (lat + BOX).toFixed(4),
    west: (lon - BOX).toFixed(4),
    east: (lon + BOX).toFixed(4),
    outputFormat: "AAIGrid",
    API_Key: apiKey,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OPENTOPO_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`OpenTopography HTTP ${res.status}`);

    const text = await res.text();
    const elevation = parseAAIGrid(text, lat, lon);
    return {
      ...elevation,
      source: "opentopography",
      lat,
      lon,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parseia o formato Arc/Info ASCII Grid (AAIGrid) retornado pelo OpenTopography.
 * Formato:
 *   ncols        26
 *   nrows        26
 *   xllcorner    -55.7312
 *   yllcorner    -12.5904
 *   cellsize     0.000833
 *   NODATA_value 0
 *   376 380 377 ...  (nrows linhas, ncols valores por linha)
 */
function parseAAIGrid(
  text: string,
  centerLat: number,
  centerLon: number,
): Omit<ElevationData, "source" | "lat" | "lon" | "fetchedAt"> {
  const lines = text.trim().split(/\r?\n/);

  let ncols = 0;
  let nrows = 0;
  let nodata = -9999;
  let headerCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    const key = parts[0].toLowerCase();
    if (key === "ncols")         { ncols = parseInt(parts[1]); headerCount++; }
    else if (key === "nrows")    { nrows = parseInt(parts[1]); headerCount++; }
    else if (key === "nodata_value") { nodata = parseFloat(parts[1]); headerCount++; }
    else if (["xllcorner","yllcorner","xllcenter","yllcenter","cellsize"].includes(key)) { headerCount++; }
    else break; // primeira linha de dados
  }

  // Monta grid 2D com valores de elevação
  const grid: number[][] = [];
  for (let i = headerCount; i < lines.length; i++) {
    const row = lines[i].trim().split(/\s+/).map(Number);
    if (row.length > 0 && !isNaN(row[0])) grid.push(row);
  }

  if (grid.length === 0) throw new Error("AAIGrid sem dados de elevação");

  // Ponto central (mais próximo da coordenada consultada)
  const cr = Math.floor(grid.length / 2);
  const cc = Math.floor((grid[0]?.length ?? ncols) / 2);

  const centerElev = grid[cr]?.[cc] !== nodata ? (grid[cr]?.[cc] ?? 0) : 0;
  const northElev  = grid[cr - 1]?.[cc] !== nodata ? (grid[cr - 1]?.[cc] ?? centerElev) : centerElev;
  const eastElev   = grid[cr]?.[cc + 1] !== nodata ? (grid[cr]?.[cc + 1] ?? centerElev) : centerElev;

  const slope = calcSlope(centerElev, northElev, eastElev);
  const slopeClass = classifySlope(slope);

  const nearbyPoints: SlopePoint[] = [
    { lat: centerLat,                   lon: centerLon,                   elevationM: Math.round(centerElev) },
    { lat: centerLat + SLOPE_OFFSET_DEG, lon: centerLon,                  elevationM: Math.round(northElev) },
    { lat: centerLat,                   lon: centerLon + SLOPE_OFFSET_DEG, elevationM: Math.round(eastElev) },
  ];

  return {
    elevationM: Math.round(centerElev),
    slopePercent: slope,
    slopeClass,
    slopeLabel: SLOPE_LABELS[slopeClass],
    nearbyPoints,
  };
}

function mockElevationData(lat: number, lon: number): ElevationData {
  return {
    source: "mock",
    lat,
    lon,
    fetchedAt: new Date().toISOString(),
    elevationM: 320,
    slopePercent: 4.5,
    slopeClass: "gentle",
    slopeLabel: SLOPE_LABELS.gentle,
    nearbyPoints: [],
  };
}

/**
 * Retorna dados de elevação e declividade para a coordenada.
 * Usa OpenTopography se OPENTOPO_API_KEY estiver configurada;
 * caso contrário, usa Open-Elevation (público, sem chave).
 * Fallback final para mock em caso de erro.
 */
export async function getTerrain(lat: number, lon: number): Promise<ElevationData> {
  const key = `terrain:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  const apiKey = process.env["OPENTOPO_API_KEY"];

  const fetcher = async (): Promise<ElevationData> => {
    if (apiKey) {
      try {
        return await fetchOpenTopography(lat, lon, apiKey);
      } catch (err) {
        console.warn("[TerrainAdapter] OpenTopography falhou, usando Open-Elevation:", (err as Error).message);
      }
    }
    // Sem chave ou com falha → Open-Elevation público
    return fetchElevationViaOpenElevation(lat, lon);
  };

  try {
    return await cacheOrFetch(key, CACHE_TTL_S, fetcher);
  } catch (err) {
    console.warn("[TerrainAdapter] fallback para mock:", (err as Error).message);
    return mockElevationData(lat, lon);
  }
}
