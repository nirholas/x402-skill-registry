/**
 * listing.ts — the registry's record type, its validation, and search.
 *
 * A listing is what a service publishes about itself so agents can find it:
 * where its `skill.md` lives, what its routes cost, and — the part this registry
 * refuses to make optional — **which payment rails it accepts**.
 *
 * Dual rail is enforced at registration. A listing without both an EVM and a
 * Solana rail is rejected with a 422, because a directory whose entries do not
 * say whether you can pay them is not a directory, it is a list of names.
 */

export type RailId = "evm" | "solana";

export interface ListingRail {
  rail: RailId;
  /** `base`, `base-sepolia`, `solana`, `solana-devnet`. */
  network: string;
  /** Human asset name; USDC for everything in the suite. */
  asset: string;
  /** Receive address on that chain. */
  payTo: string;
  /** The facilitator that settles THIS rail — they are chain-specific. */
  facilitator?: string;
  /** Solana only: the sponsor account that pays the network fee. */
  feePayer?: string;
}

export interface ListingResource {
  /** `"GET /check/:domain"`. */
  resource: string;
  /** `"$0.001"` or `"free"`. */
  price: string;
  description?: string;
}

/** The signed record. `signature` lives alongside it, not inside it. */
export interface Listing {
  type: "x402-skill-listing";
  listingId: string;
  name: string;
  description: string;
  homepage: string | null;
  /** The agent-facing contract file. The single most useful field here. */
  skillMdUrl: string;
  manifestUrl: string | null;
  openapiUrl: string | null;
  categories: string[];
  resources: ListingResource[];
  rails: ListingRail[];
  /** Always true for a stored listing — registration rejects anything else. */
  dualRail: boolean;
  contact: string | null;
  registeredAt: string;
  expiresAt: string;
  /** `"seed"` for the suite services shipped with this deployment. */
  origin: "registered" | "seed";
}

export interface StoredListing {
  listing: Listing;
  signature: string;
  /** sha256 of the update key. The key itself is returned once and never stored. */
  updateKeyHash: string;
}

export class ListingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public detail?: unknown,
  ) {
    super(message);
  }
}

const EVM_NETWORKS = new Set(["base", "base-sepolia"]);
const SOLANA_NETWORKS = new Set(["solana", "solana-devnet"]);
const PRICE = /^(free|\$\d+(?:\.\d+)?)$/;
const ROUTE = /^[A-Z]+\s+\/\S*$/;
const HTTP_URL = /^https?:\/\/\S+$/i;

function str(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ListingError("INVALID_LISTING", `${field} is required and must be a non-empty string`, 422);
  }
  const s = value.trim();
  if (s.length > max) {
    throw new ListingError("INVALID_LISTING", `${field} must be ${max} characters or fewer`, 422);
  }
  return s;
}

function optionalUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const s = str(value, field);
  if (!HTTP_URL.test(s)) {
    throw new ListingError("INVALID_LISTING", `${field} must be an http(s) URL`, 422);
  }
  return s;
}

