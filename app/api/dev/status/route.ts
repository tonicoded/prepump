import { assertDevAccess, devErrorResponse, getPublicDevConfig } from "@/lib/server/env";
import { getLaunchWalletBalance } from "@/services/server/pumpfun";
import type { LaunchWalletStatus } from "@/lib/dev/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const env = assertDevAccess(request);
    const config = getPublicDevConfig();

    let wallet: LaunchWalletStatus = { address: null, balanceSol: null };
    if (env.launchWalletSecret) {
      try {
        wallet = await getLaunchWalletBalance();
      } catch (error) {
        wallet = {
          address: null,
          balanceSol: null,
          error: error instanceof Error ? error.message : "Wallet unavailable",
        };
      }
    }

    return Response.json({ config, wallet });
  } catch (error) {
    return devErrorResponse(error);
  }
}
