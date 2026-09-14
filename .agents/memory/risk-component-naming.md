---
name: Macrocomponentes de risco
description: Nomenclatura conceitual dos componentes ponderados pela Sompo e papel futuro do ML.
---

Em todas as personas, instruções explícitas de 2026-09-12 exigem **Score ML**, **Score Operacional** e **Score Final**, usando os valores reais do V2. Não chamar todo o ML de Climático: ele reúne Clima, Estrutura e Histórico.

Identificadores internos como `ml` e `operational_rules` não autorizam apresentar o score relativo como probabilidade calibrada.

**Why:** todas as personas precisam distinguir o score relativo ML de seus sinais Clima/Estrutura/Histórico, sem alterar o modelo.

**How to apply:** exiba somente saídas existentes do V2, sem inventar outro modelo ou probabilidade. Use termos climáticos apenas para features realmente climáticas. Não altere matemática, pesos ou contratos internos por causa da apresentação.