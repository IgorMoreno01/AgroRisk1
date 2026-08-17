// ============================================================
// AgroRisk · RoutingAdapter — openrouteservice (requer ORS_API_KEY)
// https://openrouteservice.org/dev/#/api-docs/v2/directions
// ============================================================

import { cacheOrFetch } from "../cache.server";
import type { RouteData, Route, RouteStep } from "../external-data.types";

const ORS_BASE = "https://api.openrouteservice.org/v2/directions/driving-hgv/json";
const TIMEOUT_MS = 10_000;
const CACHE_TTL_S = 15 * 60; // 15 minutos

function durationLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function distanceLabel(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
  return `${Math.round(meters)} m`;
}

interface OrsSegmentStep {
  instruction: string;
  distance: number;
  duration: number;
}

interface OrsRoute {
  summary: { distance: number; duration: number };
  segments: Array<{ steps: OrsSegmentStep[] }>;
}

interface OrsResponse {
  routes: OrsRoute[];
}

function parseRoute(r: OrsRoute): Route {
  const steps: RouteStep[] = (r.segments ?? []).flatMap((seg) =>
    (seg.steps ?? []).map((s) => ({
      instruction: s.instruction,
      distanceM: Math.round(s.distance),
      durationS: Math.round(s.duration),
    })),
  );
  return {
    distanceM: Math.round(r.summary.distance),
    durationS: Math.round(r.summary.duration),
    durationLabel: durationLabel(r.summary.duration),
    distanceLabel: distanceLabel(r.summary.distance),
    steps,
  };
}

async function fetchFromORS(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  apiKey: string,
): Promise<RouteData> {
  const body = {
    coordinates: [
      [originLon, originLat],
      [destLon, destLat],
    ],
    instructions: true,
    alternative_routes: { share_factor: 0.6, target_count: 2 },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ORS_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ORS HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as OrsResponse;
    const [primary, alt] = data.routes;
    if (!primary) throw new Error("ORS retornou sem rotas");

    return {
      source: "openrouteservice",
      origin: { lat: originLat, lon: originLon },
      destination: { lat: destLat, lon: destLon },
      fetchedAt: new Date().toISOString(),
      primary: parseRoute(primary),
      alternative: alt ? parseRoute(alt) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mockRouteData(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
): RouteData {
  // Distância euclidiana aproximada convertida para metros
  const approxDistM = Math.round(
    haversineM(originLat, originLon, destLat, destLon),
  );
  const approxDurS = Math.round(approxDistM / 8); // ~28 km/h campo
  return {
    source: "mock",
    origin: { lat: originLat, lon: originLon },
    destination: { lat: destLat, lon: destLon },
    fetchedAt: new Date().toISOString(),
    primary: {
      distanceM: approxDistM,
      durationS: approxDurS,
      durationLabel: durationLabel(approxDurS),
      distanceLabel: distanceLabel(approxDistM),
      steps: [],
    },
    alternative: null,
  };
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

/**
 * Calcula rota entre dois pontos usando openrouteservice.
 * Requer a variável de ambiente ORS_API_KEY.
 * Fallback para cálculo euclidiano mock se a chave não estiver configurada.
 */
export async function getRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
): Promise<RouteData> {
  const apiKey = process.env["ORS_API_KEY"];

  if (!apiKey) {
    console.warn("[RoutingAdapter] ORS_API_KEY não configurada — usando mock.");
    return mockRouteData(originLat, originLon, destLat, destLon);
  }

  const key = `route:${originLat.toFixed(4)}:${originLon.toFixed(4)}:${destLat.toFixed(4)}:${destLon.toFixed(4)}`;
  try {
    return await cacheOrFetch(key, CACHE_TTL_S, () =>
      fetchFromORS(originLat, originLon, destLat, destLon, apiKey),
    );
  } catch (err) {
    console.warn("[RoutingAdapter] fallback para mock:", (err as Error).message);
    return mockRouteData(originLat, originLon, destLat, destLon);
  }
}
