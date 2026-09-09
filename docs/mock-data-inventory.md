# Inventário de dados mockados

## Fonte principal

- `src/lib/mock-data.ts`: contratos e registros de clientes, usuários, áreas, máquinas,
  fatores de risco, recomendações legadas, operações, alertas, histórico, tendência e perfis.
- `src/lib/profile-alerts.ts`: textos de alertas por persona.
- Fallbacks simulados dos adaptadores externos ficam em `src/lib/adapters/`; eles não representam
  o catálogo relacional principal.

## Contratos preservados

- `Client`
- `Area`
- `Machine`
- `Operation`
- `Alert`
- `HistoryEntry`

Campos marcados como compatibilidade em `mock-data.ts` continuam sendo produzidos pelo
repositório PostgreSQL por aliases e joins.

## Consumidores diretos

- Telas: `src/routes/admin.tsx`, `src/routes/gestor.tsx`, `src/routes/operador.tsx`,
  `src/routes/consultor.tsx` e `src/routes/index.tsx`.
- Componentes: `src/components/app-layout.tsx`, `src/components/header-menus.tsx`,
  `src/components/area-detail-dialog.tsx` e `src/components/machine-detail-dialog.tsx`.
- Regras existentes: `src/lib/auth.tsx`, `src/lib/risk-score.ts`, `src/lib/ranking.ts`
  e `src/lib/recommendations.ts`.

## Estado desta etapa

Os consumidores acima permanecem ligados aos mocks. A futura migração poderá trocar a origem
por `getAgroRiskRepository("postgres")` em funções server-side, mantendo os contratos listados.