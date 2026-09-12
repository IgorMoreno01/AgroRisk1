---
name: Macrocomponentes de risco
description: Nomenclatura conceitual dos componentes ponderados pela Sompo e papel futuro do ML.
---

No Admin/Sompo e no Consultor, instruções explícitas de 2026-09-12 exigem **Score ML**, **Score Operacional** e **Score Final**, usando os valores reais do V2. Gestor e Operador mantêm a nomenclatura visual já aprovada. Não chamar todo o ML de Climático no Consultor: ele reúne Clima, Estrutura e Histórico.

Identificadores internos como `ml` e `operational_rules` não autorizam apresentar o score relativo como probabilidade calibrada.

**Why:** Admin e Consultor precisam distinguir o score relativo ML de seus sinais Clima/Estrutura/Histórico, sem alterar o modelo nem propagar a mudança ao Gestor ou Operador.

**How to apply:** No Admin e Consultor, exiba somente saídas existentes do V2, sem inventar outro modelo ou probabilidade. Preserve os rótulos atuais das outras personas. Não altere matemática, pesos ou contratos internos por causa da apresentação.