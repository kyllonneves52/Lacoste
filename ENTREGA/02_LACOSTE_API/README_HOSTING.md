# LACOSTE AUTO API — servidor standalone (Bot-Hosting)

## Iniciar
npm install --omit=dev --no-fund --no-audit
npm start

## Porta (Bot-Hosting)
O código usa SERVER_PORT (obrigatório no Bot-Hosting), depois PORT, depois 8080.
Escuta em 0.0.0.0.

## Rotas
- /api/... — API completa
- /health e /api/health
- / /admin /guia /sms

## Banco
Turso via TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (HTTP, sem SDK extra).

## Variáveis
Configure no painel. Nunca publique .env.
Veja .env.example e README_BOT_HOSTING.md.
