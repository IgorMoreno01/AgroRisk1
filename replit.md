# AgroGuard Vision (AgroRisk)

Agricultural risk monitoring MVP with multi-profile dashboards, deterministic
risk scoring, and server-side adapters for weather, hydrology, routing, and
terrain data. The project still uses in-memory demo domain data and is not a
production telemetry system.

## Source of truth

Read [`docs/arquitetura-da-solucao.md`](docs/arquitetura-da-solucao.md) before
changing architecture, integrations, authentication, score rules, cache
behavior, or Replit configuration. It documents the current implementation,
known limitations, and the maintenance checklist.

## Stack

- **Framework:** React 19 + TanStack Router/Start (SSR)
- **Styling:** Tailwind CSS v4 + shadcn/ui (Radix UI)
- **Charts:** Recharts
- **Build tool:** Vite 8 (via `@lovable.dev/vite-tanstack-config`)
- **Package manager:** Bun

## How to run

```sh
bun run dev
```

The dev server starts on **port 5000** (`0.0.0.0`).

## Profiles & demo passwords

| Profile | Password |
|---|---|
| Gestor | `gestor123` |
| Operador | `operador123` |
| Consultor / Corretor | `consultor123` |
| Admin / Sompo | `admin123` |

## Notes

- Domain entities remain simulated and in memory; there is no database,
  telemetry, live GPS, or persistent CRUD.
- External adapters are active server-side integrations: Open-Meteo,
  Overpass/OpenStreetMap, openrouteservice, OpenTopography, and the
  Open-Elevation terrain fallback. SoilGrids remains demonstrative.
- External API keys must stay in Replit Secrets and must never reach the
  browser. See the architecture document for variable names and fallback
  semantics.
- The real route polyline mini-map and operation time remaining are not
  implemented yet.
- Originally built with [Lovable](https://lovable.dev/projects/0b234084-aa5d-40e8-9d24-43c60b3e1443).
- IPv6 (`::`) is not supported in this environment; the server is pinned to `0.0.0.0`.

## User preferences

- Keep the existing project structure and stack.
