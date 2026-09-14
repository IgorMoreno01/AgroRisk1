---
name: Orquestração de carregamento
description: Restrição transversal de UX: IMMEDIATE, PRIORITY e ON_DEMAND, sem antecipar carteira.
---

Classifique dados apenas como IMMEDIATE, PRIORITY ou ON_DEMAND. IMMEDIATE não pode depender do V2 nem de providers; PRIORITY publica uma operação visível antes de liberar demandas secundárias; ON_DEMAND exige necessidade explícita da tela.

**Why:** o objetivo acordado é tornar a interface utilizável e mostrar o risco visível, não acelerar o cálculo das 500 operações. Um batch pequeno ainda bloqueava o primeiro score pelo item mais lento.

**How to apply:** preserve essa separação ao adicionar abas, filtros e retry. Não trate ordenação dentro de um batch como publicação prioritária. Demanda secundária nunca deve invalidar a resposta prioritária; erros devem permanecer associados à operação e permitir nova tentativa.