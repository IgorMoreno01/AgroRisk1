---
name: Carregamento progressivo do Consultor
description: Regra de isolamento entre carteira relacional e avaliações V2 na persona Consultor/Corretor.
---

O Consultor deve carregar primeiro a lista e as relações básicas de todos os clientes autorizados, sem contextos V2. Cada seleção avalia uma operação prioritária; cada clique adicional avalia até três novas máquinas, com no máximo uma operação representativa por máquina.

**Why:** o fluxo eager avaliava 500 operações e até 2.000 enriquecimentos antes da tela, levando cerca de 39 segundos. A Fase A isolada foi medida em 236 ms.

**How to apply:** mantenha contextos V2 e overview fora da primeira resposta; traga relações PostgreSQL de todo o escopo autorizado, deduplique por máquina e operação, preserve os resultados visíveis e descarte respostas após troca de cliente.