/** Validate and normalise the rails. This is where dual rail is enforced. */
export function normaliseRails(input: unknown): ListingRail[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ListingError(
      "MISSING_RAILS",
      "rails is required: an array with at least one EVM rail and one Solana rail",
      422,
    );
  }
  const rails: ListingRail[] = [];
  for (const [i, raw] of input.entries()) {
    if (!raw || typeof raw !== "object") {
      throw new ListingError("INVALID_LISTING", `rails[${i}] must be an object`, 422);
    }
    const r = raw as Record<string, unknown>;
    const network = str(r.network, `rails[${i}].network`, 40);
    const isEvm = EVM_NETWORKS.has(network);
    const isSolana = SOLANA_NETWORKS.has(network);
    if (!isEvm && !isSolana) {
      throw new ListingError(
        "UNSUPPORTED_NETWORK",
        `rails[${i}].network "${network}" is not one of base, base-sepolia, solana, solana-devnet`,
        422,
      );
    }
    const payTo = str(r.payTo, `rails[${i}].payTo`, 100);
    if (isEvm && !/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
      throw new ListingError("INVALID_LISTING", `rails[${i}].payTo is not a 0x EVM address`, 422);
    }
    if (isSolana && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payTo)) {
      throw new ListingError("INVALID_LISTING", `rails[${i}].payTo is not a base58 Solana address`, 422);
    }
    rails.push({
      rail: isEvm ? "evm" : "solana",
      network,
      asset: typeof r.asset === "string" && r.asset ? r.asset.trim() : "USDC",
      payTo,
      ...(typeof r.facilitator === "string" && r.facilitator
        ? { facilitator: r.facilitator.trim() }
        : {}),
      ...(typeof r.feePayer === "string" && r.feePayer ? { feePayer: r.feePayer.trim() } : {}),
    });
  }

  const hasEvm = rails.some((r) => r.rail === "evm");
  const hasSolana = rails.some((r) => r.rail === "solana");
  if (!hasEvm || !hasSolana) {
    throw new ListingError(
      "NOT_DUAL_RAIL",
      `Listings must carry both rails. Missing: ${!hasEvm ? "an EVM rail (base or base-sepolia)" : ""}` +
        `${!hasEvm && !hasSolana ? " and " : ""}` +
        `${!hasSolana ? "a Solana rail (solana or solana-devnet)" : ""}. ` +
        "An agent's wallet lives on exactly one chain — a single-rail listing is unusable to " +
        "everyone on the other one, and this registry will not publish a price that half its " +
        "readers cannot pay.",
      422,
      { hasEvm, hasSolana },
    );
  }
  return rails;
}

function normaliseResources(input: unknown): ListingResource[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ListingError(
      "INVALID_LISTING",
      'resources is required: [{ "resource": "GET /path", "price": "$0.001" }]',
      422,
    );
  }
  if (input.length > 50) {
    throw new ListingError("INVALID_LISTING", "resources may list at most 50 routes", 422);
  }
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") {
      throw new ListingError("INVALID_LISTING", `resources[${i}] must be an object`, 422);
    }
    const r = raw as Record<string, unknown>;
    const resource = str(r.resource, `resources[${i}].resource`, 200);
    if (!ROUTE.test(resource)) {
      throw new ListingError(
        "INVALID_LISTING",
        `resources[${i}].resource must look like "GET /path" — an uppercase method, a space, then a path`,
        422,
      );
    }
    const price = str(r.price, `resources[${i}].price`, 20);
    if (!PRICE.test(price)) {
      throw new ListingError(
        "INVALID_LISTING",
        `resources[${i}].price must be "$0.001" or "free", not "${price}"`,
        422,
      );
    }
    return {
      resource,
      price,
      ...(typeof r.description === "string" && r.description
        ? { description: r.description.trim().slice(0, 400) }
        : {}),
    };
  });
}

export interface ListingInput {
  name: unknown;
  description: unknown;
  skillMdUrl: unknown;
  rails: unknown;
  resources: unknown;
  homepage?: unknown;
  manifestUrl?: unknown;
  openapiUrl?: unknown;
  categories?: unknown;
  contact?: unknown;
  ttlDays?: unknown;
}

