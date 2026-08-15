# AgroGuard Vision

Crie a primeira versão visual do MVP de uma plataforma web chamada AgroRisk.

OBJETIVO DESTA ETAPA

Criar apenas a estrutura essencial visual do sistema, com dados simulados e telas navegáveis.

Não implementar integrações externas, IA real, telemetria real, GPS real, APIs externas, Kafka, RabbitMQ, InfluxDB ou sensores.

A plataforma deve ter aparência profissional inspirada em sistemas modernos de monitoramento agrícola, telemetria e gestão de risco, mas com escopo inicial simples.

CRIAR LAYOUT GERAL DA APLICAÇÃO

Sidebar lateral fixa.

Header superior com nome da plataforma e usuário logado.

Área principal com cards, tabelas e painéis.

Visual corporativo, limpo, moderno e responsivo.

Alto contraste e boa legibilidade.

CRIAR IDENTIDADE VISUAL

Criar identidade visual com estilo corporativo, agrícola e tecnológico.

Usar a seguinte paleta:

Verde principal: #2E7D32

Azul secundário: #1976D2

Amarelo de alerta: #F9A825

Vermelho de risco crítico: #D32F2F

Fundo geral: #F5F7FA

Cards e superfícies: #FFFFFF

Bordas e divisórias: #D9E1E7

Texto principal: #1F2937

Texto secundário: #6B7280

Aplicação das cores:

Verde = risco baixo / status normal

Amarelo = risco médio / atenção

Vermelho = risco alto / crítico

Azul = elementos institucionais, navegação e destaques secundários

A interface deve ter:

alto contraste;

ótima legibilidade;

visual moderno e profissional;

aparência próxima de plataformas corporativas de monitoramento agrícola.

Também utilizar:

cards com bordas arredondadas;

ícones;

badges de status;

gráficos simples;

tabelas modernas com boa hierarquia visual.

CRIAR NAVEGAÇÃO POR PERFIS

Criar uma tela inicial simples de seleção de perfil, simulando login, com os seguintes perfis:

Gestor

Operador

Consultor/Corretor

Admin/Sompo

Cada perfil deve acessar uma visão diferente da plataforma.

CRIAR DASHBOARD DO GESTOR

O dashboard do gestor deve ter:

Cards de KPI no topo:

Máquinas monitoradas

Operações em risco

Score médio da frota

Alertas críticos

Tabela de ranking de risco por equipamento.

Tabela ou lista de ranking de risco por área.

Badges de risco: baixo, médio e alto.

Gráfico simples de evolução do risco nos últimos dias.

Dados totalmente simulados.

CRIAR TELA DO OPERADOR

A tela do operador deve ser simples e direta:

Status da operação atual.

Equipamento em uso.

Score de risco atual.

Alerta visual caso o risco seja alto.

Recomendação prática simulada, como:

reduzir velocidade;

evitar rota próxima de água;

aguardar melhora climática.

Não criar GPS real. Apenas simular localização e risco.

CRIAR TELA DO CONSULTOR/CORRETOR

A tela do consultor deve ter:

Resumo do cliente.

Equipamentos com maior risco.

Principais fatores de risco.

Recomendações preventivas em linguagem objetiva.

Um bloco visual chamado “Explicação para o cliente”, com texto simulado.

CRIAR TELA ADMIN/SOMPO

A tela admin deve exibir:

Lista de máquinas cadastradas.

Lista de clientes.

Lista de áreas/regiões.

Lista de operações simuladas.

Sem necessidade de CRUD completo nesta etapa. Apenas visualização organizada.

CRIAR DADOS SIMULADOS

Criar dados fictícios para:

5 máquinas agrícolas.

3 clientes/fazendas.

4 áreas/regiões.

8 operações.

Scores de risco entre 0 e 100.

Alertas de risco.

Recomendações simuladas.

RESTRIÇÕES IMPORTANTES

Não criar funcionalidades avançadas ainda.

Não criar integrações externas.

Não criar IA real nesta etapa.

Não criar telemetria em tempo real.

Não criar app mobile nativo.

Não criar fluxo de pagamento.

Não criar funcionalidades fora do escopo.

Priorizar estabilidade, visual profissional e navegação clara.

RESULTADO ESPERADO

Ao final desta etapa, quero uma plataforma visualmente convincente, com:

telas navegáveis por perfil;

dados simulados;

dashboards;

cards de KPI;

rankings visuais;

alertas simples.

O objetivo é validar a aparência e a estrutura inicial antes de adicionar lógica real de score, ranking e recomendações com IA.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://agro-visionv1.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0b234084-aa5d-40e8-9d24-43c60b3e1443).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
