import { getServerEnv } from "@/lib/server/env";
import { getDepositRound } from "@/lib/server/deposit-round";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const env = getServerEnv();
  const scope =
    new URL(request.url).searchParams.get("scope") === "dev" ? "dev" : "home";
  const available =
    scope === "dev" ? env.portalEnabled : env.portalEnabled || env.homeDepositsEnabled;
  if (!available) {
    return Response.json({ error: "Round unavailable." }, { status: 404 });
  }
  // Public read-only data: no balances, secrets or operator access token.
  return Response.json(getDepositRound(scope), {
    headers: { "Cache-Control": "no-store" },
  });
}
