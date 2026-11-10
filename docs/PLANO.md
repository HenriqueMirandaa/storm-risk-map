# Plano de execução

Estimativas para **1 developer backend a tempo inteiro**. Cada fase termina com algo que se pode mostrar/validar.

## Fase 0 — Validar as fontes (1–2 dias)

- [ ] Correr em `DATA_MODE=live` e confirmar que os códigos de área IPMA batem com `src/data/regions.ts` (log `avisos de areas nao mapeadas`)
- [ ] Guardar 2–3 respostas reais do IPMA como *fixtures* para testes
- [ ] Ler e registar os termos de uso do IPMA (dados abertos) e do Open-Meteo (uso comercial)
- [ ] Decidir granularidade seguinte (concelhos? grelha de ~0,25°?)

**Critério de saída:** mapa em modo live com avisos reais e sem áreas ignoradas.

## Fase 1 — MVP (entregue neste repositório) → pôr online (2–3 dias)

Já feito: ingestão IPMA + Open-Meteo, motor de risco, API REST/GeoJSON/SSE, mapa em tempo real, modo simulação, 9 testes unitários.

Por fazer para publicar:
- [ ] Deploy de 1 instância (Fly.io / Railway / VPS) com `npm run build && npm start`
- [ ] HTTPS + domínio; `API_KEYS` ativas se a API não for pública
- [ ] Aviso legal visível (já no painel) + página "Metodologia" com a fórmula
- [ ] Alerta simples: sondar `/api/health` (UptimeRobot) e avisar se `generatedAt` > 20 min

**Critério de saída:** URL público estável durante uma tempestade real, a mostrar dados coerentes com os avisos do IPMA.

## Fase 2 — Qualidade do produto (2–3 semanas)

| Item | Detalhe |
|---|---|
| Geometrias | Polígonos de distritos/concelhos (GeoJSON oficial CAOP) coloridos por score; migrar para MapLibre GL |
| Mais resolução | Grelha de pontos (ex.: 0,25°) no Open-Meteo → score por concelho, interpolando o aviso do distrito |
| Persistência | Postgres + PostGIS: tabela de snapshots/avisos; endpoint `/api/history` |
| Replay | Ver uma tempestade passada hora a hora (útil para demos e calibração) |
| Nome/trajetória | Ingerir comunicados/nome da tempestade; mostrar centro/trajetória quando houver fonte fiável |
| Testes | Fixtures reais, testes de integração do servidor (SSE), CI (GitHub Actions: typecheck + test) |
| Observabilidade | pino + métricas Prometheus + Sentry |

**Critério de saída:** score por concelho com histórico; calibração inicial contra 2–3 tempestades de 2026.

## Fase 3 — Transformar em SaaS (3–4 semanas)

- [ ] Migrar HTTP para **Fastify** + validação com **Zod**
- [ ] Separar **worker de ingestão** da **API** (Redis para snapshot + pub/sub)
- [ ] Contas e **API keys** por cliente, quotas e rate limit por plano
- [ ] **Alertas** configuráveis (região + limiar) por email/push/webhook, com deduplicação
- [ ] Faturação (Stripe), planos (ex.: Gratuito = mapa; Pro = API + alertas; Empresa = SLA, webhooks, histórico)
- [ ] Resolver licença de dados para uso comercial (plano comercial Open-Meteo ou alternativa)
- [ ] Termos de serviço e política de privacidade (RGPD)

**Critério de saída:** primeiros clientes piloto (autarquias, seguradoras, logística, imobiliário/agrícola) a usar API/alertas.

## Fase 4 — Diferenciação (contínuo)

- Calibração estatística do score com ocorrências reais (Proteção Civil / seguros)
- Radar e satélite, estações IPMA (observado vs. previsto)
- Risco de inundação urbana e galgamento costeiro (marés + agitação)
- App móvel / PWA com notificações push por localização
- Relatórios pós-evento para clientes B2B

## Riscos do projeto

| Risco | Mitigação |
|---|---|
| Dependência de fontes externas (mudança de formato/limites) | Interface `DataProvider`, fixtures, alerta de dados parados |
| Termos de uso impedirem uso comercial | Resolver na fase 0/3 antes de cobrar |
| Responsabilidade por decisões tomadas com o índice | Aviso legal, metodologia pública, linguagem de "indicador" |
| Sazonalidade (procura concentrada em tempestades) | Posicionar também para planeamento (previsão 3 dias) e relatórios |
| Concorrência de apps meteo gratuitas | Foco B2B/API, alertas por região e histórico/relatórios |

## Métricas a acompanhar

- Latência de dados: idade do último sucesso por fonte
- Disponibilidade durante eventos (não só em média)
- Utilizadores simultâneos em SSE durante picos
- Concordância score ↔ nível de aviso máximo do IPMA (sanity check)
- Conversão gratuito → pago (fase 3)
