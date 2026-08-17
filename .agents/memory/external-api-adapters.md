---
name: External API adapters
description: Arquitetura e decisões dos 4 adapters de API externa do AgroRisk.
---

## Regra geral
Frontend → `*.functions.ts` (createServerFn) → `adapters/*.server.ts` → API externa → tipo normalizado → Risk Engine.
Nunca chamar APIs externas diretamente do frontend.

## Adapters implementados
- `src/lib/adapters/climate.server.ts` — ClimateAdapter (Open-Meteo, sem chave)
- `src/lib/adapters/water-geo.server.ts` — WaterGeoAdapter (Overpass/OSM, sem chave)
- `src/lib/adapters/routing.server.ts` — RoutingAdapter (openrouteservice, chave `ORS_API_KEY`)
- `src/lib/adapters/terrain.server.ts` — TerrainAdapter (OpenTopography com `OPENTOPO_API_KEY`; fallback público Open-Elevation sem chave)

## Server functions (endpoints internos)
- `src/lib/api/weather.functions.ts` → `getWeather({ data: { lat, lon } })`
- `src/lib/api/water-geo.functions.ts` → `getWaterFeatures({ data: { lat, lon, radiusM? } })`
- `src/lib/api/routing.functions.ts` → `getRouting({ data: { originLat, originLon, destLat, destLon } })`
- `src/lib/api/terrain.functions.ts` → `getElevation({ data: { lat, lon } })`

## Tipos normalizados
`src/lib/external-data.types.ts` — WeatherData, WaterGeoData, RouteData, ElevationData.

## Cache
`src/lib/cache.server.ts` — TTL: clima 10min, água 30min, rota 15min, terreno 1h.

## Coordenadas aproximadas (mock GPS)
`src/lib/area-coordinates.ts` — lookup por areaId/clientId. Sorriso/MT, Cascavel/PR, Rio Verde/GO.

## Integração no dashboard
`src/routes/operador.tsx` — usa `useEffect` + `useState` para buscar clima e hidrografia.
Score recalculado com dados reais via `inputsForOperationWithOverrides` + `deriveWeatherFromReal` + `deriveWaterDistanceFromReal`.
Badges indicam fonte real (Open-Meteo/OSM) ou fallback simulado.

**Why:** Adapters isolados permitem trocar cada API sem tocar no frontend. Fallback para mock garante que o dashboard nunca quebra por indisponibilidade de API. Chaves ficam exclusivamente no server-side (`.server.ts`).

**How to apply:** Ao adicionar nova API, criar adapter em `adapters/*.server.ts`, server fn em `api/*.functions.ts`, e só então integrar no componente via useEffect.
