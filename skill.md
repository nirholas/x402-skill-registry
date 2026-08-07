---
skillMd: "1.0"
name: x402-skill-registry
baseUrl: http://localhost:4030
manifest: /.well-known/x402
openapi: /openapi.json
contact: nichxbt@gmail.com
---

# x402-skill-registry

A searchable index of agent skills you can pay for. Services register themselves with a
signed listing that says where their `skill.md` lives, what each route costs, and — the part
this registry refuses to make optional — **which payment rails they accept**. Agents search
it per query and get back the `skill.md` URLs, prices and rails they need to decide whether a
service is usable before spending anything on it. The full index is free to read; ranked
search costs a tenth of a cent.

- **Base URL:** `http://localhost:4030` (self-host) — replace with your deployment's origin.
- **Public index:** `GET /skills.json` (free)
- **Manifest:** `GET /.well-known/x402`
- **OpenAPI:** `GET /openapi.json`
- **Human demo:** `/index.html` — a working browser checkout
- **Contact:** nichxbt@gmail.com

## Payment

This service speaks **x402** (HTTP 402 Payment Required), protocol version 1, scheme
`exact`. Every paid route answers an unpaid request with a 402 whose `accepts` array carries
**two rails — USDC on Base (EVM) and USDC on Solana. Your client picks whichever it can
sign.**

| rail | network | asset | payTo | facilitator |
|---|---|---|---|---|
| evm | `base-sepolia` | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `https://x402.org/facilitator` |
| solana | `solana` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `https://facilitator.payai.network` |

