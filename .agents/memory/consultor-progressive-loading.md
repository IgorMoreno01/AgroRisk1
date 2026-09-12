---
name: Carregamento progressivo do Consultor
description: Regra de isolamento entre carteira relacional e avaliações V2 na persona Consultor/Corretor.
---

O Consultor deve carregar primeiro a lista autorizada e as relações básicas somente do cliente inicial. Scores V2 entram depois, em lotes de até 12 por cliente selecionado; outros clientes permanecem on-demand.

**Why:** o fluxo eager avaliava 500 operações e até 2.000 enriquecimentos antes da tela, levando cerca de 39 segundos. A Fase A isolada foi medida em 236 ms.

**How to apply:** mantenha contextos V2 e overview fora da primeira resposta; priorize operação ativa e cards visíveis, use “Calculando...” sem score provisório e revalide o cliente no servidor.