---
name: Alertas acionáveis por destinatário
description: Regra de isolamento, persistência e origem dos alertas acionáveis.
---

Cada alerta acionável pertence a um usuário destinatário, e visualização ou reconhecimento por uma conta nunca altera o estado de outra conta.

**Why:** Operador, Gestor, Consultor e Admin podem receber o mesmo evento, mas precisam manter ciência e reconhecimento independentes. O cliente não pode ampliar o próprio escopo enviando IDs operacionais.

**How to apply:** Aceite no cliente apenas token e ID do alerta. Em cada listagem ou transição, recarregue a sessão, exija o destinatário autenticado e valide o escopo atual da persona no servidor. Manutenção e inclinação podem originar alertas, mas permanecem fora do cálculo de risco.