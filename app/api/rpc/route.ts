import { getServerEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin JSON-RPC proxy.
 *
 * The public Solana endpoint answers browser requests with 403, and a paid
 * endpoint would put its key in the client bundle. Forwarding through here
 * fixes both: the browser talks to our own domain and the URL stays server
 * side. Only the read methods the interface actually needs are allowed.
 */
const ALLOWED = new Set([
  "getLatestBlockhash",
  "getBalance",
  "getSignatureStatuses",
  "getAccountInfo",
  "getTokenAccountBalance",
  "getMinimumBalanceForRentExemption",
  "getHealth",
]);

type RpcCall = { method?: unknown; id?: unknown; jsonrpc?: unknown };

function rejected(call: RpcCall) {
  return {
    jsonrpc: "2.0",
    id: (call?.id as string | number) ?? null,
    error: {
      code: -32601,
      message: `Method ${String(call?.method)} is not available through this proxy.`,
    },
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as RpcCall | RpcCall[];
  const calls = Array.isArray(body) ? body : [body];

  if (calls.some((call) => !ALLOWED.has(String(call?.method)))) {
    const denied = calls.filter((call) => !ALLOWED.has(String(call?.method)));
    return Response.json(Array.isArray(body) ? denied.map(rejected) : rejected(denied[0]), {
      status: 403,
    });
  }

  const upstream = await fetch(getServerEnv().rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
