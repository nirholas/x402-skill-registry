# API reference

Base URL: `http://localhost:4030` when self-hosting. Machine-readable equivalents:
[`openapi.json`](https://github.com/nirholas/x402-skill-registry/blob/main/openapi.json) and
[`/.well-known/x402`](https://github.com/nirholas/x402-skill-registry/blob/main/public/.well-known/x402).

Prices are USDC. Every paid route accepts **both** rails — Base (EVM) and Solana — and
returns the purchased artifact in the 200 body.

---

## `POST /register`

**Price:** $0.01 · **Returns:** the signed listing record + a one-time `updateKey`

### Request body

| field | type | required | rules |
|---|---|---|---|
| `name` | string | yes | ≤ 80 chars, must start alphanumeric, then letters/digits/space/`. _ - / @`. Unique among **live** listings |
| `description` | string | yes | ≤ 1000 chars |
| `skillMdUrl` | string | yes | http(s) URL of the service's `skill.md`. The field everything else exists to lead to |
| `rails` | array | yes | **≥ 1 EVM rail and ≥ 1 Solana rail.** See below |
| `resources` | array | yes | 1–50 entries. See below |
| `homepage` | string | no | http(s) URL |
| `manifestUrl` | string | no | http(s) URL of the service's `/.well-known/x402` |
| `openapiUrl` | string | no | http(s) URL of its `openapi.json` |
| `categories` | string[] | no | Up to 12. Lowercased, trimmed to 40 chars, deduped |
| `contact` | string | no | ≤ 200 chars |
| `ttlDays` | integer | no | 1–3650, default 365. Clamped, not rejected |

#### `rails[]`

| field | type | required | rules |
|---|---|---|---|
| `network` | string | yes | `base`, `base-sepolia`, `solana`, `solana-devnet`. Anything else is `422 UNSUPPORTED_NETWORK` |
| `payTo` | string | yes | `0x` + 40 hex on EVM networks; base58 (32–44 chars) on Solana networks |
| `asset` | string | no | Defaults to `USDC` |
| `facilitator` | string | no | The facilitator that settles **this** rail — they are chain-specific |
| `feePayer` | string | no | Solana only: the sponsor account paying the network fee |

`rail` (`evm` / `solana`) is derived from `network`; you may send it, it will be overwritten.

#### `resources[]`

| field | type | required | rules |
|---|---|---|---|
| `resource` | string | yes | `"GET /path"` — uppercase method, a space, a path starting `/` |
| `price` | string | yes | `"$0.001"` or the literal `"free"`. Ranges and prose are rejected |
| `description` | string | no | Trimmed to 400 chars |

### Response 200

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

`updateKey` is 24 random bytes, hex, returned **once**. The registry stores only its SHA-256
hash, so it cannot be shown again or recovered from the index.

`dualRail` is always `true` on a stored listing — the alternative is not stored.

### Errors

| status | `error` | cause |
|---|---|---|
| 402 | — | payment required or rejected |
| 409 | `NAME_TAKEN` | a live listing already uses that name |
| 422 | `NOT_DUAL_RAIL` | missing an EVM rail, a Solana rail, or both. `detail` says which |
| 422 | `MISSING_RAILS` | no `rails` array at all |
| 422 | `UNSUPPORTED_NETWORK` | a rail names a network outside the four accepted |
| 422 | `INVALID_LISTING` | a field is missing, too long, or malformed; `message` names it |

A 422 still consumed your payment. The fee buys the validation, and a rejection is a real
answer — check your rails first.

---

## `GET /search`

**Price:** $0.001 · **Returns:** ranked, filtered listings

### Parameters

| name | in | type | notes |
|---|---|---|---|
| `q` | query | string | Free text over name, categories, description and route text. Omit to list everything that passes the filters |
| `rail` | query | `evm` \| `solana` | Only listings accepting that rail. Anything else is a 400 |
| `network` | query | string | Exact network match, e.g. `solana-devnet` |
| `category` | query | string | Exact category match, case-insensitive |
| `maxPrice` | query | number | Only listings whose **cheapest paid route** is ≤ this USD amount. A `$` prefix is tolerated |
| `limit` | query | integer | 1–50, default 10. Clamped, not rejected |

Expired listings are excluded everywhere; there is no way to search them.

### Ranking

Per query term, summed:

| match | points |
|---|---|
| exact name | 10 |
| name substring | 5 |
| category | 3 |
| description | 2 |
| route name or description | 1 |

A listing scoring 0 is dropped. Ties break on name, ascending. With no `q`, everything
passing the filters scores 1 and is ordered by name.

This is deliberately simple. An agent spending money on a search deserves to see *why*
something ranked, which is what `matched` is for — not an opaque relevance number.

### Response 200

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
        { "rail": "evm", "network": "base-sepolia", "asset": "USDC",
          "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
          "facilitator": "https://x402.org/facilitator" },
        { "rail": "solana", "network": "solana", "asset": "USDC",
          "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
          "facilitator": "https://facilitator.payai.network" }
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

| field | meaning |
|---|---|
| `cheapestPaidRoute` | the lowest non-free price in USD, or `0` if everything is free — what `maxPrice` filters on |
| `origin` | `registered` (someone paid) or `seed` (shipped with the deployment) |
| `score` / `matched` | the ranking, and which fields produced it |

`skillMdUrl` is what you fetch next. Everything else is a filter to get to it.

### Errors

| status | `error` | cause |
|---|---|---|
| 400 | `BAD_REQUEST` | `rail` is not `evm`/`solana`, or `maxPrice` is not a non-negative number |
| 402 | — | payment required or rejected |

---

## `GET /skills.json` — free

The whole public index. Free because a directory nobody can read is not a directory.

```json
{
  "registry": "x402-skill-registry",
  "count": 4,
  "policy": "Every listing here accepts USDC on both Base and Solana.",
  "updatedAt": "2026-08-07T12:00:00.000Z",
  "listings": [
    { "listing": { "type": "x402-skill-listing", "…": "…" }, "signature": "9f2c…" }
  ]
}
```

Expired listings are excluded. `updateKeyHash` is never exposed.

## `GET /listing/:id` — free

One listing with its signature. `404 LISTING_NOT_FOUND` for an unknown id. Unlike
`/skills.json`, this returns expired listings too, so a signature you hold can always be
checked against its original.

## `POST /check-signature` — free

```json
{ "payload": { "type": "x402-skill-listing", "…": "…" }, "signature": "9f2c…" }
```

```json
{
  "valid": true,
  "type": "x402-skill-listing",
  "checkedAt": "2026-08-07T12:00:00.000Z",
  "note": "Signature matches this registry's SIGNING_SECRET."
}
```

Timing-safe comparison. Field order in `payload` is irrelevant — canonicalisation sorts keys
recursively before hashing.

**A valid signature is not an endorsement.** It proves this registry recorded that listing,
not that the service behind `skillMdUrl` behaves as described.

## Other free routes

| route | returns |
|---|---|
| `GET /` | service card: rails, prices, listing counts, the dual-rail policy |
| `GET /health` | `{ ok: true, uptime: <seconds>, listings: <live count> }` |
| `GET /skill.md` | the agent-facing skill file, `text/markdown` |
| `GET /.well-known/x402` | resource manifest with prices, rails and schemas |
| `GET /openapi.json` | OpenAPI 3.1 |
| `GET /index.html` | the human checkout demo |
| `POST /api/x402-checkout?action=prepare\|encode` | the browser Solana helper — builds and encodes the SPL transfer Phantom signs. **Not** part of verification. Present only when the optional peer dependencies are installed |

---

## The listing schema

```ts
interface Listing {
  type: "x402-skill-listing";
  listingId: string;              // uuid
  name: string;
  description: string;
  homepage: string | null;
  skillMdUrl: string;             // the bridge to x402-skill-md
  manifestUrl: string | null;
  openapiUrl: string | null;
  categories: string[];
  resources: { resource: string; price: string; description?: string }[];
  rails: {
    rail: "evm" | "solana";
    network: "base" | "base-sepolia" | "solana" | "solana-devnet";
    asset: string;                // "USDC"
    payTo: string;
    facilitator?: string;         // per rail — they are chain-specific
    feePayer?: string;            // Solana only
  }[];
  dualRail: true;                 // always; the alternative is not stored
  contact: string | null;
  registeredAt: string;           // ISO 8601
  expiresAt: string;              // ISO 8601
  origin: "registered" | "seed";
}
```

This is the machine-readable sibling of a
[`skill.md`](https://github.com/nirholas/x402-skill-md): the listing says *that* a service
exists, what it costs and how to pay it; the `skill.md` says how to use it.

---

## Payment

### The 402 body

```jsonc
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [ /* one PaymentRequirements per rail */ ]
}
```

`PaymentRequirements`:

| field | example | notes |
|---|---|---|
| `scheme` | `"exact"` | the only scheme accepted |
| `network` | `"base-sepolia"` / `"solana"` | switched by `NETWORK` and `SOLANA_NETWORK` |
| `maxAmountRequired` | `"1000"` | base units; USDC has 6 decimals, so this is $0.001 |
| `resource` | `"http://localhost:4030/search"` | absolute URL, path only — the query string does not affect price |
| `description` | `"Search the registry…"` | shown by wallets and the checkout modal |
| `mimeType` | `"application/json"` | what the 200 will be |
| `payTo` | `0x40252CF…` / `WwwuGbqH…` | receive address for that rail |
| `maxTimeoutSeconds` | `60` | how long the authorisation stays valid |
| `asset` | USDC address / SPL mint | the token you pay in |
| `extra` | `{ name, version }` / `{ name, decimals, feePayer }` | EIP-712 domain on EVM; the fee sponsor on Solana |

### The receipt

Paid responses set `X-PAYMENT-RESPONSE` to base64 JSON and repeat it inline as `receipt`:

```json
{
  "success": true,
  "rail": "solana",
  "network": "solana",
  "transaction": "5Qm…",
  "payer": "…",
  "amount": "1000",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "resource": "http://localhost:4030/search"
}
```

### 402 reasons

| `error` | meaning |
|---|---|
| `X-PAYMENT header is required` | first, unpaid attempt — normal |
| `invalid X-PAYMENT header: …` | not base64, or not a valid x402 payload |
| `unsupported rail: this endpoint does not accept exact on <network>` | you signed on a rail this server does not take |
| `payment rejected: <reason>` | the facilitator's `invalidReason` |
| `settlement failed: <reason>` | verified but could not be broadcast |

A facilitator outage returns `502 facilitator_unreachable` or `502 settlement_error` rather
than a 402, so a retry loop cannot mistake an outage for a price.
