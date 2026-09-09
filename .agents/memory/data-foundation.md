---
name: Fundação de dados estruturados
description: Decisão de migração gradual dos mocks para PostgreSQL sem acoplar telas à persistência.
---

Use o PostgreSQL gerenciado do Replit para os dados relacionais do AgroRisk e mantenha o acesso
atrás de um contrato de repositório que produza os mesmos modelos consumidos atualmente.

**Why:** cliente, unidade, área, máquina, operador e operação exigem integridade relacional, mas
uma troca direta de imports nas telas colocaria as quatro personas e o Risk Engine em risco.

**How to apply:** mantenha o repositório mock como padrão até uma etapa explícita de migração.
Banco, conexão e validação de linhas permanecem server-side. A carga deve respeitar chaves
compostas que impedem cruzamento entre clientes, áreas, máquinas, operadores e operações.

Dados geográficos e ambientais devem ter origem documentada; nomes de clientes, operadores e
IDs internos podem ser sintéticos.

**Why:** separar campos ancorados e sintéticos evita apresentar dados inventados como observações
reais e facilita auditoria futura.

**How to apply:** registre fonte e contexto nos campos estruturados/JSON do schema e não gere
registros até a tarefa específica de carga ser aprovada.