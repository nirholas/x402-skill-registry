import "dotenv/config";
import express from "express";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  paywall,
  activeRails,
  usingSuiteDefaultPayTo,
  paymentReceipt,
  mountSolanaCheckout,
  type RoutePrices,
} from "./payments.js";
import { ROUTE_SCHEMAS } from "./schemas.js";
import { sign, verify as verifySignature, sha256 } from "./sign.js";
import {
  buildListing,
  searchListings,
  ListingError,
  minPrice,
  type RailId,
} from "./listing.js";
import {
  countByOrigin,
  getListing,
  listActive,
  nameTaken,
  putListing,
  seedIfEmpty,
} from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 4030);

const PAID_ROUTES: RoutePrices = {
  "POST /register": "$0.01",
  "GET /search": "$0.001",
};

const DESCRIPTIONS: Record<string, string> = {
  "POST /register": "Register an x402 service in the skill registry and receive a signed listing",
  "GET /search": "Search the registry for skills matching a query, with prices and skill.md URLs",
};

const PRICE_TABLE = [
  { route: "POST /register", price: "$0.01" },
  { route: "GET /search?q=…", price: "$0.001" },
  { route: "GET /skills.json", price: "free" },
  { route: "GET /listing/:id", price: "free" },
  { route: "POST /check-signature", price: "free" },
];

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));

// ---- free routes ----
app.get("/", (_req, res) => {
  const counts = countByOrigin();
  res.json({
    name: "x402-skill-registry",
    description:
      "Searchable registry of x402-paid agent skills — register with a signed listing, agents search per query",
    docs: "https://nirholas.github.io/x402-skill-registry/",
    demo: "/index.html",
    skill: "/skill.md",
    manifest: "/.well-known/x402",
    openapi: "/openapi.json",
    index: "/skills.json",
    payment: {
      protocol: "x402",
      note: "Pay in USDC on Base or Solana — your client picks the rail.",
      rails: activeRails(),
    },
    policy: "Listings must carry both an EVM and a Solana rail. Single-rail registrations are rejected.",
    listings: { total: counts.registered + counts.seed, ...counts },
    endpoints: PRICE_TABLE,
  });
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), listings: listActive().length }),
);

/** The full public index — free, because a directory nobody can read is not one. */
app.get("/skills.json", (_req, res) => {
  const all = listActive();
  res.json({
    registry: "x402-skill-registry",
    count: all.length,
    policy: "Every listing here accepts USDC on both Base and Solana.",
    updatedAt: new Date().toISOString(),
    listings: all.map(({ listing, signature }) => ({ listing, signature })),
  });
});

/** One listing by id — free. */
app.get("/listing/:id", (req, res) => {
  const record = getListing(req.params.id);
  if (!record) {
    res.status(404).json({ error: "LISTING_NOT_FOUND", message: "Unknown listingId" });
    return;
  }
  const { updateKeyHash: _omit, ...pub } = record;
  res.json(pub);
});

/** Validate any signed listing this deployment issued — free. */
app.post("/check-signature", (req, res) => {
  const { payload, signature } = req.body ?? {};
  if (payload === undefined || typeof signature !== "string") {
    res.status(400).json({
      error: "BAD_REQUEST",
      message: 'Body must be { "payload": <the signed listing>, "signature": "<hex>" }',
    });
    return;
  }
  const valid = verifySignature(payload, signature);
  res.json({
    valid,
    type: (payload as { type?: string })?.type ?? null,
    checkedAt: new Date().toISOString(),
    note: valid
      ? "Signature matches this registry's SIGNING_SECRET."
      : "Signature does not match — the listing was altered, or it was signed by a different deployment.",
  });
});

app.get("/.well-known/x402", (_req, res) =>
  res.type("application/json").sendFile(path.join(ROOT, "public", ".well-known", "x402")),
);
app.get("/skill.md", (_req, res) => res.type("text/markdown").sendFile(path.join(ROOT, "skill.md")));
app.get("/openapi.json", (_req, res) => res.sendFile(path.join(ROOT, "openapi.json")));

// The human checkout demo, and its Solana helper. The browser modal signs EVM
// locally but needs a server to build the SPL transfer Phantom signs — that is
// all `mountSolanaCheckout` does. It is not part of the verification path.
await mountSolanaCheckout(app);
app.use(express.static(path.join(ROOT, "public")));

// ---- paywall: everything below this line costs USDC ----
app.use(paywall(PAID_ROUTES, { service: "x402-skill-registry", descriptions: DESCRIPTIONS, schemas: ROUTE_SCHEMAS }));

