---
name: Origem central das recomendações
description: Regra de consistência entre risco calculado, causa e recomendação nas personas e agregados.
---

Recomendações do Risk Engine devem seguir uma única cadeia: nível do score final, componente
dominante ponderado, fator interno compatível com esse componente e recomendação.

**Why:** selecionar candidatos independentes por tela ou fator pode exibir uma ação cuja causa
contradiz o score, o componente dominante ou o resumo agregado apresentado ao usuário.

**How to apply:** operação, máquina, área, cliente, próxima ação e consolidado Admin devem
consumir o mesmo gerador central. A persona pode mudar apenas a linguagem; categoria, fator,
prioridade e justificativa causal permanecem equivalentes para o mesmo resultado.

Explicações por persona devem receber o mesmo resultado ponderado e os pesos ativos, sem
recalcular valores na camada de apresentação.

**Why:** explicações locais ou agregações paralelas podem mostrar score, componente ou fator
diferentes dos usados pela recomendação.

**How to apply:** organize os campos existentes do resultado central em variantes de linguagem.
Em cenário balanceado, declare a ausência de macrocomponente dominante e trate o fator interno
apenas como ponto de atenção, não como prova de predominância climática ou operacional.

Inclinação pertence somente ao fluxo separado de segurança por telemetria.

**Why:** ela não integra o score nem os fatores internos do Risk Engine.

**How to apply:** nunca inclua inclinação nas recomendações do motor ou em agregações de risco;
apresente eventual orientação de inclinação explicitamente como segurança imediata por telemetria.