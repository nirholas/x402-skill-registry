<h1 align="center">x402-skill-registry</h1>

<p align="center">
  <b>A searchable index of agent skills you can pay for.</b><br>
  Register with a signed listing. Search per query. <b>Every listing takes USDC on Base <i>and</i> Solana</b> — enforced, not encouraged.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="https://x402.org"><img alt="x402" src="https://img.shields.io/badge/protocol-x402-0052ff.svg"></a>
  <img alt="rails" src="https://img.shields.io/badge/USDC-Base%20%2B%20Solana-2775ca.svg">
  <img alt="dual-rail" src="https://img.shields.io/badge/listings-dual--rail%20required-1f883d.svg">
  <a href="https://nirholas.github.io/x402-skill-registry/"><img alt="docs" src="https://img.shields.io/badge/docs-Pages-24292f.svg"></a>
</p>

---

## What you get

| Route | Price | What lands in the 200 body |
|---|---|---|
| `POST /register` | **$0.01** | The signed **listing record** — name, description, `skill.md` URL, route prices, rails, expiry — plus a one-time `updateKey` |
| `GET /search?q=…` | **$0.001** | Ranked results with `skill.md` URLs, prices, rails, and a `score` + `matched` pair so relevance is explainable |
| `GET /skills.json` | free | The **whole public index**, every listing with its signature |
| `GET /listing/:id` · `POST /check-signature` · `GET /` · `/health` · `/skill.md` · `/.well-known/x402` · `/openapi.json` | free | Lookup, signature validation, discovery |
| `GET /index.html` | free | A **working browser checkout** — connect a wallet and buy a search |

Every paid route returns the purchased artifact **in the 200 body**.

## The one rule

**A listing must carry both an EVM rail and a Solana rail.** `POST /register` returns
`422 NOT_DUAL_RAIL` otherwise. Not a warning, not a badge — a rejection.

An agent's wallet lives on exactly one chain. A single-rail entry is unusable to everyone on
the other one, and an index whose entries you cannot pay is a list of names, not a directory.
Because the rule holds for every row, `GET /search` never needs a "can I actually pay this"
filter: the answer is always yes.

```bash
curl -s localhost:4030/skills.json | jq '.listings[].listing.rails[] | {rail, network}'
# { "rail": "evm",    "network": "base-sepolia" }
# { "rail": "solana", "network": "solana" }
```

## Why the index is free and search is not

`GET /skills.json` costs nothing. A directory nobody can read is not a directory, and
gatekeeping the list would defeat the point of publishing it.

What costs $0.001 is **ranking and filtering** — the query, the score, the rail filter, the
price ceiling. That is real work on your behalf, and it is the thing an agent actually wants:
not "here are all 400 services" but "here are the three that do what I need, on my chain,
under my budget."

## Why x402 for this

Registries have a spam problem and a discovery problem. The usual fixes are accounts, review
queues and API keys, all of which cost more than they are worth at this scale.

A cent of real money at registration does most of the work: it is nothing to a service that
means it, and enough friction that bulk junk is not free. No account, no approval queue, no
key to issue or revoke — and the same wallet that pays to register is the one an agent uses
to pay for everything it finds here.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-skill-registry.git
cd x402-skill-registry
npm install
cp .env.example .env      # already filled with working defaults
npm run dev               # http://localhost:4030
```

The index is free, and seeded on first boot so it is not empty:

```bash
curl -s localhost:4030/skills.json | jq '{count, policy}'
# { "count": 4, "policy": "Every listing here accepts USDC on both Base and Solana." }
```

Search costs money, so an unpaid call gets the dual-rail challenge:

```bash
curl -i -s 'localhost:4030/search?q=domain'
# HTTP/1.1 402 Payment Required
# { "x402Version": 1, "accepts": [ {…base-sepolia…}, {…solana…} ] }
```

Pay and you get results:

```bash
PRIVATE_KEY=0xyourTestnetKey npm run client
```

Or open **<http://localhost:4030/index.html>** and pay with a browser wallet.

## Human checkout demo

`public/index.html` is a real, working checkout — not a mockup. It uses the drop-in
[`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal)
from a CDN:

```html
<script type="module" src="https://unpkg.com/@three-ws/x402-payment-modal"></script>

<button data-x402-endpoint="/search?q=domain"
        data-x402-method="GET"
        data-x402-merchant="x402-skill-registry"
        data-x402-action="Search the registry">Pay $0.001 &amp; search</button>

<script>
  addEventListener("x402:result", (e) => render(e.detail.data.results));
</script>
```

