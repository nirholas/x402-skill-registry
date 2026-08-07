/**
 * store.ts — the index, as a JSON file on disk.
 *
 * No database by design: a registry this size fits in one file that is trivial
 * to back up, diff, inspect and move. `data/listings.json` is the whole thing.
 *
 * On first boot the index is seeded with the x402 Suite's own services so
 * `GET /search` returns something useful immediately. Seeded rows are marked
 * `origin: "seed"` and are signed by this deployment like any other, so nothing
 * about them is special except that nobody paid to put them there.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { buildListing, type Listing, type StoredListing } from "./listing.js";
import { sign } from "./sign.js";
import { SEED_LISTINGS } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "listings.json");

type Index = Record<string, StoredListing>;

function load(): Index {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Index;
  } catch {
    console.warn(`[registry] ${FILE} is unreadable — starting from an empty index`);
    return {};
  }
}

function save(index: Index): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(index, null, 2));
}

export function putListing(record: StoredListing): void {
  const index = load();
  index[record.listing.listingId] = record;
  save(index);
}

export function getListing(id: string): StoredListing | null {
  return load()[id] ?? null;
}

/** Every listing, newest first. */
export function listAll(): StoredListing[] {
  return Object.values(load()).sort((a, b) =>
    b.listing.registeredAt.localeCompare(a.listing.registeredAt),
  );
}

/** Live listings only — the public index excludes anything past its TTL. */
export function listActive(): StoredListing[] {
  const now = Date.now();
  return listAll().filter((r) => new Date(r.listing.expiresAt).getTime() >= now);
}

export function countByOrigin(): { registered: number; seed: number } {
  const all = listAll();
  return {
    registered: all.filter((r) => r.listing.origin === "registered").length,
    seed: all.filter((r) => r.listing.origin === "seed").length,
  };
}

/** True when a name is already taken by a live listing. */
export function nameTaken(name: string): boolean {
  const needle = name.trim().toLowerCase();
  return listActive().some((r) => r.listing.name.toLowerCase() === needle);
}

/**
 * Seed the index on first boot. Idempotent: seeds are keyed by name, so
 * restarting never duplicates them and never overwrites a real registration
 * that has taken the same name.
 */
export function seedIfEmpty(): number {
  const existing = listAll();
  const taken = new Set(existing.map((r) => r.listing.name.toLowerCase()));
  let added = 0;
  for (const input of SEED_LISTINGS) {
    if (taken.has(String(input.name).toLowerCase())) continue;
    const listing: Listing = buildListing(input, randomUUID(), "seed");
    putListing({ listing, signature: sign(listing), updateKeyHash: "" });
    added++;
  }
  return added;
}
