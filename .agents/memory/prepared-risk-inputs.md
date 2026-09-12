---
name: Inputs de risco preparados
description: Providers externos alimentam snapshots por operação fora do runtime; o V2 sempre recalcula o score.
---

APIs externas só podem participar do processo separado de preparação. Abertura de telas, batches, seleção e cálculo de score devem ler inputs preparados por operação ou usar a política oficial de missing/synthetic, sem buscar providers.

**Why:** o score precisa ser rápido, reproduzível e independente da disponibilidade da internet, mas pesos, modelo, regras, nível e drivers devem continuar sendo calculados pelo Risk Engine V2 em cada avaliação.

**How to apply:** persista apenas inputs, coordenadas, proveniência, referência, versão e timestamps. Nunca persista scores ou classificação. Snapshot ausente ou incompatível não autoriza correção automática por API no runtime.