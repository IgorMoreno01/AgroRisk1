---
name: Configuração de pesos de risco
description: Decisões de persistência, segurança e propagação dos pesos V1 e V2 no MVP.
---

Os pesos de risco são autoritativos apenas no servidor. Os pesos V2 de ML e regras
operacionais usam configuração persistente global, override opcional por cliente e default
imutável 70/30 como último fallback.

**Why:** armazenamento no navegador ou um singleton de processo permitiria divergência entre
instâncias e não garantiria que todas as personas usassem a mesma configuração Sompo.

**How to apply:** somente Admin/Sompo grava. Toda avaliação resolve no servidor pelo cliente
derivado da operação e segue `override do cliente → global → default`; nunca aceite um
`clientId` livre para escolher pesos.

Caches de avaliações V2 devem ser particionados pela configuração efetiva completa:
cliente, origem, revisão e valores. Lotes multi-cliente resolvem uma vez por cliente; o
Operador resolve somente depois de carregar sua operação autorizada.

**Why:** chaves baseadas apenas nos percentuais ou no usuário podem reutilizar resultados após
uma alteração de revisão ou misturar overrides entre clientes.

**How to apply:** use a assinatura efetiva nos caches e in-flight maps. Configuração persistida
inválida deve interromper a avaliação explicitamente; falhas comuns de infraestrutura podem
seguir o fallback relacional completo para mock.

A interface Admin separa explicitamente Padrão Sompo, herança global e personalização por
cliente. Selecionar cliente ou mover o draft nunca cria override; isso exige ação de
personalizar seguida de save com revisão.

**Why:** criar override implicitamente torna a origem efetiva ambígua e impede que mudanças
globais alcancem clientes que deveriam continuar herdando o padrão.

**How to apply:** descarte respostas tardias em toda troca de escopo, use operação do próprio
cliente no preview e bloqueie novas mutações após conflito até recarregar a revisão atual.

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