/**
 * POST /register — $0.01
 * The purchased artifact is the signed listing record, returned immediately in
 * this response body along with a one-time update key.
 *
 * Registration is where the dual-rail policy is enforced: a listing without an
 * EVM rail AND a Solana rail is a 422.
 */
app.post("/register", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name && nameTaken(name)) {
      res.status(409).json({
        error: "NAME_TAKEN",
        message: `A live listing is already registered under "${name}". Use its updateKey to replace it, or pick another name.`,
      });
      return;
    }

    const listingId = randomUUID();
    const listing = buildListing(body as never, listingId);
    const signature = sign(listing);
    const updateKey = randomBytes(24).toString("hex");

    putListing({ listing, signature, updateKeyHash: sha256(updateKey) });

    res.json({
      listing,
      signature,
      algorithm: "HMAC-SHA256 over canonical JSON",
      updateKey,
      updateKeyNote:
        "Keep updateKey secret — it is the only way to replace this listing. Stored only as a hash.",
      listingUrl: `/listing/${listingId}`,
      indexUrl: "/skills.json",
      receipt: paymentReceipt(res),
    });
  } catch (err) {
    if (err instanceof ListingError) {
      res.status(err.status).json({
        error: err.code,
        message: err.message,
        ...(err.detail ? { detail: err.detail } : {}),
      });
    } else {
      res.status(500).json({ error: "INTERNAL", message: String(err) });
    }
  }
});

/**
 * GET /search — $0.001
 * The purchased artifact is the ranked result set, in this response body.
 */
app.get("/search", (req, res) => {
  try {
    const rail = req.query.rail as RailId | undefined;
    if (rail && rail !== "evm" && rail !== "solana") {
      res.status(400).json({ error: "BAD_REQUEST", message: 'rail must be "evm" or "solana"' });
      return;
    }
    const maxPriceRaw = req.query.maxPrice;
    let maxPrice: number | undefined;
    if (maxPriceRaw !== undefined) {
      maxPrice = Number(String(maxPriceRaw).replace("$", ""));
      if (!Number.isFinite(maxPrice) || maxPrice < 0) {
        res.status(400).json({ error: "BAD_REQUEST", message: "maxPrice must be a non-negative number of USD" });
        return;
      }
    }

    const hits = searchListings(listActive(), {
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      rail,
      network: typeof req.query.network === "string" ? req.query.network : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      maxPrice,
      limit: req.query.limit === undefined ? 10 : Number(req.query.limit),
    });

    res.json({
      query: typeof req.query.q === "string" ? req.query.q : null,
      filters: {
        rail: rail ?? null,
        network: (req.query.network as string) ?? null,
        category: (req.query.category as string) ?? null,
        maxPrice: maxPrice ?? null,
      },
      count: hits.length,
      results: hits.map(({ listing, score, matched }) => ({
        listingId: listing.listingId,
        name: listing.name,
        description: listing.description,
        skillMdUrl: listing.skillMdUrl,
        manifestUrl: listing.manifestUrl,
        openapiUrl: listing.openapiUrl,
        homepage: listing.homepage,
        categories: listing.categories,
        resources: listing.resources,
        cheapestPaidRoute: minPrice(listing),
        rails: listing.rails,
        dualRail: listing.dualRail,
        origin: listing.origin,
        score,
        matched,
      })),
      searchedAt: new Date().toISOString(),
      receipt: paymentReceipt(res),
    });
  } catch (err) {
    res.status(500).json({ error: "INTERNAL", message: String(err) });
  }
});

const seeded = seedIfEmpty();

app.listen(PORT, () => {
  console.log(`\nx402-skill-registry listening on http://localhost:${PORT}`);
  console.log("Payment rails (USDC — the client picks):");
  for (const r of activeRails()) {
    console.log(`  ${r.rail.padEnd(7)} ${r.network.padEnd(14)} → ${r.payTo}  via ${r.facilitator}`);
  }
  if (usingSuiteDefaultPayTo()) {
    console.log(
      "  note: using suite default payTo — set PAY_TO_ADDRESS / SOLANA_PAY_TO_ADDRESS to receive funds yourself",
    );
  }
  const counts = countByOrigin();
  console.log(
    `Index: ${counts.registered + counts.seed} listings (${counts.registered} registered, ${counts.seed} seed)` +
      (seeded ? ` — seeded ${seeded} suite services on first boot` : ""),
  );
  console.log("Policy: listings must carry BOTH an EVM and a Solana rail");
  console.log("Routes:");
  for (const r of PRICE_TABLE) console.log(`  ${r.route.padEnd(22)} ${r.price}`);
  console.log(
    `Free discovery: GET /  /health  /skill.md  /.well-known/x402  /openapi.json  ·  human demo: http://localhost:${PORT}/index.html\n`,
  );
});
