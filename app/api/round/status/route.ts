import { getServerEnv } from "@/lib/server/env";
import { getDepositRound } from "@/lib/server/deposit-round";

export const dynamic = "force-dynamic";

export function GET() {
  if (!getServerEnv().portalEnabled) {
    return Response.json({ error: "Round unavailable." }, { status: 404 });
  }
  // Public read-only data: no balances, secrets or operator access token.
  return Response.json(getDepositRound(), {
    headers: { "Cache-Control": "no-store" },
  });
}
