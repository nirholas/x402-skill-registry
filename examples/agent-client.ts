/**
 * examples/agent-client.ts — browse free, register a service, search, paid.
 *
 *   PRIVATE_KEY=0x… npm run client
 *
 * ① read the free index   ② show the dual-rail 402
 * ③ register a listing ($0.01)   ④ search for it ($0.001)
 * ⑤ prove the registry rejects a single-rail listing
 *
 * `wrapFetchWithPayment` catches each 402, picks the EVM requirement out of the
 * dual-rail `accepts` array, signs an EIP-3009 authorisation for the exact
 * amount, and retries with `X-PAYMENT`. The Solana rail is shown at the bottom.
 */
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4030";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;

/** A well-formed listing: both rails, as the registry requires. */
const LISTING = {
  name: `demo-weather-${Date.now().toString(36)}`,
  description:
    "Hourly forecasts from the US National Weather Service, per call. Keyless upstream, live on every request.",
  skillMdUrl: "https://weather.example.com/skill.md",
  manifestUrl: "https://weather.example.com/.well-known/x402",
  openapiUrl: "https://weather.example.com/openapi.json",
  homepage: "https://weather.example.com",
  categories: ["weather", "data", "forecast"],
  contact: "ops@weather.example.com",
  resources: [
    { resource: "GET /forecast", price: "$0.001", description: "Hourly forecast for a point" },
    { resource: "GET /alerts", price: "$0.001", description: "Active severe-weather alerts" },
  ],
  rails: [
    {
      rail: "evm",
      network: "base-sepolia",
      asset: "USDC",
      payTo: "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      facilitator: "https://x402.org/facilitator",
    },
    {
      rail: "solana",
      network: "solana",
      asset: "USDC",
      payTo: "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      facilitator: "https://facilitator.payai.network",
    },
  ],
};

async function main(): Promise<void> {
  // ---- ① the index is free ------------------------------------------------
  const index = await (await fetch(`${BASE_URL}/skills.json`)).json();
  console.log(`\n① The public index is free — ${index.count} listing(s):`);
  for (const { listing } of index.listings) {
    console.log(
      `   ${listing.name.padEnd(24)} ${listing.rails.map((r: { network: string }) => r.network).join(" + ").padEnd(24)} ${listing.origin}`,
    );
  }
  console.log(`   policy: ${index.policy}`);

  // ---- ② the dual-rail challenge -----------------------------------------
  console.log(`\n② Unpaid search → expect a dual-rail 402\n   GET ${BASE_URL}/search?q=domain`);
  const challenge = await (await fetch(`${BASE_URL}/search?q=domain`)).json();
  for (const a of challenge.accepts ?? []) {
    console.log(
      `   accepts: ${String(a.network).padEnd(14)} ${a.maxAmountRequired} base units USDC → ${a.payTo}`,
    );
  }

  if (!PRIVATE_KEY) {
    console.log(
      "\nSet PRIVATE_KEY to a funded Base Sepolia wallet to register and search." +
        "\nTestnet USDC faucet: https://faucet.circle.com\n",
    );
    return;
  }

  const chain = process.env.NETWORK === "base" ? base : baseSepolia;
  const account = privateKeyToAccount(PRIVATE_KEY);
  const wallet = createWalletClient({ account, chain, transport: http() }).extend(publicActions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pay = wrapFetchWithPayment(fetch, wallet as any);

  // ---- ③ register — $0.01 -------------------------------------------------
  console.log(`\n③ Registering "${LISTING.name}" from ${account.address} — $0.01`);
  const registered = await pay(`${BASE_URL}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(LISTING),
  });
  const record = await registered.json();
  if (!registered.ok) throw new Error(`register failed: ${registered.status} ${JSON.stringify(record)}`);

  console.log("\n   the artifact — a signed listing:");
  console.log(JSON.stringify(record.listing, null, 2));
  console.log(`   signature: ${record.signature}`);
  console.log(`   updateKey: ${record.updateKey}   ← returned once, stored only as a hash`);

  const r1 = registered.headers.get("x-payment-response");
  if (r1) console.log("   X-PAYMENT-RESPONSE:", decodeXPaymentResponse(r1));

  // Anyone can check the signature for free.
  const check = await fetch(`${BASE_URL}/check-signature`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: record.listing, signature: record.signature }),
  });
  console.log(`   signature valid: ${(await check.json()).valid}`);

  // ---- ④ search — $0.001 --------------------------------------------------
  console.log(`\n④ Searching for "weather" — $0.001`);
  const found = await pay(`${BASE_URL}/search?q=weather&rail=solana`);
  const results = await found.json();
  console.log(`   ${results.count} result(s), filtered to listings accepting the Solana rail:`);
  for (const r of results.results) {
    console.log(`\n   ${r.name}  (score ${r.score}, matched ${r.matched.join(", ")})`);
    console.log(`   ${r.description}`);
    console.log(`   skill.md: ${r.skillMdUrl}`);
    console.log(`   rails: ${r.rails.map((x: { network: string }) => x.network).join(" + ")}`);
    for (const route of r.resources) console.log(`     ${route.resource.padEnd(28)} ${route.price}`);
  }
  console.log(
    "\n   Fetch skillMdUrl next and you have everything needed to call and pay that service.",
  );

  // ---- ⑤ the rule, demonstrated ------------------------------------------
  console.log(`\n⑤ Trying to register an EVM-only listing — expect 422`);
  const singleRail = await pay(`${BASE_URL}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...LISTING,
      name: `${LISTING.name}-evm-only`,
      rails: [LISTING.rails[0]],
    }),
  });
  const rejection = await singleRail.json();
  console.log(`   HTTP ${singleRail.status}  ${rejection.error}`);
  console.log(`   ${rejection.message}`);
  console.log(
    "\n   Note you still paid the $0.01 — the fee buys the validation, and the rejection is a " +
      "\n   real answer. Validate your rails before registering.",
  );
}

main().catch((err) => {
  console.error("\nfailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

/* ---------------------------------------------------------------------------
 * Paying on the SOLANA rail instead
 * ---------------------------------------------------------------------------
 *   import {
 *     prepareSolanaCheckout,
 *     encodeX402Payment,
 *   } from "@three-ws/x402-payment-modal/server";
 *
 *   const url       = `${BASE_URL}/search?q=weather`;
 *   const challenge = await (await fetch(url)).json();
 *   const accept    = challenge.accepts.find((a: any) => a.network.startsWith("solana"));
 *
 *   const { tx_base64 } = await prepareSolanaCheckout({ accept, buyer: myPubkey });
 *   const signed        = await wallet.signTransaction(tx_base64);   // Phantom, Solflare, a keypair
 *   const { x_payment } = encodeX402Payment({ accept, signedTxBase64: signed, resourceUrl: url });
 *
 *   const res = await fetch(url, { headers: { "X-PAYMENT": x_payment } });
 *
 * Those helpers only build and encode the payment client-side; verification and
 * settlement happen server-side through the rail's facilitator.
 * `accept.extra.feePayer` sponsors the SOL network fee, so the buyer spends USDC only.
 *
 * The browser demo at /index.html does exactly this, driven by the drop-in modal —
 * it reads both rails out of the 402 and lets a human pick Phantom or an EVM wallet.
 *
 * ---------------------------------------------------------------------------
 * The raw dual-rail 402, for reference
 * ---------------------------------------------------------------------------
 *   $ curl -s 'localhost:4030/search?q=domain' | jq '.accepts[] | {network, payTo, maxAmountRequired}'
 *   { "network": "base-sepolia", "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "1000" }
 *   { "network": "solana",       "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "1000" }
 */
