# The raw 402 → pay → 200 walkthrough

No SDK — just HTTP, so you can see exactly what the protocol does.

```bash
npm install && npm run dev     # http://localhost:4030
```

## 0. The index is free

```bash
curl -s localhost:4030/skills.json | jq '{count, policy}'
```

```json
{
  "count": 4,
  "policy": "Every listing here accepts USDC on both Base and Solana."
}
```

```bash
curl -s localhost:4030/skills.json \
  | jq '.listings[].listing | {name, rails: [.rails[].network], origin}'
```

```json
{ "name": "x402-podcasts",      "rails": ["base-sepolia", "solana"], "origin": "seed" }
{ "name": "x402-skill-md",      "rails": ["base-sepolia", "solana"], "origin": "seed" }
{ "name": "x402-github-bounty", "rails": ["base-sepolia", "solana"], "origin": "seed" }
{ "name": "x402-domains",       "rails": ["base-sepolia", "solana"], "origin": "seed" }
```

Nothing is paywalled here. **The list is free; ranking it is not.**

## 1. Search without paying → 402 with **both** rails

```bash
curl -i -s 'localhost:4030/search?q=domain'
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```

```jsonc
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",              // 1000 base units = $0.001 USDC (6 dp)
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

Note the two facilitators behind those rails: `x402.org` settles the Base Sepolia entry,
PayAI settles the Solana one. They are not interchangeable.

## 2. Build the payment

`X-PAYMENT` is base64 of a JSON payload proving you authorised exactly
`maxAmountRequired` to `payTo` on the rail you chose.

**EVM rail** — an EIP-3009 `transferWithAuthorization` signature:

```jsonc
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x…",
    "authorization": {
      "from": "0xYourWallet",
      "to": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "value": "1000",
      "validAfter": "0",
      "validBefore": "1791234567",
      "nonce": "0x…"
    }
  }
}
```

**Solana rail** — a signed SPL `transferChecked` transaction, base64, in the same envelope.
The browser demo builds this through `/api/x402-checkout?action=prepare` then
`?action=encode`; an agent can call the same helpers directly.

```bash
X_PAYMENT=$(printf '%s' "$PAYLOAD_JSON" | base64 -w0)
```

After doing it by hand once:

```bash
PRIVATE_KEY=0xyourTestnetKey npm run client
```

## 3. Retry with the header → 200 + the results

```bash
curl -i -s 'localhost:4030/search?q=domain' -H "X-PAYMENT: $X_PAYMENT"
```

```http
HTTP/1.1 200 OK
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJyYWlsIjoiZXZtIiwi…
```

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
      "categories": ["domains", "dns", "rdap", "whois", "data"],
      "resources": [
        { "resource": "GET /check/:domain", "price": "$0.001", "description": "Live RDAP lookup for one domain" },
        { "resource": "POST /bulk", "price": "$0.005", "description": "Up to 50 domains in one paid call" }
      ],
      "cheapestPaidRoute": 0.001,
      "rails": [
        { "rail": "evm", "network": "base-sepolia", "asset": "USDC", "payTo": "0x40252CF…" },
        { "rail": "solana", "network": "solana", "asset": "USDC", "payTo": "WwwuGbqH…" }
      ],
      "dualRail": true,
      "origin": "seed",
      "score": 11,
      "matched": ["name", "category", "description", "resource"]
    }
  ],
  "searchedAt": "2026-08-07T12:00:00.000Z",
  "receipt": { "success": true, "rail": "evm", "network": "base-sepolia", "transaction": "0x…" }
}
```

`score` and `matched` are the whole ranking, exposed. Exact name 10, name substring 5,
category 3, description 2, route text 1, summed across terms.

Then follow `skillMdUrl` and you know how to call and pay that service.

## 4. Filters

```bash
# only listings I can pay on Solana
curl -s 'localhost:4030/search?q=data&rail=solana' -H "X-PAYMENT: $X_PAYMENT"

# only listings with something at or below a tenth of a cent
curl -s 'localhost:4030/search?maxPrice=0.001' -H "X-PAYMENT: $X_PAYMENT"

# a whole category, ranked by name
curl -s 'localhost:4030/search?category=weather&limit=50' -H "X-PAYMENT: $X_PAYMENT"
```

