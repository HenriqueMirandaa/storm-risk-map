# Arquitetura — Mapa de Risco de Tempestades (MVP → SaaS)

## 1. Objetivo e âmbito do MVP

Mostrar num mapa, quase em tempo real, **quais os distritos de Portugal continental com maior risco** durante uma tempestade, combinando:

- **Avisos oficiais do IPMA** (`warnings_www.json`, avisos até 3 dias, por área e nível verde/amarelo/laranja/vermelho)
- **Previsão de modelo** (Open-Meteo): rajadas de vento (`wind_gusts_10m`) e precipitação horária, próximas 24 h

Fora do MVP: Açores/Madeira, polígonos por concelho, trajetória da tempestade, radar, contas de utilizador.

## 2. Visão geral

```mermaid
flowchart LR
  subgraph Fontes
    IPMA[IPMA\nwarnings_www.json]
    OM[Open-Meteo\nforecast API]
  end

  subgraph Backend["Backend Node.js / TypeScript (1 processo no MVP)"]
    SCH[Scheduler\npolling + backoff\nstale-while-error]
    RISK[Motor de risco\nscore 0-100 explicavel]
    STORE[(SnapshotStore\nem memoria)]
    API[HTTP API\n/api/risk · /api/risk.geojson\n/api/stream SSE · /api/health]
    STATIC[Servidor estatico]
  end

  subgraph Cliente
    WEB[Frontend\nLeaflet + EventSource]
    EXT[Clientes da API\n(B2B / apps)]
  end

  IPMA --> SCH
  OM --> SCH
  SCH --> RISK --> STORE
  STORE --> API
  API -- SSE --> WEB
  API -- REST/GeoJSON --> EXT
  STATIC --> WEB
```

### Fluxo de dados

1. O **Scheduler** consulta o IPMA (a cada 5 min) e o Open-Meteo (a cada 15 min), em ciclos independentes.
2. Em falha, mantém o último dado bom e repete com backoff (30 s, 60 s, … até ao intervalo normal). O estado da fonte passa a `error`/`stale` e vai no snapshot — o utilizador vê que os dados estão desatualizados em vez de ver um mapa "limpo" enganador.
3. Após cada ciclo, o **motor de risco** recalcula todos os distritos e publica um **Snapshot** imutável no `SnapshotStore`.
4. O store emite `update`; cada cliente SSE recebe o snapshot completo (~18 distritos, poucos KB). Sem diffs no MVP: é mais simples e robusto.
5. O frontend atualiza círculos, ranking e estado das fontes; o `EventSource` reconecta sozinho.

## 3. Módulos (`src/`)

| Módulo | Responsabilidade |
|---|---|
| `config.ts` | Variáveis de ambiente validadas (falha cedo se inválidas) |
| `data/regions.ts` | 18 distritos continentais: id IPMA, coordenadas, flag costeiro |
| `providers/ipma.ts` | Fetch + `normalizeWarnings` (puro): descarta verdes, expirados e fora da janela |
| `providers/openmeteo.ts` | **1 chamada** com as 18 coordenadas; `summarize` (puro) → rajada máx., mm/h máx., mm/24 h |
| `providers/mock.ts` | Tempestade simulada a subir a costa (dev e demos sem rede) |
| `providers/live.ts` | Junta IPMA + Open-Meteo atrás da interface `DataProvider` |
| `risk/score.ts` | Cálculo do risco (puro, testado) |
| `scheduler.ts` | Polling, backoff, estado das fontes, publicação do snapshot |
| `store.ts` | Último snapshot + `EventEmitter` |
| `server.ts` | `node:http`: API, SSE, estáticos (anti path-traversal), API key opcional, CORS |
| `public/` | Frontend sem build (Leaflet por CDN) |

A interface `DataProvider` é a costura principal: trocar/adicionar fontes (AEMET, radar, boias, estações IPMA) não toca no resto.

## 4. Modelo de risco (v0, heurístico)

```
aviso  = max(pontos_nível × peso_tipo) + bónus por avisos simultâneos (≤15)
vento  = curva(rajada máx. 24 h)          40 km/h→0 … 120→90 … 140+→100
chuva  = max(curva(mm/h máx.), curva(mm/24 h))
score  = round( max( 0.45·aviso + 0.30·vento + 0.25·chuva , 0.8·aviso ) )
```

- Pontos por nível: amarelo 25, laranja 55, vermelho 85.
- Pesos por tipo: precipitação/vento 1,0; trovoada/neve 0,8; agitação marítima 0,6 (**só costeiros**); nevoeiro 0,2; calor/frio 0.
- O `max(…, 0.8·aviso)` garante que um **aviso vermelho nunca fica "diluído"** por um modelo que discorda.
- Níveis: baixo < 25 ≤ moderado < 50 ≤ alto < 75 ≤ extremo.
- Cada resposta traz os **fatores** (`warning`, `wind`, `rain`) e os avisos que contribuíram → o índice é explicável (importante para confiança e para suporte).

> Estas curvas e pesos são **heurísticas de MVP**, não um modelo validado. Calibrar contra eventos passados (impacto real: quedas de árvores, ocorrências da Proteção Civil) antes de o apresentar como indicador fiável.

## 5. Contrato da API

| Endpoint | Descrição |
|---|---|
| `GET /api/health` | Estado do serviço e das fontes (sem autenticação) |
| `GET /api/risk` | Snapshot completo (JSON) |
| `GET /api/risk.geojson` | `FeatureCollection` de pontos (uma feature por distrito) |
| `GET /api/stream` | SSE: evento `snapshot` ao ligar e a cada atualização; ping a cada 25 s |

