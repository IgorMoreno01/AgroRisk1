---
name: Carregamento progressivo do Admin
description: Regra de UX e consistência para separar dados relacionais de avaliações V2 no Admin/Sompo.
---

O Admin deve entregar primeiro os dados relacionais e carregar avaliações V2 em lotes pequenos, priorizados e sob demanda. Agregados globais só podem aparecer quando sua cobertura estiver completa.

**Why:** avaliar toda a carteira antes da primeira renderização levou cerca de 134 segundos, embora PostgreSQL e montagem local levassem menos de 200 ms.

**How to apply:** mudanças futuras no Admin não devem recolocar chamadas externas no caminho da primeira resposta; estados sem cobertura mostram “Calculando...” e nunca scores provisórios.