Omitting `q` lists everything that passes the filters, so `/search` doubles as a filtered
browse.

## 5. Register — $0.01

```bash
curl -s -X POST localhost:4030/register \
  -H 'content-type: application/json' \
  -H "X-PAYMENT: $X_PAYMENT_10000" \
  -d '{
    "name": "my-weather-api",
    "description": "Hourly forecasts from NWS, per call.",
    "skillMdUrl": "https://weather.example.com/skill.md",
    "manifestUrl": "https://weather.example.com/.well-known/x402",
    "categories": ["weather", "data"],
    "contact": "ops@weather.example.com",
    "resources": [
      { "resource": "GET /forecast", "price": "$0.001", "description": "Hourly forecast for a point" }
    ],
    "rails": [
      { "rail": "evm", "network": "base", "asset": "USDC",
        "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
        "facilitator": "https://x402.org/facilitator" },
      { "rail": "solana", "network": "solana", "asset": "USDC",
        "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
        "facilitator": "https://facilitator.payai.network" }
    ]
  }' | jq '{listing: .listing.listingId, signature, updateKey}'
```

```json
{
  "listing": "9c1f8a4e-…",
  "signature": "9f2c…",
  "updateKey": "b71e…"
}
```

`updateKey` comes back **once** and is stored only as a SHA-256 hash. Save it.

## 6. The rule, demonstrated

```bash
curl -s -X POST localhost:4030/register \
  -H 'content-type: application/json' -H "X-PAYMENT: $X_PAYMENT_10000" \
  -d '{ "name":"evm-only", "description":"…", "skillMdUrl":"https://x.example/skill.md",
        "resources":[{"resource":"GET /x","price":"$0.001"}],
        "rails":[{"network":"base","payTo":"0x40252CFDF8B20Ed757D61ff157719F33Ec332402"}] }' | jq
```

```json
{
  "error": "NOT_DUAL_RAIL",
  "message": "Listings must carry both rails. Missing: a Solana rail (solana or solana-devnet). An agent's wallet lives on exactly one chain — a single-rail listing is unusable to everyone on the other one, and this registry will not publish a price that half its readers cannot pay.",
  "detail": { "hasEvm": true, "hasSolana": false }
}
```

HTTP 422, and **you still paid.** The fee buys the validation.

## 7. Check a signature — free

```bash
curl -s -X POST localhost:4030/check-signature \
  -H 'content-type: application/json' \
  -d "{\"payload\": $LISTING_JSON, \"signature\": \"9f2c…\"}" | jq
```

```json
{
  "valid": true,
  "type": "x402-skill-listing",
  "checkedAt": "2026-08-07T12:00:00.000Z",
  "note": "Signature matches this registry's SIGNING_SECRET."
}
```

Change one byte of the listing and it flips to `false`. Field order does not matter —
canonicalisation sorts keys recursively before hashing.

## 8. Prices are separate payments

$0.01 for register, $0.001 for search. `X-PAYMENT` is not a session: each paid call needs its
own signed payment for its own amount.

## Errors you may hit

| what you sent | you get |
|---|---|
| no header on a paid route | 402, `error: "X-PAYMENT header is required"` |
| garbage header | 402, `error: "invalid X-PAYMENT header: …"` |
| a rail we don't take | 402, `error: "unsupported rail: …"` |
| short-paid or expired authorisation | 402, `error:` the facilitator's `invalidReason` |
| `?rail=bitcoin` | 400, `BAD_REQUEST` |
| a listing missing a rail | 422, `NOT_DUAL_RAIL` |
| a rail on an unsupported chain | 422, `UNSUPPORTED_NETWORK` |
| a name someone live already uses | 409, `NAME_TAKEN` |
| an unknown listing id | 404, `LISTING_NOT_FOUND` |