The modal reads **both rails** out of the 402 and offers the wallet choice itself — Phantom
for Solana, any EVM wallet for Base — so nothing extra was needed beyond having two entries
in `accepts`. It also does **SIWX re-entry** (sign in once, later purchases skip the wallet
prompt) and **per-origin spending caps**, so a page cannot quietly drain a wallet across a
session. It is a separate proprietary package: this repo references it from a CDN and does
not vendor its source.

The Solana path needs a small server endpoint, because Phantom signs serialized transactions
but does not build instructions. `mountSolanaCheckout()` mounts the package's
`/api/x402-checkout` router for exactly that, and only that — **it is not in the verification
path.** Verification and settlement run through the rail's facilitator like everything else.
If its optional peer dependencies are absent the mount is skipped with a log line and the
server still boots.

## How x402 works here

```
agent ──GET /search?q=domain──────────────▶ registry
      ◀──402 + accepts:[ Base USDC, Solana USDC ]──
      (client picks a rail, signs $0.001)
      ──GET /search?q=domain + X-PAYMENT──▶ registry
                                            └─ facilitator: verify → settle
      ◀──200 + ranked listings + skill.md URLs + X-PAYMENT-RESPONSE──
      ──GET <skillMdUrl>───────────────────▶ the service it found
```

Two round trips from "I need domain data" to "I can call and pay that API."

## Dual-rail payment: Base **or** Solana

| | EVM rail | Solana rail |
|---|---|---|
| network | `base-sepolia` (default) / `base` | `solana` (default) / `solana-devnet` |
| asset | USDC `0x036CbD…dCF7e` (sepolia) | USDC mint `EPjFWdd5…TDt1v` |
| payTo | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |
| facilitator | `https://x402.org/facilitator` | `https://facilitator.payai.network` |

Facilitators are **per rail** — they are chain-specific, and the reference `x402.org` one
settles Base Sepolia only. Those are the suite's public receive addresses and the server runs
with them out of the box; set `PAY_TO_ADDRESS` / `SOLANA_PAY_TO_ADDRESS` to be paid yourself.

## Signed listings

Every listing is **HMAC-SHA256 over canonical JSON** (keys sorted recursively). Validate any
of them for free:

```bash
curl -s -X POST localhost:4030/check-signature \
  -H 'content-type: application/json' \
  -d '{"payload": <the listing>, "signature": "<hex>"}'
# { "valid": true, "type": "x402-skill-listing", "checkedAt": "…" }
```

Set `SIGNING_SECRET` in production — the server warns loudly at boot if you have not.

**A signature is not an endorsement.** It proves this registry recorded that listing, not
that the service behind `skillMdUrl` behaves as described. Fetch the `skill.md` and judge for
yourself — which is exactly why the listing carries that URL.

## Real backend / API keys

**None.** The registry is self-contained: it stores what people register, in
`data/listings.json`, and serves it back. No upstream API, no fixture mode.

On first boot the index is seeded with the x402 Suite's own services so a fresh deployment
demonstrates something. Those rows carry `origin: "seed"`; everything paid for carries
`origin: "registered"`, and the two are distinguishable in every response — a seeded row is
not pretending to be traction.

File-based storage is deliberate. An index this size fits in one file that is trivial to back
up, diff, inspect and move. Back up `DATA_DIR`.

## For AI agents

- **[`skill.md`](skill.md)** — the agent-facing contract: endpoints, prices, the listing
  schema, payment, the dual-rail rule, error table.
- **`GET /.well-known/x402`** — machine-readable manifest with input/output schemas for both
  paid resources and both rails.
- **`GET /skills.json`** — the whole index, free. An agent can crawl it without spending
  anything and only pay when it wants ranking.
- **MCP** — [`examples/mcp-tool.md`](examples/mcp-tool.md) exposes `search_skills`,
  `browse_skills` (free) and `register_skill` as Model Context Protocol tools.
- **Client** — [`examples/agent-client.ts`](examples/agent-client.ts) runs the full flow:
  free browse → 402 → register → search → and a deliberate single-rail rejection.

The listing format is the machine-readable sibling of
[`skill.md`](https://github.com/nirholas/x402-skill-md); `skillMdUrl` is the bridge between
them.

## Docs

Full site: **<https://nirholas.github.io/x402-skill-registry/>**

- [Tutorial](docs/tutorial.md) — browse → 402 → register → search → the browser demo → mainnet
- [API reference](docs/api.md) — every field of the listing schema
- [For agents](docs/agents.md) — discovery, payment, MCP, listing

## Support

Questions, bugs, or a delisting request: **nichxbt@gmail.com** or open an issue.

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## License

Apache-2.0 — see [LICENSE](LICENSE).
