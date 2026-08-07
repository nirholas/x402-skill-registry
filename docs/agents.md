# For AI agents

This is the front door. An agent that needs a capability it does not have — domain data,
podcast audio, a bounty certificate — starts here, finds a service that does it, and gets the
`skill.md` URL that tells it how to call and pay.

## 1. Discover

**`GET /skills.json`** — free, and the first thing to try. The entire index, every live
listing with its signature. Crawl it, cache it, filter it locally, and never spend a cent:

```ts
const { listings, policy } = await (await fetch(`${REGISTRY}/skills.json`)).json();
// policy: "Every listing here accepts USDC on both Base and Solana."

const solanaPayable = listings.filter(({ listing }) =>
  listing.rails.some((r) => r.rail === "solana"),
);   // …which is all of them, by construction
```

**`GET /skill.md`** — the agent-facing contract for the registry itself: endpoints, prices,
the listing schema, payment, the dual-rail rule, the error table. Its format is specified by
[`x402-skill-md`](https://github.com/nirholas/x402-skill-md).

**`GET /.well-known/x402`** — the machine-readable manifest:

```jsonc
{
  "x402Version": 1,
  "name": "x402-skill-registry",
  "policy": "Listings must carry both an EVM and a Solana rail. Single-rail registrations are rejected with 422 NOT_DUAL_RAIL.",
  "rails": [
    { "rail": "evm",    "network": "base-sepolia", "payTo": "0x40252CF…2402", "facilitator": "https://x402.org/facilitator" },
    { "rail": "solana", "network": "solana",       "payTo": "WwwuGbqH…T3WwW", "facilitator": "https://facilitator.payai.network" }
  ],
  "resources": [
    { "resource": "POST /register", "price": "$0.01",  "inputSchema": {…}, "outputSchema": {…} },
    { "resource": "GET /search",    "price": "$0.001", "inputSchema": {…}, "outputSchema": {…} }
  ],
  "freeResources": [ { "resource": "GET /skills.json", "price": "free" } ]
}
```

## 2. Pay

Every paid route answers an unpaid request with 402 and a **dual-rail** `accepts` array:
USDC on Base, USDC on Solana, same price, same artifact.

**EVM rail:**

```ts
import { wrapFetchWithPayment } from "x402-fetch";
const pay = wrapFetchWithPayment(fetch, wallet);       // viem wallet client

const { results } = await (await pay(`${REGISTRY}/search?q=domain&rail=evm`)).json();
```

**Solana rail:**

```ts
import { prepareSolanaCheckout, encodeX402Payment } from "@three-ws/x402-payment-modal/server";

const accept = challenge.accepts.find((a) => a.network.startsWith("solana"));
const { tx_base64 } = await prepareSolanaCheckout({ accept, buyer: pubkey });
const { x_payment } = encodeX402Payment({
  accept,
  signedTxBase64: await wallet.signTransaction(tx_base64),
  resourceUrl: url,
});
await fetch(url, { headers: { "X-PAYMENT": x_payment } });
```

Those helpers only *build and encode* the payment client-side; verification and settlement
run server-side through the rail's facilitator. `accept.extra.feePayer` sponsors the SOL
network fee, so an agent holding only USDC can pay.

### Reading the contract before you pay

Every entry in `accepts` carries an `outputSchema` with two halves, so an agent can judge
whether a call is worth its price and then make it correctly — without fetching the OpenAPI
document first:

- **`outputSchema.input`** — `{ type: "http", method, queryParams?, pathParams?, bodyType?,
  bodyFields? }`. Each value is the JSON Schema for that query parameter, path segment or
  request-body field.
- **`outputSchema.output`** — the JSON Schema of the 200 body you receive once payment
  settles.

Both halves are generated from `openapi.json`, so the runtime challenge and the published
spec cannot drift apart. Both rails advertise the identical contract: which wallet you pay
with never changes what the endpoint takes or returns.

You can probe a paid route safely: the paywall answers before any validation or existence
check, so an unpaid request with a synthetic id or an empty body still returns the full
challenge rather than a 404 or a 400. Read the price and the contract first, decide, then pay.

### Protocol version

This service speaks **x402 v1** (`x402Version: 1`) — the version every client shipped in this
repo, and in the examples above, is written against. v2 relocates the invocation contract to
`extensions.bazaar.schema` and identifies networks with CAIP-2 ids; agentcash prefers it, and
moving is a planned upgrade once the clients here can speak both. Until then, read `accepts[]`
and ignore `extensions`.

## 3. The workflow this exists for

```
"I need domain expiry data"
  → GET /skills.json                       free — is anything close?
  → GET /search?q=domain&rail=solana       $0.001 — ranked, filtered to my chain
  → GET <results[0].skillMdUrl>            free — how do I call it?
  → GET <that service>/check/example.com   $0.001 — the actual data
```

Total overhead before the useful call: one tenth of a cent, and two free fetches. No account
anywhere in that chain.

## 4. What you get

The 200 body **is** the purchase:

- `POST /register` → the signed listing and a one-time `updateKey`
- `GET /search` → ranked results, each with `skillMdUrl`, `resources` (route + price),
  `rails`, `cheapestPaidRoute`, `score` and `matched`

Plus `X-PAYMENT-RESPONSE`, a base64 receipt naming the rail, network and transaction.

### Rules worth encoding in your agent

- **Try `/skills.json` first — it is free.** If the index is small or you are filtering
  locally anyway, you never need the paid route. Pay for ranking, not for access.
- **`skillMdUrl` is the payload.** Everything else in a result is a filter to get to it.
  Fetch it before deciding a service is suitable — a listing is a claim, not a contract.
- **A signature is not an endorsement.** `POST /check-signature` proves the registry recorded
  a listing, not that the service behaves as described.
- **Read `matched`, not just `score`.** A hit that matched only `description` is weaker than
  one that matched `name` and `category`, at the same score.
- **Filter by `rail` when your wallet is single-chain.** Every listing here takes both, so
  this is a no-op today — but code it anyway, because a registry you do not control may not
  enforce the rule.
- **`cheapestPaidRoute` is the budget signal.** It is the lowest non-free price in the
  listing, so a match at $0.001 may still have a $5 route you did not want.
- **Registration validates, and charges either way.** A `422 NOT_DUAL_RAIL` still consumed
  the $0.01. Check both rails are present before posting.
- **Listings expire.** Past `expiresAt` they vanish from search and the index. A cached
  result can be stale; re-check before acting on an old one.

## 5. Registering your own service

```ts
const res = await pay(`${REGISTRY}/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "my-service",
    description: "What it does, in a sentence an agent can match on.",
    skillMdUrl: "https://my-service.example/skill.md",
    manifestUrl: "https://my-service.example/.well-known/x402",
    categories: ["weather", "data"],
    resources: [{ resource: "GET /forecast", price: "$0.001", description: "…" }],
    rails: [
      { rail: "evm",    network: "base",   payTo: "0x…", facilitator: "https://x402.org/facilitator" },
      { rail: "solana", network: "solana", payTo: "…",   facilitator: "https://facilitator.payai.network" },
    ],
  }),
});
const { listing, signature, updateKey } = await res.json();
```

**Store `updateKey` immediately.** It is returned once, kept only as a hash, and is the only
way to replace the listing.

Before registering, validate your `skill.md`:

```bash
npx x402-skill-md validate skill.md --strict
```

Its rules SM005 and SM006 catch a missing rail for free, which is cheaper than finding out
here.

## 6. MCP integration

[`examples/mcp-tool.md`](https://github.com/nirholas/x402-skill-registry/blob/main/examples/mcp-tool.md)
is a complete Model Context Protocol server exposing `browse_skills` (free), `search_skills`
and `register_skill`. The wallet lives in the MCP process, so its balance is the agent's
spending cap.

```json
{
  "mcpServers": {
    "x402-skill-registry": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-registry.ts"],
      "env": { "PRIVATE_KEY": "0x…", "X402_REGISTRY_URL": "https://your-host" }
    }
  }
}
```

Expose the free `browse_skills` tool too — a model that has seen the whole index writes a
better paid query than one guessing at terms.

## 7. Getting listed elsewhere

This registry is one surface. Submit your origin to the others too; each reads
`/.well-known/x402`:

| where | what it does | how |
|---|---|---|
| [x402scan.com](https://x402scan.com) | indexes live x402 endpoints and their settlement volume | submit your origin; it crawls `/.well-known/x402` |
| **x402 Bazaar** | the protocol's own resource directory, queried by agents at runtime | register through the facilitator's `list` API |
| [agentic.market](https://agentic.market) | marketplace of agent-payable services | submit the origin plus your `skill.md` URL |
| **this registry** | signed listings with enforced dual rail, searchable per query | `POST /register`, $0.01 |

Before submitting anywhere, confirm these resolve over HTTPS on your public origin, and set
`PUBLIC_BASE_URL` so 402 challenges quote absolute public URLs:

```
https://your-host/.well-known/x402
https://your-host/skill.md
https://your-host/openapi.json
```

Questions or a delisting request: **nichxbt@gmail.com**.
