/**
 * seed.ts — the x402 Suite's own services, so a fresh deployment's index is not
 * empty. Loaded once on first boot; marked `origin: "seed"` in every response.
 *
 * These are real, published services with real `skill.md` files. They are here
 * because a registry nobody has registered with is useless for demonstrating
 * what a registry does — not to inflate a count.
 */
import { DEFAULT_EVM_PAY_TO, DEFAULT_SOLANA_PAY_TO } from "./payments.js";
import type { ListingInput } from "./listing.js";

const RAILS = [
  {
    rail: "evm",
    network: "base-sepolia",
    asset: "USDC",
    payTo: DEFAULT_EVM_PAY_TO,
    facilitator: "https://x402.org/facilitator",
  },
  {
    rail: "solana",
    network: "solana",
    asset: "USDC",
    payTo: DEFAULT_SOLANA_PAY_TO,
    facilitator: "https://facilitator.payai.network",
    feePayer: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
  },
];

const gh = (name: string) => ({
  homepage: `https://nirholas.github.io/${name}/`,
  skillMdUrl: `https://raw.githubusercontent.com/nirholas/${name}/main/skill.md`,
  manifestUrl: `https://raw.githubusercontent.com/nirholas/${name}/main/public/.well-known/x402`,
  openapiUrl: `https://raw.githubusercontent.com/nirholas/${name}/main/openapi.json`,
  contact: "nichxbt@gmail.com",
  rails: RAILS,
});

export const SEED_LISTINGS: ListingInput[] = [
  {
    name: "x402-domains",
    description:
      "Authoritative domain availability and expiry intel via RDAP — keyless and live on every call. Returns availability, registrar, creation/expiry dates, nameservers, EPP status flags and DNSSEC delegation, resolved against the TLD's own registry.",
    categories: ["domains", "dns", "rdap", "whois", "data"],
    resources: [
      {
        resource: "GET /check/:domain",
        price: "$0.001",
        description: "Live RDAP lookup for one domain",
      },
      {
        resource: "POST /bulk",
        price: "$0.005",
        description: "Up to 50 domains in one paid call",
      },
    ],
    ...gh("x402-domains"),
  },
  {
    name: "x402-github-bounty",
    description:
      "Non-custodial GitHub bounties: mint a signed certificate against a live-verified open issue, buy a merged-PR verification report built from real GitHub state, and close out with a signed payout receipt. The service never holds the money.",
    categories: ["github", "bounty", "open-source", "verification"],
    resources: [
      {
        resource: "POST /bounties",
        price: "$0.01",
        description: "Signed bounty certificate against a live-verified issue",
      },
      {
        resource: "GET /verify/:bountyId",
        price: "$0.002",
        description: "Signed merged-PR verification report",
      },
      {
        resource: "POST /settle/:bountyId",
        price: "free",
        description: "Signed payout receipt",
      },
    ],
    ...gh("x402-github-bounty"),
  },
  {
    name: "x402-podcasts",
    description:
      "Podcast search over the Podcast Index, per query. Every result carries the show's newest episode including the enclosure (audio) URL and any Podcasting 2.0 transcript files — a topic in, a downloadable file out.",
    categories: ["podcast", "audio", "search", "media"],
    resources: [
      {
        resource: "GET /search",
        price: "$0.002",
        description: "Shows matching a term, each with its latest episode",
      },
      {
        resource: "GET /episode/:id",
        price: "$0.002",
        description: "Full episode record including the audio URL",
      },
    ],
    ...gh("x402-podcasts"),
  },
  {
    name: "x402-skill-md",
    description:
      "The skill.md toolkit: generate a conformant agent-facing contract file from an OpenAPI document, or validate one against 23 rules and get a fix per finding. Defines the SKILL-MD format this registry's listings describe.",
    categories: ["developer-tools", "openapi", "agent-discovery", "validation"],
    resources: [
      {
        resource: "POST /generate",
        price: "$0.01",
        description: "Generate a skill.md from an OpenAPI document",
      },
      {
        resource: "POST /validate",
        price: "$0.002",
        description: "Validate a skill.md, with fixes",
      },
      { resource: "GET /rules", price: "free", description: "The rule catalogue" },
    ],
    ...gh("x402-skill-md"),
  },
];
