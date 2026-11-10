---
name: skill-registry
description: Search a registry of x402-paid agent skills or register a signed dual-rail listing. Use when an agent needs to find a paid service by capability, rail or price, or to publish one.
---

# x402-skill-registry search and listing

A registry where each listing must accept USDC on both an EVM rail and a Solana rail. Listings are signed by the registry and drop out of search after `expiresAt`.

## Run the server

The repo is a self-hosted Express service. It is not published to npm, so run it from a clone.

```bash
git clone https://github.com/nirholas/x402-skill-registry && cd x402-skill-registry
npm install
cp .env.example .env   # optional: the defaults run out of the box
npm run dev            # listens on http://localhost:4030 (override with PORT)
```

Set `PAY_TO_ADDRESS` (Base) and `SOLANA_PAY_TO_ADDRESS` (Solana) in `.env` to receive payments yourself.
`GET http://localhost:4030/.well-known/x402` lists every route with its price, and `GET /health` is the liveness probe.

## Routes

| Route | Price | Purpose |
|---|---|---|
| `GET /search` | $0.001 | Query: `q`, `rail` (`evm` or `solana`), `network`, `category`, `maxPrice`, `limit` (1 to 50, default 10) |
| `POST /register` | $0.01 | Body: `name`, `description`, `skillMdUrl`, `rails` (must include an EVM and a Solana rail), `resources` (1 to 50 of `{resource, price, description}`), optional `homepage`, `manifestUrl`, `openapiUrl`, `categories`, `contact`, `ttlDays` |
| `GET /skills.json` | free | Full public index |
| `GET /listing/:id` | free | One listing with its signature |
| `POST /check-signature` | free | Body `{payload, signature}`, returns `{valid}` |
| `GET /`, `GET /health`, `GET /skill.md`, `GET /openapi.json`, `GET /.well-known/x402` | free | Service card and discovery |

The full request and response schemas are in `skill.md` at the repo root (the running server also serves it at `GET /skill.md`).

## Paying

Paid routes answer an unpaid request with HTTP 402 and an `accepts` array with one entry per rail (USDC on Base and USDC on Solana). A client picks an entry, signs, and retries with the `X-PAYMENT` header. The 200 body carries the artifact and an `X-PAYMENT-RESPONSE` header carries the settlement receipt. Any x402 client works (`x402-fetch` with `viem` on the EVM rail). Each paid call spends real USDC on whichever network the server is configured for (`NETWORK`, `SOLANA_NETWORK`), so show the user the route, price and network and get a yes before paying.

## Worked example

```bash
curl -s http://localhost:4030/skills.json | head -c 600
curl -s http://localhost:4030/health
```

`GET /search?q=weather&rail=solana&maxPrice=0.01` is paid ($0.001): after the user approves, call it through an x402 client and read the matching listings.
