# Mapa de Risco de Tempestades — Portugal (MVP)

Mapa em tempo real do risco por distrito durante tempestades, com **Node.js + TypeScript** e zero dependências de runtime.
Combina avisos do **IPMA** com rajadas/precipitação previstas pelo **Open-Meteo**.

## Explicação simples

Este site mostra, no mapa de Portugal, quais distritos podem ter maior risco de
tempestade. O sistema consulta duas fontes reais: os avisos oficiais do IPMA e
a previsão meteorológica do Open-Meteo. Cada distrito recebe uma pontuação de
0 a 100, calculada a partir de vento, chuva e avisos ativos.

As cores ajudam a interpretar o resultado: verde significa risco baixo,
amarelo moderado, laranja alto e vermelho extremo. O mapa é atualizado
automaticamente a cada minuto. Este indicador é apenas informativo e **não
substitui os avisos oficiais do IPMA ou da Proteção Civil**.

## Arrancar

```bash
npm install
npm run dev           # dados reais (IPMA + Open-Meteo) -> http://localhost:3000
npm run dev:mock      # simulacao de tempestade (sem rede)
npm test              # testes unitarios (node:test)
npm run typecheck && npm run build && npm start
```

Requer Node ≥ 22. Configuração em `.env.example` (as variáveis são lidas do ambiente; exportar antes de arrancar, ex.: `PORT=4000 npm run dev`).

## API

- `GET /api/risk` — snapshot JSON
- `GET /api/risk.geojson` — GeoJSON (1 ponto por distrito)
- `GET /api/stream` — SSE (`event: snapshot`)
- `GET /api/health` — estado das fontes

Com `API_KEYS=abc,def` a API exige `x-api-key` (ou `?key=`).

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — arquitetura, modelo de risco, contrato da API, escala e riscos
- [`docs/PLANO.md`](docs/PLANO.md) — plano de execução por fases

## Deploy na Vercel

O deploy usa a função `/api`, que consulta o IPMA e o Open-Meteo a cada
pedido. O navegador atualiza o mapa a cada minuto:

```bash
npx vercel
npx vercel --prod
```

Na Vercel, configure opcionalmente `STORM_NAME`, `API_KEYS` e `CORS_ORIGIN`.

## Estado e limitações

- Verificado: testes unitários, typecheck, servidor em modo `mock` (endpoints, SSE, anti path-traversal).
- **Não verificado**: modo `live` contra as APIs reais (sem rede no ambiente de desenvolvimento) — validar os códigos de área IPMA em `src/data/regions.ts`.
- Índice heurístico, **não substitui avisos oficiais** do IPMA / Proteção Civil.
