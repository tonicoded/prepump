/**
 * Endpoint the browser talks to. Defaults to our own proxy so the public
 * Solana RPC's 403 on browser origins never bites; set NEXT_PUBLIC_SOLANA_RPC
 * to a browser-capable endpoint to skip the hop.
 */
function browserEndpoint() {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC?.trim();
  if (!configured) return "/api/rpc";

  // Solana's public endpoints answer browser origins with 403, so a browser
  // must never be pointed at one. Fall back to the proxy instead.
  return /api\.(mainnet-beta|devnet|testnet)\.solana\.com/.test(configured)
    ? "/api/rpc"
    : configured;
}

export const BROWSER_RPC = browserEndpoint();

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
