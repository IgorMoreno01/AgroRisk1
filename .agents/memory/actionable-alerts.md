---
name: Alertas acionáveis por destinatário
description: Regra de isolamento, persistência e origem dos alertas acionáveis.
---

Cada alerta acionável pertence a um usuário destinatário, e visualização ou reconhecimento por uma conta nunca altera o estado de outra conta.

**Why:** Operador, Gestor, Consultor e Admin podem receber o mesmo evento, mas precisam manter ciência e reconhecimento independentes. O cliente não pode ampliar o próprio escopo enviando IDs operacionais.

**How to apply:** Aceite no cliente apenas token e ID do alerta. Em cada listagem ou transição, recarregue a sessão, exija o destinatário autenticado e valide o escopo atual da persona no servidor. Manutenção e inclinação podem originar alertas, mas permanecem fora do cálculo de risco.

Alertas ativos são únicos por destinatário e evento lógico. Em manutenção, também existe no máximo uma condição ativa por destinatário, máquina e tipo; uma mudança para `overdue` resolve a condição anterior antes de ativar a nova.

**Why:** Fan-out por destinatário não deve ser confundido com duplicação de eventos. Sem chaves e restrições parciais, reprocessamentos ou mudanças de condição poderiam causar fadiga de alertas.

**How to apply:** Use a chave lógica do evento sem o destinatário, preserve resolvidos como histórico, exclua-os da lista principal e do badge, e ordene ativos por severidade antes da recência.