/** Build a complete, validated listing from a registration request. */
export function buildListing(
  input: ListingInput,
  listingId: string,
  origin: Listing["origin"] = "registered",
): Listing {
  const name = str(input.name, "name", 80);
  if (!/^[a-zA-Z0-9][\w .@/-]*$/.test(name)) {
    throw new ListingError(
      "INVALID_LISTING",
      "name must start alphanumeric and contain only letters, digits, spaces, . _ - / @",
      422,
    );
  }
  const skillMdUrl = str(input.skillMdUrl, "skillMdUrl", 400);
  if (!HTTP_URL.test(skillMdUrl)) {
    throw new ListingError(
      "INVALID_LISTING",
      "skillMdUrl must be an http(s) URL pointing at the service's skill.md",
      422,
    );
  }

  const categories = Array.isArray(input.categories)
    ? [
        ...new Set(
          input.categories
            .filter((c): c is string => typeof c === "string" && Boolean(c.trim()))
            .map((c) => c.trim().toLowerCase().slice(0, 40)),
        ),
      ].slice(0, 12)
    : [];

  const ttl = Math.min(Math.max(Number(input.ttlDays) || 365, 1), 3650);
  const now = new Date();

  return {
    type: "x402-skill-listing",
    listingId,
    name,
    description: str(input.description, "description", 1000),
    homepage: optionalUrl(input.homepage, "homepage"),
    skillMdUrl,
    manifestUrl: optionalUrl(input.manifestUrl, "manifestUrl"),
    openapiUrl: optionalUrl(input.openapiUrl, "openapiUrl"),
    categories,
    resources: normaliseResources(input.resources),
    rails: normaliseRails(input.rails),
    dualRail: true,
    contact:
      typeof input.contact === "string" && input.contact ? input.contact.trim().slice(0, 200) : null,
    registeredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 86_400_000).toISOString(),
    origin,
  };
}

/** `"$0.001"` → `0.001`. `"free"` → `0`. */
export function priceToNumber(price: string): number {
  return price === "free" ? 0 : Number(price.replace("$", ""));
}

/** The cheapest paid route in a listing, or 0 when everything is free. */
export function minPrice(listing: Listing): number {
  const paid = listing.resources.map((r) => priceToNumber(r.price)).filter((n) => n > 0);
  return paid.length ? Math.min(...paid) : 0;
}

export interface SearchOptions {
  q?: string;
  /** Only listings that accept this rail. */
  rail?: RailId;
  /** Only listings that accept this exact network. */
  network?: string;
  /** Only listings with a route at or below this USD price. */
  maxPrice?: number;
  category?: string;
  limit?: number;
}

export interface SearchHit {
  listing: Listing;
  score: number;
  /** Which fields matched, so an agent can judge relevance for itself. */
  matched: string[];
}

/**
 * Rank listings against a query. Deliberately simple and explainable: an agent
 * spending money on a search deserves to see *why* something ranked, not an
 * opaque relevance number.
 */
export function searchListings(all: StoredListing[], opts: SearchOptions): SearchHit[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean).slice(0, 10) : [];
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const now = Date.now();

  const hits: SearchHit[] = [];
  for (const { listing } of all) {
    if (new Date(listing.expiresAt).getTime() < now) continue;
    if (opts.rail && !listing.rails.some((r) => r.rail === opts.rail)) continue;
    if (opts.network && !listing.rails.some((r) => r.network === opts.network)) continue;
    if (opts.category && !listing.categories.includes(opts.category.toLowerCase())) continue;
    if (opts.maxPrice !== undefined) {
      const cheapest = minPrice(listing);
      if (cheapest > opts.maxPrice) continue;
    }

    let score = 0;
    const matched: string[] = [];
    if (terms.length === 0) {
      score = 1;
    } else {
      const name = listing.name.toLowerCase();
      const description = listing.description.toLowerCase();
      const cats = listing.categories.join(" ");
      const routes = listing.resources
        .map((r) => `${r.resource} ${r.description ?? ""}`)
        .join(" ")
        .toLowerCase();

      for (const term of terms) {
        if (name === term) {
          score += 10;
          matched.push("name:exact");
        } else if (name.includes(term)) {
          score += 5;
          matched.push("name");
        }
        if (cats.includes(term)) {
          score += 3;
          matched.push("category");
        }
        if (description.includes(term)) {
          score += 2;
          matched.push("description");
        }
        if (routes.includes(term)) {
          score += 1;
          matched.push("resource");
        }
      }
      if (score === 0) continue;
    }

    hits.push({ listing, score, matched: [...new Set(matched)] });
  }

  hits.sort((a, b) => b.score - a.score || a.listing.name.localeCompare(b.listing.name));
  return hits.slice(0, limit);
}
