---
name: External API adapters
description: Arquitetura e decisões dos 4 adapters de API externa do AgroRisk, incluindo armadilhas conhecidas.
---

## Regra geral
Frontend → `*.functions.ts` (createServerFn) → `adapters/*.server.ts` → API externa → tipo normalizado → Risk Engine.
Nunca chamar APIs externas diretamente do frontend.

## Adapters implementados
- `src/lib/adapters/climate.server.ts` — ClimateAdapter (Open-Meteo, sem chave)
- `src/lib/adapters/water-geo.server.ts` — WaterGeoAdapter (Overpass/OSM, sem chave)
- `src/lib/adapters/routing.server.ts` — RoutingAdapter (openrouteservice, chave `ORS_API_KEY`)
- `src/lib/adapters/terrain.server.ts` — TerrainAdapter (OpenTopography, chave `OPENTOPO_API_KEY`; fallback Open-Elevation)

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

## Armadilhas conhecidas

### OpenTopography
- `outputFormat=JSON` com SRTMGL3 retorna `application/octet-stream` (GeoTIFF binário) → `res.json()` falha com HTTP 400 em algumas combinações.
- **Fix aplicado**: usar `outputFormat=AAIGrid` (ASCII puro, parseável) + bounding box mínima de `0.011°` em cada lado (total 0.022°). Box menor causa HTTP 400.
- Parser AAIGrid implementado em `parseAAIGrid()` no mesmo arquivo.

### Open-Meteo histórico para o Risk Engine V2
- O Archive API não oferece média diária de `wind_speed_10m`; solicite vento horário e calcule a média de D-1 antes de converter km/h para m/s.
- Para evitar leakage e dados parciais, só publique clima quando houver exatamente os 7/30 dias esperados e 24 horas finitas em D-1; caso contrário, mantenha `null`.
- Cacheie a série por coordenada/ano e derive cada data localmente. Compartilhe requests em andamento e use TTL curto para falhas, evitando fan-out e 429 na carteira.

**Why:** solicitar vento médio em `daily` causou HTTP 400, e uma chamada por operação gerou rate limit na carteira de 500 cenários.

**How to apply:** novos consumidores de histórico devem reutilizar a série anual normalizada e nunca preencher janelas incompletas.

### openrouteservice
- Perfil `driving-hgv` não encontra pontos roteáveis em áreas rurais/agrícolas (raio máximo 350m sem estrada HGV certificada).
- **Fix aplicado**: usar perfil `driving-car` que cobre estradas rurais.
- A origem simulada (+0.045° de offset) pode cair em área sem cobertura — testar sempre com curl antes de aumentar offset.

### Overpass / OSM
- HTTP 406 aparece intermitentemente (rate limit ou query format). Adapter já tem fallback para mock.
- Para risco por distância, `center` de way/relation não representa o ponto mais próximo da água. Solicite `out geom`, calcule a menor distância aos segmentos e descarte feições sem geometria.
- Não arredonde `nearestDistanceM` antes dos limites de 50/100/150 m; cache hidrográfico deve preservar precisão submétrica da coordenada.

**Why:** centros de rios e reservatórios longos classificavam operações próximas como distantes, e arredondamento podia atravessar thresholds operacionais.

**How to apply:** somente geometria Overpass real pode gerar `hydrography_api`; respostas mock, incompletas ou sem distância finita permanecem sintéticas.

## Integração no dashboard Operador
`src/routes/operador.tsx` — usa `useEffect` + `useState` para buscar clima, hidrografia, rota e elevação.
Score recalculado com dados reais via `inputsForOperationWithOverrides` + `deriveWeatherFromReal` + `deriveWaterDistanceFromReal`.

## Componente de dados externos
`src/components/external-data-sections.tsx` — 7 seções: ClimateSection, WaterFeaturesSection, RoutingSection, TerrainSection, SoilDemoSection, DataSourcesPanel, RiskFactorsWithSources.
Status "Conectado" só aparece quando `source` é a API real (não fallback).

**Why:** Adapters isolados permitem trocar cada API sem tocar no frontend. Fallback para mock garante que o dashboard nunca quebra por indisponibilidade de API.

**How to apply:** Ao adicionar nova API, criar adapter em `adapters/*.server.ts`, server fn em `api/*.functions.ts`, e só então integrar no componente via useEffect. Testar sempre com curl direto antes de codificar.
