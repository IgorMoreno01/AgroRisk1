---
name: Macrocomponentes de risco
description: Nomenclatura conceitual dos componentes ponderados pela Sompo e papel futuro do ML.
---

Nas personas fora do Admin, os macrocomponentes continuam apresentados como **Climático** e **Operacional**. No Admin/Sompo, a instrução explícita de 2026-09-12 substitui essa nomenclatura visual: apresentar **Score ML**, **Score Operacional** e **Score Final**, usando os valores reais do V2. Não chamar todo o ML de Climático.

Identificadores internos como `ml` e `operational_rules` não autorizam apresentar o score relativo como probabilidade calibrada.

**Why:** A referência visual aprovada para recuperar o Admin exige distinguir o score relativo ML de seus sinais Clima/Estrutura/Histórico, sem alterar o modelo ou propagar essa mudança às outras personas.

**How to apply:** No Admin, exiba somente saídas existentes do V2, sem inventar outro modelo ou probabilidade. Fora do Admin, mantenha a nomenclatura Climático/Operacional. Não altere matemática, pesos ou contratos internos por causa dos rótulos.