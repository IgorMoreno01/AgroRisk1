---
name: Macrocomponentes de risco
description: Nomenclatura conceitual dos componentes ponderados pela Sompo e papel futuro do ML.
---

Os dois macrocomponentes ponderados pela Sompo são **Climático** e **Operacional**. Use score, peso e contribuição climáticos; e score, peso e contribuição operacionais. Não apresente “ML” ou “regras operacionais” como nomes desses macrocomponentes.

O ML será integrado posteriormente apenas como fonte de probabilidades. Identificadores internos legados do motor podem continuar usando nomes como `ml` e `operational_rules` enquanto forem contratos técnicos, mas nunca devem definir a nomenclatura exibida.

**Why:** Chamar os componentes de “ML” e “regras operacionais” descreve uma arquitetura que não corresponde ao modelo conceitual definido pela Sompo.

**How to apply:** Em qualquer interface, explicação, relatório ou DTO de apresentação, traduza os componentes internos para Climático e Operacional sem alterar matemática, pesos ou contratos internos do Risk Engine.