import { z } from "zod";
import { assertDevAccess, devErrorResponse } from "@/lib/server/env";
import { generateMeme } from "@/services/server/meme-generator";
import { MEME_MODE_IDS } from "@/lib/round/meme-modes";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  theme: z.string().max(180).optional(),
  includeImage: z.boolean().optional(),
  mode: z.enum(MEME_MODE_IDS).optional(),
});

export async function POST(request: Request) {
  try {
    assertDevAccess(request);
    const body = bodySchema.parse(await request.json());
    const token = await generateMeme(body.theme, body.includeImage, body.mode);
    return Response.json({ token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid generation request." }, { status: 400 });
    }
    return devErrorResponse(error);
  }
}
