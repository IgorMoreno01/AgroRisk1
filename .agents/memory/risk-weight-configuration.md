---
name: Configuração de pesos de risco
description: Decisão de persistência e segurança para os pesos climático e operacional no MVP.
---

Os pesos de risco climático e operacional são autoritativos apenas no servidor e usam
um singleton em memória no MVP, com padrão 50/50 e soma obrigatória de 100.

**Why:** o projeto não tinha banco, schema ou migrations. Usar armazenamento do
navegador permitiria que qualquer perfil adulterasse a fonte de verdade e não resolveria
autorização.

**How to apply:** toda gravação deve exigir uma sessão assinada autorizada para a área
Admin/Sompo. Interfaces de outros perfis apenas leem a configuração compartilhada. Em uma
evolução para persistência de produção, mantenha o contrato de pesos e a validação
server-side, adicionando auditoria e armazenamento durável sem deslocar a autoridade para
o cliente.