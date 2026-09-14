---
name: Manutenção preventiva
description: Regras de autorização, origem e separação do módulo de manutenção do Operador.
---

A manutenção preventiva do Operador é sempre resolvida server-side a partir da sessão, do Operador vinculado e da máquina da operação atual. O navegador não escolhe a máquina.

**Why:** aceitar um identificador de máquina do cliente permitiria leitura fora do escopo do Operador.

**How to apply:** mantenha registros sintéticos identificados e determinísticos até existirem dados reais. Classifique vencimento por dias de calendário em São Paulo: vencido, até sete dias ou em dia.

A manutenção não participa do Risk Engine, ML, pesos, recomendações, probabilidades ou inclinação sem uma decisão futura explícita.

**Why:** ainda não há telemetria suficiente para tratar manutenção como fator preditivo ou de risco.

**How to apply:** use sempre o termo “manutenção preventiva” e mantenha o módulo como contexto operacional independente.