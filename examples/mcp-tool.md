# Exposing x402-skill-registry as an MCP tool

[Model Context Protocol](https://modelcontextprotocol.io) servers give Claude tools it can
call mid-conversation. This is the one that makes the rest of the suite reachable: with it,
Claude can find a paid service it did not know about, read its `skill.md`, and use it.

## The server

```bash
npm install @modelcontextprotocol/sdk x402-fetch viem zod
```

`mcp-registry.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";
import { z } from "zod";

const BASE_URL = process.env.X402_REGISTRY_URL ?? "http://localhost:4030";

// One wallet, reused for every purchase. Its balance IS the spending cap.
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() })
  .extend(publicActions);
const pay = wrapFetchWithPayment(fetch, wallet as never);

const server = new McpServer({ name: "x402-skill-registry", version: "0.1.0" });

// FREE: the whole index. Try this before spending anything.
server.tool(
  "browse_skills",
  "List every service in the x402 skill registry — name, description, skill.md URL, route " +
    "prices and payment rails. FREE, no payment. Use this first: if the index is small or " +
    "you can filter it yourself, you never need the paid search.",
  {},
  async () => {
    const res = await fetch(`${BASE_URL}/skills.json`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "search_skills",
  "Ranked search over the registry: find x402-paid services by topic, filtered by payment " +
    "rail, category or maximum price. $0.001 USDC, paid automatically. Returns each match's " +
    "skill.md URL — fetch that next to learn how to call and pay the service. Every result " +
    "carries `score` and `matched` so you can judge relevance yourself.",
  {
    q: z.string().optional().describe("Topic, service name, or capability"),
    rail: z.enum(["evm", "solana"]).optional().describe("Only services payable on this chain"),
    category: z.string().optional(),
    maxPrice: z.number().optional().describe("Only services with a route at or below this USD price"),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async (args) => {
    const qs = new URLSearchParams(
      Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
    );
    const res = await pay(`${BASE_URL}/search?${qs}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "register_skill",
  "Register an x402 service in the registry and get back a signed listing plus a one-time " +
    "updateKey. $0.01 USDC. IMPORTANT: `rails` must include BOTH an EVM rail (base or " +
    "base-sepolia) AND a Solana rail (solana or solana-devnet) — a single-rail listing is " +
    "rejected with 422 and the fee is still charged. Save the updateKey: it is returned once.",
  {
    name: z.string().max(80),
    description: z.string().max(1000),
    skillMdUrl: z.string().url(),
    resources: z
      .array(
        z.object({
          resource: z.string().describe('e.g. "GET /forecast"'),
          price: z.string().describe('"$0.001" or "free"'),
          description: z.string().optional(),
        }),
      )
      .min(1)
      .max(50),
    rails: z
      .array(
        z.object({
          network: z.enum(["base", "base-sepolia", "solana", "solana-devnet"]),
          payTo: z.string(),
          asset: z.string().optional(),
          facilitator: z.string().optional(),
          feePayer: z.string().optional(),
        }),
      )
      .min(2)
      .describe("MUST include one EVM and one Solana rail"),
    homepage: z.string().url().optional(),
    manifestUrl: z.string().url().optional(),
    openapiUrl: z.string().url().optional(),
    categories: z.array(z.string()).max(12).optional(),
    contact: z.string().optional(),
  },
  async (listing) => {
    const res = await pay(`${BASE_URL}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(listing),
    });
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

## Wiring it into Claude Desktop / Claude Code

`claude_desktop_config.json` (or `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "x402-skill-registry": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-registry.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedTestnetKey",
        "X402_REGISTRY_URL": "https://your-deployment.example.com"
      }
    }
  }
}
```

Then:

> **You:** Is `ratchet.dev` taken? You don't have a domain tool.
>
> **Claude:** *(calls `browse_skills` — free — sees `x402-domains`, fetches its `skill.md`,
> learns the endpoint and price, pays $0.001 for the lookup, and answers)*

That is the whole point: a capability the agent did not have at the start of the sentence,
acquired and paid for inside it, with no key issued and no account created.

## Notes

- **`browse_skills` is free — expose it and prefer it.** A model that has seen the whole
  index writes a better paid query than one guessing at terms, and often does not need the
  paid call at all.
- **Budget the wallet, not the tool.** The MCP process holds the key; its balance is the
  ceiling on what the agent can spend.
- **Chain the discovery.** The value of `search_skills` is `skillMdUrl`. Give the model a
  plain `fetch` tool alongside it so it can read that file and then call the service directly.
- **Teach the dual-rail rule.** The tool description above does it: a registration missing a
  rail is a 422 *and* still costs $0.01. Have the model check both rails before posting.
- **Save the `updateKey`.** Returned once, stored only as a hash. Persist it outside the
  conversation.
- **Solana rail.** Swap `wrapFetchWithPayment` for a Solana x402 client if the agent's wallet
  lives on Solana; the registry accepts either and the tool code is unchanged.
