---
name: Registro de execução do Operador
description: Limites de dados e autorização para o registro operacional persistido.
---

Registros de início, observação e encerramento representam a execução da operação, não a operação planejada. Eles devem permanecer separados e não podem alimentar score, componentes de risco, pesos, recomendações, ML, probabilidades, inclinação ou integrações externas sem uma aprovação explícita.

**Why:** separar planejamento de execução preserva o contrato atual de risco e evita que texto operacional não interpretado altere decisões ou classificações.

**How to apply:** derive o Operador da sessão no servidor, valide a operação atual contra esse vínculo e não aceite IDs de Operador, operação ou máquina como fonte de verdade do navegador. Para novas personas, aplique escopo relacional aos mesmos registros em vez de duplicá-los.