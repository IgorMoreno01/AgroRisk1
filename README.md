# AgroGuard Vision (AgroRisk)

Plataforma web de monitoramento de risco agrícola com dashboards por perfil,
score determinístico e integrações server-side com dados climáticos,
hidrográficos, de rota e de terreno.

## Documentação principal

Consulte [`docs/arquitetura-da-solucao.md`](docs/arquitetura-da-solucao.md) para
a documentação de ponta a ponta:

- arquitetura e fluxo de inicialização;
- rotas, dashboards e perfis;
- domínio, score e recomendações;
- autenticação e autorização;
- APIs externas, contratos, cache e fallbacks;
- segurança, configuração do Replit e observabilidade;
- limitações, roadmap e checklist de manutenção.

## Estado atual do MVP

O projeto começou como um protótipo visual com dados simulados. Atualmente,
continua sem banco, telemetria, GPS live, IA, filas ou sensores, mas já possui
adapters server-side para:

- Open-Meteo (clima);
- Overpass/OpenStreetMap (hidrografia);
- openrouteservice (rotas);
- OpenTopography e fallback Open-Elevation (terreno).

As APIs externas são chamadas somente no servidor. Cada resposta é normalizada,
armazenada em cache em memória por TTL e possui fallback explicitamente
identificado na interface. SoilGrids permanece apenas demonstrativo.

Ainda não estão implementados o mini-mapa com geometria real da rota e o tempo
restante da operação baseado na rota real. Esses itens são roadmap.

## Perfis

- **Gestor:** visão de frota, clientes, áreas, clima, rankings e recomendações.
- **Operador:** operação atual, score, alertas e contexto geográfico.
- **Consultor/Corretor:** análise consolidada e explicação para o cliente.
- **Admin/Sompo:** visão consolidada das entidades e indicadores.

## Execução local/Replit

O workflow configurado é `Start application`, com `bun run dev` na porta 5000.

```sh
bun install
bun run dev
bun run build
bun run lint
bun run format
```

O servidor escuta em `0.0.0.0:5000`. Configure os Secrets do Replit
`ORS_API_KEY`, `OPENTOPO_API_KEY` e `AUTH_SESSION_SECRET` quando quiser
habilitar as fontes que dependem deles. Nunca coloque os valores no código ou
na documentação.

## Estrutura rápida

```text
src/routes/                 telas e rotas protegidas
src/components/             layout e componentes reutilizáveis
src/lib/mock-data.ts        entidades de demonstração
src/lib/risk-score.ts       motor de score e conversores reais
src/lib/api/                server functions validadas por Zod
src/lib/adapters/           integrações externas e fallbacks
src/lib/cache.server.ts     cache server-side em memória
docs/                       documentação técnica completa
```

Antes de alterar integrações, autenticação, score, cache ou configuração do
workflow, leia a documentação principal.