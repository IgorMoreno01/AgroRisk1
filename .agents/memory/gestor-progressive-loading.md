---
name: Carregamento progressivo do Gestor
description: Regra de separação entre a carteira relacional do Gestor e avaliações V2 progressivas.
---

O Gestor deve renderizar clientes, áreas, máquinas, operações e alertas persistentes antes de qualquer avaliação V2. A operação ativa e os itens visíveis entram primeiro; rankings avançam sob demanda em lotes de até 12.

**Why:** o snapshot eager tentava avaliar toda a carteira antes da tela e não concluía em 300 segundos. A Fase A isolada foi medida em 48 ms.

**How to apply:** consulte contextos PostgreSQL somente para os IDs autorizados do batch; identifique agregados e rankings parciais, mantenha retry seguro e nunca carregue automaticamente toda a carteira.

Demanda explícita vazia significa nenhuma avaliação; não reutilize a interpretação de “seleção inicial padrão” para detalhes fechados ou uma página sem itens pendentes. Erros não são novos eventos de demanda.

**Why:** tratar uma seleção vazia como seleção padrão disparou um segundo batch automático logo após a prioridade. Reagir à publicação de erros como demanda também pode criar retry infinito.