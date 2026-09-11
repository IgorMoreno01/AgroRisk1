import { cacheGet, cacheSet } from "../cache.server";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 8_000;
const CACHE_TTL_S = 30 * 24 * 60 * 60;
const inFlight = new Map<string, Promise<GeocodedLocation | null>>();
const STATE_NAMES: Record<string, string> = {
  AC: "acre", AL: "alagoas", AP: "amapa", AM: "amazonas", BA: "bahia",
  CE: "ceara", DF: "distrito federal", ES: "espirito santo", GO: "goias",
  MA: "maranhao", MT: "mato grosso", MS: "mato grosso do sul", MG: "minas gerais",
  PA: "para", PB: "paraiba", PR: "parana", PE: "pernambuco", PI: "piaui",
  RJ: "rio de janeiro", RN: "rio grande do norte", RS: "rio grande do sul",
  RO: "rondonia", RR: "roraima", SC: "santa catarina", SP: "sao paulo",
  SE: "sergipe", TO: "tocantins",
};

export interface GeocodedLocation {
  source: "open-meteo-geocoding";
  latitude: number;
  longitude: number;
  municipality: string;
  state: string;
}

export interface OpenMeteoGeocodingResponse {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country_code?: string;
    admin1?: string;
  }>;
}

const normalized = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

async function fetchLocation(municipality: string, state: string): Promise<GeocodedLocation> {
  const params = new URLSearchParams({
    name: municipality,
    count: "10",
    language: "pt",
    format: "json",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${GEOCODING_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Open-Meteo Geocoding HTTP ${response.status}`);
    const payload = (await response.json()) as OpenMeteoGeocodingResponse;
    const match = selectGeocodedLocation(payload, municipality, state);
    if (!match) {
      throw new Error(`Município não encontrado: ${municipality}/${state}`);
    }
    return match;
  } finally {
    clearTimeout(timer);
  }
}

export function selectGeocodedLocation(
  payload: OpenMeteoGeocodingResponse,
  municipality: string,
  state: string,
): GeocodedLocation | null {
  const municipalityKey = normalized(municipality);
  const stateKey = STATE_NAMES[state.trim().toUpperCase()] ?? normalized(state);
  const match = (payload.results ?? []).find(
    (item) =>
      item.country_code === "BR" &&
      normalized(item.name) === municipalityKey &&
      item.admin1 !== undefined &&
      normalized(item.admin1) === stateKey &&
      Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude),
  );
  return match
    ? {
        source: "open-meteo-geocoding",
        latitude: match.latitude,
        longitude: match.longitude,
        municipality: match.name,
        state: match.admin1!,
      }
    : null;
}

export async function geocodeMunicipality(
  municipality: string,
  state: string,
): Promise<GeocodedLocation | null> {
  if (!municipality.trim() || !state.trim()) return null;
  const key = `geocode:${normalized(municipality)}:${normalized(state)}`;
  const cached = cacheGet<GeocodedLocation | null>(key);
  if (cached !== undefined) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      const location = await fetchLocation(municipality, state);
      cacheSet(key, location, CACHE_TTL_S);
      return location;
    } catch (error) {
      console.warn("[LocationAdapter] geocodificação indisponível:", (error as Error).message);
      cacheSet(key, null, 5 * 60);
      return null;
    }
  })();
  inFlight.set(key, request);
  try { return await request; } finally { inFlight.delete(key); }
}