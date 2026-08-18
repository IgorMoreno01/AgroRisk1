#!/bin/bash
set -e

# Post-merge setup — AgroRisk / AgroGuard Vision
# Idempotente, não-interativo. Roda após cada merge de task agent.

echo "[post-merge] Instalando dependências..."
bun install --frozen-lockfile

echo "[post-merge] Verificando build TypeScript..."
bun run tsc --noEmit --skipLibCheck 2>/dev/null || true

echo "[post-merge] Concluído."
