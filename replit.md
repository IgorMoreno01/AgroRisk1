# AgroGuard Vision (AgroRisk)

Agricultural risk monitoring MVP — a visually-driven platform with multi-profile dashboards, KPI cards, risk rankings, and charts using simulated data.

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

- All data is simulated — no external APIs, telemetry, or real integrations.
- Originally built with [Lovable](https://lovable.dev/projects/0b234084-aa5d-40e8-9d24-43c60b3e1443).
- IPv6 (`::`) is not supported in this environment; the server is pinned to `0.0.0.0`.

## User preferences

- Keep the existing project structure and stack.