Autenticação opcional: `API_KEYS=k1,k2` → header `x-api-key` (ou `?key=` para o `EventSource`, que não permite headers).

Snapshot (resumo):

```jsonc
{
  "generatedAt": "2026-11-10T11:34:02Z",
  "mode": "live",
  "stormName": null,
  "sources": { "ipma": {"state":"ok","lastSuccess":"…","lastError":null}, "weather": {…} },
  "regions": [{
    "id": "VCT", "name": "Viana do Castelo", "lat": 41.69, "lon": -8.83,
    "score": 91, "level": "extreme",
    "factors": { "warning": 95, "wind": 90, "rain": 84 },
    "gustKmh": 120, "precipMmH": 17.2, "precip24hMm": 96.4, "hasWeather": true,
    "warnings": [{ "type": "Vento", "level": "red", "start": "…", "end": "…" }]
  }]
}
```

## 6. Decisões e porquê

- **Sem dependências de runtime**: `fetch` nativo (Node ≥ 22), `node:http`, `node:test`. Menos superfície de ataque e nada para manter no MVP. Quando entrar auth/validação/rate-limit, migrar para **Fastify + Zod**.
- **SSE em vez de WebSocket**: o fluxo é só servidor → cliente, reconecta sozinho e atravessa proxies/CDN com facilidade.
- **Snapshot completo, em memória**: 18 registos. Persistência só quando houver histórico/alertas.
- **Distritos como unidade**: é a granularidade dos avisos IPMA, logo a mais honesta. Concelhos/grelha entram na fase 2 (a variação intra-distrito vem do modelo, não dos avisos).
- **Funções puras** (`computeRisk`, `normalizeWarnings`, `summarize`) → testes unitários sem rede.

## 7. Falhas e como o sistema reage

| Falha | Comportamento |
|---|---|
| IPMA em baixo | Mantém últimos avisos; `sources.ipma = error/stale`; retry com backoff |
| Open-Meteo em baixo | Risco só com avisos (`hasWeather=false`); score nunca desce abaixo de `0.8·aviso` |
| Formato inesperado do IPMA | `normalizeWarnings` lança erro → tratado como falha da fonte, não corrompe o snapshot |
| Código de área IPMA desconhecido | Ignorado e **registado uma vez** em log (ver §9) |
| Cliente lento/desligado | SSE remove listener no `close`; limite `MAX_SSE_CLIENTS` |

## 8. Caminho de escala (SaaS)

```mermaid
flowchart LR
  W[Workers de ingestao\n(1 instancia, leader)] --> PG[(Postgres + PostGIS\nhistorico, avisos, snapshots)]
  W --> R[(Redis\nsnapshot atual + pub/sub)]
  R --> A1[API / SSE #1]
  R --> A2[API / SSE #2]
  A1 & A2 --> CDN[CDN / LB]
  CDN --> U[Utilizadores e clientes API]
  A1 & A2 --> AUTH[Auth + API keys + quotas]
  AUTH --> BILL[Stripe]
  W --> N[Notificacoes\nemail / push / webhooks]
```

1. **Separar ingestão da API**: um worker faz polling (evita N instâncias a bater nas fontes); publica em Redis; as réplicas de API só servem.
2. **Postgres/PostGIS**: histórico de avisos e scores (base para calibração, relatórios e "replay" de tempestades), geometrias de concelhos.
3. **Alertas**: regras por cliente (região + limiar) avaliadas a cada snapshot → email/push/webhook, com deduplicação.
4. **Multi-tenant**: chaves de API por cliente, quotas por plano, métricas de uso.
5. **Mapa**: migrar de Leaflet para **MapLibre GL** + polígonos de concelhos coloridos por score (vector tiles se necessário).

## 9. Riscos conhecidos (a fechar antes de publicar)

1. **Códigos de área IPMA**: os 18 códigos em `regions.ts` são os esperados para os distritos, mas **não foram validados contra a resposta real** (o ambiente de desenvolvimento não tinha acesso à API). No primeiro arranque em modo `live`, ver o log `avisos de areas nao mapeadas`.
2. **Licenças/termos**: confirmar condições de reutilização dos dados abertos do IPMA (atribuição) e que o plano gratuito do Open-Meteo **não** cobre uso comercial — para um SaaS pago será preciso plano comercial ou outro fornecedor.
3. **Responsabilidade**: o índice é experimental; mostrar sempre o aviso de que **não substitui os avisos oficiais** (IPMA / Proteção Civil) e evitar linguagem de "previsão de danos".
4. **Nome da tempestade**: o JSON de avisos não inclui o nome do evento; no MVP é configurável (`STORM_NAME`). Automatizar via comunicados oficiais é trabalho da fase 2.
5. **Calibração**: pesos e curvas são palpites informados, não resultado de validação histórica.

## 10. Segurança e observabilidade (mínimo)

- Estáticos servidos com normalização de caminho (testado contra `../` e `%2e%2e`).
- Texto dinâmico no frontend sempre via `textContent` (sem `innerHTML`).
- Chaves de API comparadas por lookup em `Set`; em produção, guardar hash e usar comparação em tempo constante, com rate limit por chave.
- `GET /api/health` serve para sondas de liveness e para alertas de "dados parados" (`generatedAt` antigo ou fonte `stale`).
- Próximo passo: logs estruturados (pino), métricas Prometheus (idade dos dados por fonte, nº de clientes SSE, latência), Sentry.