Facilitators are per rail, not per service: the reference `x402.org` facilitator settles Base
Sepolia only. Override with `FACILITATOR_URL` and `SOLANA_FACILITATOR_URL`.

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4030/search",
      "description": "Search the registry for skills matching a query, with prices and skill.md URLs",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4030/search",
      "description": "Search the registry for skills matching a query, with prices and skill.md URLs",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 60,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": { "name": "USD Coin", "decimals": 6, "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" }
    }
  ]
}
```

- **Asset:** USDC (6 decimals) on both rails. `maxAmountRequired` is in base units — `"1000"`
  is $0.001.
- **Invocation contract:** every accept also carries `outputSchema.input` (how to build the
  request — method, query/path params, JSON body fields) and `outputSchema.output` (the JSON
  Schema of the 200 body). Both are elided above for readability and both are generated from
  `openapi.json`, so an agent can plan and call the route from the challenge alone.
- **How to pay:** any x402 client. `x402-fetch` + `viem` on the EVM rail; on Solana build the
  SPL `transferChecked` (the network fee is sponsored by `extra.feePayer`, so you need no
  SOL), sign it, and base64 the envelope into `X-PAYMENT`.
- **Receipt:** paid responses carry `X-PAYMENT-RESPONSE` (base64 JSON with `rail`, `network`,
  `transaction`, `payer`, `amount`) and repeat it inline as `receipt`.

## The dual-rail rule

**Every listing in this registry accepts both an EVM and a Solana rail.** `POST /register`
returns `422 NOT_DUAL_RAIL` otherwise — it is a rejection, not a warning.

An agent's wallet lives on exactly one chain. A single-rail entry is unusable to everyone on
the other one, and an index whose entries you cannot pay is a list of names. Because the rule
holds for every row, `GET /search` never needs a "can I actually pay this" filter: the answer
is always yes.

## `POST /register` — $0.01

Register a service. The signed listing record is the purchased artifact and comes back in
this response, with a one-time `updateKey`.

**Parameters**

| name | in | type | required | notes |
|---|---|---|---|---|
| `name` | body | string | yes | Unique among live listings. ≤ 80 chars, alphanumeric start |
| `description` | body | string | yes | What the service does. ≤ 1000 chars |
| `skillMdUrl` | body | string | yes | http(s) URL of the service's `skill.md` — the most useful field here |
| `rails` | body | array | yes | **Must include an EVM rail and a Solana rail.** Each: `{ rail, network, asset?, payTo, facilitator?, feePayer? }` |
| `resources` | body | array | yes | 1–50 of `{ resource: "GET /path", price: "$0.001" \| "free", description? }` |
| `homepage` | body | string | no | http(s) URL |
| `manifestUrl` | body | string | no | http(s) URL of `/.well-known/x402` |
| `openapiUrl` | body | string | no | http(s) URL of `openapi.json` |
| `categories` | body | string[] | no | Up to 12, lowercased, deduped |
| `contact` | body | string | no | Email or URL |
| `ttlDays` | body | integer | no | 1–3650, default 365. Past `expiresAt` a listing drops out of search and the index |

Networks accepted: `base`, `base-sepolia`, `solana`, `solana-devnet`. EVM `payTo` must be
`0x` + 40 hex; Solana `payTo` must be base58.

**Response 200**

```json
{
  "listing": {
    "type": "x402-skill-listing",
    "listingId": "9c1f8a4e-…",
    "name": "my-weather-api",
    "description": "Hourly forecasts from NWS, per call.",
    "homepage": "https://weather.example.com",
    "skillMdUrl": "https://weather.example.com/skill.md",
    "manifestUrl": "https://weather.example.com/.well-known/x402",
    "openapiUrl": "https://weather.example.com/openapi.json",
    "categories": ["weather", "data"],
    "resources": [
      { "resource": "GET /forecast", "price": "$0.001", "description": "Hourly forecast for a point" }
    ],
    "rails": [
      { "rail": "evm", "network": "base", "asset": "USDC", "payTo": "0xYourAddress",
        "facilitator": "https://x402.org/facilitator" },
      { "rail": "solana", "network": "solana", "asset": "USDC", "payTo": "YourSolanaAddress",
        "facilitator": "https://facilitator.payai.network" }
    ],
    "dualRail": true,
    "contact": "ops@weather.example.com",
    "registeredAt": "2026-08-07T12:00:00.000Z",
    "expiresAt": "2027-08-07T12:00:00.000Z",
    "origin": "registered"
  },
  "signature": "9f2c…",
  "algorithm": "HMAC-SHA256 over canonical JSON",
  "updateKey": "b71e…",
  "updateKeyNote": "Keep updateKey secret — it is the only way to replace this listing. Stored only as a hash.",
  "listingUrl": "/listing/9c1f8a4e-…",
  "indexUrl": "/skills.json",
  "receipt": { "success": true, "rail": "evm", "network": "base-sepolia", "transaction": "0x…" }
}
```

`updateKey` is returned once; the registry keeps only its SHA-256 hash.

## `GET /search` — $0.001

Ranked search over live listings. The result set is the purchased artifact.

**Parameters**

| name | in | type | required | notes |
|---|---|---|---|---|
| `q` | query | string | no | Free text over name, categories, description and route names. Omit to list everything, ranked by name |
| `rail` | query | string | no | `evm` or `solana` — only listings accepting that rail |
| `network` | query | string | no | Exact network, e.g. `solana-devnet` |
| `category` | query | string | no | Exact category match |
| `maxPrice` | query | number | no | Only listings whose cheapest paid route is at or below this USD amount |
| `limit` | query | integer | no | 1–50, default 10 |

Scoring is deliberately simple and explainable: exact name 10, name substring 5, category 3,
description 2, route text 1, summed across terms. Every result carries `score` and `matched`
so you can judge relevance yourself rather than trusting a number.

**Response 200**

```json
{
  "query": "domain",
  "filters": { "rail": null, "network": null, "category": null, "maxPrice": null },
  "count": 1,
  "results": [
    {
      "listingId": "3f2a…",
      "name": "x402-domains",
      "description": "Authoritative domain availability and expiry intel via RDAP — keyless and live on every call.",
      "skillMdUrl": "https://raw.githubusercontent.com/nirholas/x402-domains/main/skill.md",
      "manifestUrl": "https://raw.githubusercontent.com/nirholas/x402-domains/main/public/.well-known/x402",
      "openapiUrl": "https://raw.githubusercontent.com/nirholas/x402-domains/main/openapi.json",
      "homepage": "https://nirholas.github.io/x402-domains/",
      "categories": ["domains", "dns", "rdap", "whois", "data"],
      "resources": [
        { "resource": "GET /check/:domain", "price": "$0.001", "description": "Live RDAP lookup for one domain" },
        { "resource": "POST /bulk", "price": "$0.005", "description": "Up to 50 domains in one paid call" }
      ],
      "cheapestPaidRoute": 0.001,
      "rails": [
        { "rail": "evm", "network": "base-sepolia", "asset": "USDC", "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "facilitator": "https://x402.org/facilitator" },
        { "rail": "solana", "network": "solana", "asset": "USDC", "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "facilitator": "https://facilitator.payai.network" }
      ],
      "dualRail": true,
      "origin": "seed",
      "score": 11,
      "matched": ["name", "category", "description", "resource"]
    }
  ],
  "searchedAt": "2026-08-07T12:00:00.000Z",
  "receipt": { "success": true, "rail": "solana", "network": "solana", "transaction": "5Qm…" }
}
```

Fetch `skillMdUrl` next and you have everything needed to call and pay that service.

## `GET /skills.json` — free

The whole public index: every live listing with its signature. Free on purpose — a directory
nobody can read is not a directory. Paid `/search` exists for ranking and filtering, not for
access.

**Response 200**

```json
{
  "registry": "x402-skill-registry",
  "count": 4,
  "policy": "Every listing here accepts USDC on both Base and Solana.",
  "updatedAt": "2026-08-07T12:00:00.000Z",
  "listings": [{ "listing": { "type": "x402-skill-listing", "…": "…" }, "signature": "9f2c…" }]
}
```

## Free routes

| route | returns |
|---|---|
| `GET /` | service card: rails, prices, listing counts, the dual-rail policy |
| `GET /health` | `{ ok, uptime, listings }` |
| `GET /skills.json` | the full public index |
| `GET /listing/:id` | one listing with its signature |
| `POST /check-signature` | `{ valid }` — validate any listing this registry signed. Body: `{ payload, signature }` |
| `GET /skill.md` | this file |
| `GET /.well-known/x402` | machine-readable resource manifest |
| `GET /openapi.json` | OpenAPI 3.1 |
| `GET /index.html` | the human checkout demo |

## Signatures

Every listing is HMAC-SHA256 over canonical (recursively key-sorted) JSON using the
deployment's `SIGNING_SECRET`. Check one for free:

```bash
curl -s -X POST $BASE/check-signature -H 'content-type: application/json' \
  -d '{"payload": <the listing object>, "signature": "<hex>"}'
# { "valid": true, "type": "x402-skill-listing", "checkedAt": "…" }
```

A signature proves *this registry recorded that listing*. It is not an endorsement, an audit,
or evidence that the service behind `skillMdUrl` behaves as described. Fetch the `skill.md`
and judge for yourself.

## Errors

| status | body `error` | meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | malformed query parameter — `rail` not `evm`/`solana`, `maxPrice` not a number |
| 402 | — | payment required or rejected; body is the dual-rail challenge with `error` explaining why |
| 404 | `LISTING_NOT_FOUND` | unknown `listingId` |
| 409 | `NAME_TAKEN` | a live listing already uses that name |
| 422 | `NOT_DUAL_RAIL` | the listing does not carry both an EVM and a Solana rail — the one rule this registry enforces absolutely |
| 422 | `MISSING_RAILS` | no `rails` array at all |
| 422 | `UNSUPPORTED_NETWORK` | a rail names a network outside base / base-sepolia / solana / solana-devnet |
| 422 | `INVALID_LISTING` | a field is missing, too long, or malformed; `message` names the field |

## Data source

Self-contained: the registry stores what people register and serves it back, from a JSON file
on disk. There is no upstream API and no fixture mode. On first boot the index is seeded with
the x402 Suite's own services so a fresh deployment is not empty; those rows carry
`origin: "seed"` while everything paid for carries `origin: "registered"`, and the two are
distinguishable in every response.
