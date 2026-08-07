# Tutorial — browse for free, register for a cent, search for a tenth of one

Fifteen minutes. By the end you will have read the index for free, seen a real dual-rail 402,
registered a service, searched for it, watched the registry reject a single-rail listing, and
bought a search from a browser wallet.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-skill-registry.git
cd x402-skill-registry
npm install
```

Node 18 or newer. Runtime dependencies: `express`, `x402`, `dotenv`. The index is a JSON file.

The optional dependencies (`@three-ws/x402-payment-modal`, `@solana/web3.js`,
`@solana/spl-token`) power the browser demo's Phantom path. If they fail to install, the
server logs one line and boots anyway — the agent-side Solana rail is unaffected either way,
because that goes through the facilitator, not through these packages.

## 2. Configure

```bash
cp .env.example .env
```

It ships with the suite's public receive addresses filled in, so the server runs as-is. One
variable is worth setting even locally:

```bash
# The HMAC key your listing signatures are made with. The default is a public dev
# secret and the server warns at boot — with it, anyone running this code can forge
# a listing that looks like it came from your registry.
SIGNING_SECRET=$(openssl rand -hex 32)
```

## 3. Run it

```bash
npm run dev
```

```
x402-skill-registry listening on http://localhost:4030
Payment rails (USDC — the client picks):
  evm     base-sepolia   → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402  via https://x402.org/facilitator
  solana  solana         → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW  via https://facilitator.payai.network
  note: using suite default payTo — set PAY_TO_ADDRESS / SOLANA_PAY_TO_ADDRESS to receive funds yourself
Index: 4 listings (0 registered, 4 seed) — seeded 4 suite services on first boot
Policy: listings must carry BOTH an EVM and a Solana rail
Routes:
  POST /register         $0.01
  GET /search?q=…        $0.001
  GET /skills.json       free
  GET /listing/:id       free
  POST /check-signature  free
```

Those four seed rows are the x402 Suite's own services. They exist so a fresh deployment
demonstrates something; they are marked `origin: "seed"` everywhere so they cannot be
mistaken for traction.

## 4. Read the index — free

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

Nothing is behind the paywall here. **The list is free; ranking it is not.**

## 5. Your first 402

```bash
curl -i -s 'localhost:4030/search?q=domain'
```

```jsonc
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "1000",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", … },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "1000",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", … }
  ]
}
```

`maxAmountRequired` is in USDC base units — six decimals, so `"1000"` is $0.001.

## 6. Get a funded test wallet

1. Throwaway key: `openssl rand -hex 32`, prefixed with `0x`.
2. Its address: `npx tsx -e "import {privateKeyToAccount} from 'viem/accounts'; console.log(privateKeyToAccount(process.env.K).address)"`.
3. Testnet USDC from the [Circle faucet](https://faucet.circle.com) — pick Base Sepolia.

## 7. Register a service

```bash
PRIVATE_KEY=0xyourTestnetKey npm run client
```

The client posts a well-formed listing — note both rails:

```json
{
  "name": "demo-weather-…",
  "description": "Hourly forecasts from the US National Weather Service, per call.",
  "skillMdUrl": "https://weather.example.com/skill.md",
  "categories": ["weather", "data", "forecast"],
  "resources": [
    { "resource": "GET /forecast", "price": "$0.001", "description": "Hourly forecast for a point" },
    { "resource": "GET /alerts",   "price": "$0.001", "description": "Active severe-weather alerts" }
  ],
  "rails": [
    { "rail": "evm",    "network": "base-sepolia", "asset": "USDC",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "facilitator": "https://x402.org/facilitator" },
    { "rail": "solana", "network": "solana", "asset": "USDC",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "facilitator": "https://facilitator.payai.network" }
  ]
}
```

and gets back the signed record plus a one-time key:

```
③ Registering "demo-weather-…" — $0.01

   the artifact — a signed listing:
{ "type": "x402-skill-listing", "listingId": "9c1f…", "dualRail": true, … }
   signature: 9f2c…
   updateKey: b71e…   ← returned once, stored only as a hash
   signature valid: true
```

### The fields that matter

| field | why |
|---|---|
| `skillMdUrl` | **the most important field.** It is what a searching agent fetches next; everything else is a filter to get here |
| `rails` | both, or nothing. See step 9 |
| `resources` | route + price, so an agent can budget before fetching anything |
| `updateKey` | returned once, kept only as a SHA-256 hash. Lose it and the listing cannot be replaced |
| `ttlDays` | 365 by default. Past `expiresAt` a listing drops out of both search and the index — stale entries expire rather than rot |

## 8. Search for it

```bash
curl -s 'localhost:4030/search?q=weather&rail=solana' -H "X-PAYMENT: $PAID" | jq
```

```json
{
  "query": "weather",
  "filters": { "rail": "solana", "network": null, "category": null, "maxPrice": null },
  "count": 1,
  "results": [
    {
      "name": "demo-weather-…",
      "skillMdUrl": "https://weather.example.com/skill.md",
      "cheapestPaidRoute": 0.001,
      "rails": [{ "rail": "evm", "network": "base-sepolia" }, { "rail": "solana", "network": "solana" }],
      "dualRail": true,
      "origin": "registered",
      "score": 11,
      "matched": ["name", "category", "description", "resource"]
    }
  ],
  "searchedAt": "2026-08-07T12:00:00.000Z"
}
```

### Reading the ranking

Scoring is deliberately simple, because an agent spending money on a search deserves to know
*why* something ranked:

| match | points |
|---|---|
| exact name | 10 |
| name substring | 5 |
| category | 3 |
| description | 2 |
| route name or description | 1 |

summed across your query terms. `matched` lists which fired. If the ranking looks wrong you
can see immediately whether the problem is your query or the listing.

### Filters

```bash
# only listings I can pay on Solana
curl -s 'localhost:4030/search?q=data&rail=solana' -H "X-PAYMENT: $PAID"

