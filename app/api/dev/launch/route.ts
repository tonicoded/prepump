import { z } from "zod";
import { assertDevAccess, devErrorResponse } from "@/lib/server/env";
import { launchRequestSchema, launchRound } from "@/services/server/launch";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    assertDevAccess(request);
    const input = launchRequestSchema.parse(await request.json());
    const receipt = await launchRound(input);
    return Response.json({ receipt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: `Invalid launch payload: ${error.issues[0]?.message ?? "unknown"}` },
        { status: 400 },
      );
    }
    return devErrorResponse(error);
  }
}
