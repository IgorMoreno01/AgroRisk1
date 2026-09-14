---
name: Inputs de risco preparados
description: Providers externos alimentam snapshots por operação fora do runtime; o V2 sempre recalcula o score.
---

APIs externas só podem alimentar o score no processo separado de preparação. Dados observacionais atuais podem ser carregados após a primeira renderização, em fluxo independente, e nunca entrar no contexto, resultado ou disponibilidade do Risk Engine.

**Why:** o score precisa ser rápido, reproduzível e independente da disponibilidade da internet, mas pesos, modelo, regras, nível e drivers devem continuar sendo calculados pelo Risk Engine V2 em cada avaliação.

**How to apply:** persista apenas inputs, coordenadas, proveniência, referência, versão e timestamps. Nunca persista scores ou classificação. Clima atual deve ter loading/falha próprios e não pode ser apresentado como dado usado pelo ML.