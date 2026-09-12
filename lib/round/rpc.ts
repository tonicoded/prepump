/**
 * Endpoint the browser talks to. Defaults to our own proxy so the public
 * Solana RPC's 403 on browser origins never bites; set NEXT_PUBLIC_SOLANA_RPC
 * to a browser-capable endpoint to skip the hop.
 */
const PUBLIC_SOLANA = /api\.(mainnet-beta|devnet|testnet)\.solana\.com/;

/**
 * Absolute, because web3.js's Connection rejects a relative path outright.
 * Resolved at call time so it picks up whatever origin the page is served on.
 */
export function browserRpcUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC?.trim();

  // Solana's public endpoints answer browser origins with 403, so a browser
  // must never be pointed at one. Use the proxy instead.
  if (configured && !PUBLIC_SOLANA.test(configured)) return configured;

  return typeof window === "undefined"
    ? "http://localhost:3000/api/rpc"
    : new URL("/api/rpc", window.location.origin).toString();
}

/** Polls over HTTP. `confirmTransaction` would open a websocket the proxy has not got. */
export async function waitForConfirmation(
  connection: {
    getSignatureStatuses: (signatures: string[]) => Promise<{
      value: ({ err: unknown; confirmationStatus?: string } | null)[];
    }>;
  },
  signature: string,
  timeoutMs = 90_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("The transfer was sent but has not confirmed yet.");
}
