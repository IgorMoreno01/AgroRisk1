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

A inclinação é exclusivamente uma camada de segurança operacional: pode gerar classificação,
alerta, orientação ao operador, acionamento de buzzer e registro, mas nunca pontos, contribuição
operacional ou climática, score final ou fator dominante.

**Why:** a leitura do ESP32 + MPU6050 representa uma condição imediata de segurança e deve
continuar acionável sem alterar o cálculo atuarial do risco.

**How to apply:** mantenha a inclinação fora do breakdown matemático e dos pesos Sompo. Regras
de segurança podem consultar diretamente a leitura em graus, independentemente do score.

O componente dominante deve comparar as contribuições ponderadas finais de clima e operação,
não apenas os percentuais configurados. Contribuições iguais resultam em componente balanceado.

**Why:** o peso isolado não representa predominância quando o score-base do outro componente é
maior; a contribuição combina corretamente intensidade do risco e configuração Sompo.

**How to apply:** todas as personas devem consumir o componente retornado pelo Risk Engine. O
fator interno dominante permanece separado e vem exclusivamente das partes do breakdown.