import "server-only";

import { readRoundConfig } from "@/lib/round/config";
import { generateMeme as generate } from "@/lib/round/meme";
import type { GeneratedMeme } from "@/lib/dev/types";

export async function generateMeme(
  theme?: string,
  includeImage = false,
): Promise<GeneratedMeme> {
  return generate(readRoundConfig(), theme, includeImage);
}