# only listings with something at or below a tenth of a cent
curl -s 'localhost:4030/search?maxPrice=0.001' -H "X-PAYMENT: $PAID"

# everything in a category, ranked by name
curl -s 'localhost:4030/search?category=weather&limit=50' -H "X-PAYMENT: $PAID"
```

Omitting `q` lists everything that passes the filters, so `/search` doubles as a filtered
browse.

## 9. Watch the rule bite

```bash
curl -s -X POST localhost:4030/register \
  -H 'content-type: application/json' -H "X-PAYMENT: $PAID_10000" \
  -d '{ "name": "evm-only", "description": "…", "skillMdUrl": "https://x.example/skill.md",
        "resources": [{"resource":"GET /x","price":"$0.001"}],
        "rails": [{"rail":"evm","network":"base","payTo":"0x40252CFDF8B20Ed757D61ff157719F33Ec332402"}] }'
```

```json
{
  "error": "NOT_DUAL_RAIL",
  "message": "Listings must carry both rails. Missing: a Solana rail (solana or solana-devnet). An agent's wallet lives on exactly one chain — a single-rail listing is unusable to everyone on the other one, and this registry will not publish a price that half its readers cannot pay.",
  "detail": { "hasEvm": true, "hasSolana": false }
}
```

**You still paid the $0.01.** The fee buys the validation, and a rejection is a real answer.
Check your rails before registering — or better, run your `skill.md` through
[`x402-skill-md`](https://github.com/nirholas/x402-skill-md), whose rules SM005/SM006 catch
the same thing for free.

## 10. Buy a search from a browser

```bash
open http://localhost:4030/index.html
```

A real checkout: type a query, press **Pay $0.001 & search**, and the drop-in modal takes
over. It reads *both* rails out of the 402 and offers the wallet choice itself — Phantom for
Solana, any EVM wallet for Base. Nothing extra was needed beyond having two entries in
`accepts`.

The **Browse the index (free)** button next to it calls `/skills.json` with no payment at
all, which is the honest way to show what costs money and what does not.

Two things the modal adds that are worth knowing about: **SIWX re-entry** — sign in once and
later purchases skip the wallet prompt — and **per-origin spending caps**, so a page cannot
quietly drain a wallet across a session.

### The Solana checkout endpoint

Phantom signs serialized transactions but does not build instructions, so the browser needs a
server to construct the SPL transfer. `mountSolanaCheckout()` mounts the modal package's
`/api/x402-checkout` router for exactly that.

It is **not** in the verification path. Verification and settlement go through the rail's
facilitator like every other x402 payment. If the optional peers are missing you will see:

```
[x402] Solana checkout helper not mounted: Cannot find package '@solana/web3.js'
```

and everything else — including agent-side Solana payments — keeps working.

## 11. Going to mainnet

```bash
# EVM rail → Base mainnet
NETWORK=base
FACILITATOR_URL=https://your-mainnet-facilitator.example

# Solana rail → already mainnet by default
SOLANA_NETWORK=mainnet-beta
SOLANA_FACILITATOR_URL=https://facilitator.payai.network
SOLANA_RPC_URL=https://your-rpc-provider.example

# your own addresses, or you are donating to the suite
PAY_TO_ADDRESS=0xYourMainnetAddress
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress

# so 402 challenges quote absolute public URLs
PUBLIC_BASE_URL=https://registry.yourdomain.com

# non-negotiable in production
SIGNING_SECRET=<32+ random bytes>
DATA_DIR=/var/lib/x402-registry     # on a volume you back up
```

Facilitators are **per rail**: `https://x402.org/facilitator` settles Base Sepolia only, which
is why `SOLANA_FACILITATOR_URL` exists and defaults to PayAI's. Pointing both rails at one
facilitator will silently fail to settle one of them.

Back up `DATA_DIR`. It is the entire registry.

Then list your own deployment on the wider surfaces — [x402scan.com](https://x402scan.com),
the x402 Bazaar, [agentic.market](https://agentic.market) — all of which read
`/.well-known/x402`, which this server already serves.

## Next

- [API reference](api.md) — every field of the listing schema
- [For AI agents](agents.md) — discovery, MCP, listing
- [`examples/curl.md`](https://github.com/nirholas/x402-skill-registry/blob/main/examples/curl.md) — the protocol by hand
