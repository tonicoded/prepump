import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import type { RoundConfig } from "./config.ts";

export type GeneratedMeme = {
  name: string;
  ticker: string;
  tagline: string;
  description: string;
  imagePrompt: string;
  /** data: URL produced by the image model, when one was generated. */
  imageDataUrl?: string;
  /** Set when the text came back but the artwork call failed. */
  imageError?: string;
};

const generatedMemeSchema = z.object({
  name: z.string().min(2).max(24),
  ticker: z.string().regex(/^[A-Z0-9]{2,8}$/),
  tagline: z.string().min(4).max(70),
  description: z.string().min(20).max(200),
  imagePrompt: z.string().min(20).max(700),
});

/**
 * Subject buckets, sampled per round. Without them the model keeps landing on
 * cats and frogs; with them every round lands somewhere else.
 */
const SUBJECTS = [
  "an animal doing a human job",
  "a household appliance with a personality problem",
  "a piece of food that has given up",
  "a mythological figure in modern clothes",
  "a vehicle that should not be driving",
  "an office worker losing their mind",
  "a security guard of something worthless",
  "a gym character with terrible advice",
  "a deep sea creature with big opinions",
  "a medieval peasant discovering technology",
  "a bird that is clearly up to something",
  "a statue that came to life and regrets it",
  "an insect running a small business",
  "a dog convinced it is a financial analyst",
  "a plant that has seen too much",
  "a cowboy in the wrong century",
  "a wizard with one useless spell",
  "a delivery driver for cursed packages",
  "a reptile with an ego problem",
  "a snowman aware of the forecast",
  "a chef who cannot cook",
  "a fish out of water, literally",
  "a robot built for one pointless task",
  "a farm animal with a superiority complex",
];

const MOODS = [
  "smug",
  "panicking",
  "devastated",
  "overconfident",
  "exhausted",
  "suspicious",
  "delighted for no reason",
  "deeply serious",
  "unbothered",
  "furious",
];

/** House style: the cut-out sticker memes already used across the site. */
const STYLE = [
  "Low-fi internet meme sticker in the style of a photo cut-out collage.",
  "Single subject, centred, filling most of the square frame.",
  "Flat bright acid-green background, no scenery, no gradients.",
  "Hard white sticker outline around the subject with a thin black edge.",
  "Slightly over-sharpened, compressed, early-2010s forum meme energy.",
  "No text, no letters, no numbers, no logos, no watermarks, no borders.",
  "Original character only: no real people, celebrities, brands, or existing",
  "meme characters such as Pepe, Doge, Wojak, Shiba or Chad.",
].join(" ");

const FALLBACKS: GeneratedMeme[] = [
  {
    name: "Chairman Meow",
    ticker: "MEOW",
    tagline: "He audited the dip. The dip failed.",
    description:
      "A permanently disappointed orange trader cat running risk management from a broken office chair.",
    imagePrompt: "An orange cat CEO in a cheap suit behind a broken desk.",
  },
  {
    name: "Toaster Larry",
    ticker: "LARRY",
    tagline: "Two slots. No plan.",
    description:
      "A kitchen toaster with tired eyes that has burned every single thing it was trusted with.",
    imagePrompt: "A dented chrome toaster with sad cartoon eyes and crumbs.",
  },
  {
    name: "Gary The Goose",
    ticker: "GARY",
    tagline: "He knows what he did.",
    description:
      "A suspicious goose in a tiny high-visibility vest who guards a car park nobody parks in.",
    imagePrompt: "A smug goose wearing a tiny orange safety vest.",
  },
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export async function generateMeme(
  config: RoundConfig,
  theme?: string,
  includeImage = false,
): Promise<GeneratedMeme> {
  if (!config.openAiApiKey) return pick(FALLBACKS);

  const client = new OpenAI({ apiKey: config.openAiApiKey });
  const brief = theme?.trim()
    ? `Creative direction from the operator: ${theme.slice(0, 180)}`
    : `This round's subject: ${pick(SUBJECTS)}. Its mood: ${pick(MOODS)}.`;

  const response = await client.responses.parse({
    model: config.openAiModel,
    store: false,
    instructions: [
      "You invent one original meme coin for a Solana mystery launch.",
      "The name and ticker must describe the character that will be in the",
      "artwork, so somebody seeing the picture immediately gets the name.",
      "Keep it funny and internet-native, never corporate.",
      "description is one or two short sentences, under 200 characters.",
      "imagePrompt describes only the character, its expression, its clothing",
      "and its props, in one or two sentences. No style words, no background",
      "description, no text in the image.",
      "Avoid trademarks, real people, existing meme characters, slurs, and any",
      "promise of profit.",
    ].join(" "),
    input: brief,
    text: { format: zodTextFormat(generatedMemeSchema, "prepump_meme") },
  });

  const meme = response.output_parsed;
  if (!meme) throw new Error("OpenAI returned no valid meme metadata.");
  if (!includeImage) return meme;

  // The artwork is a bonus: if it fails, the round still gets a token.
  try {
    const image = await client.images.generate({
      model: config.openAiImageModel,
      prompt: `${meme.imagePrompt} ${STYLE}`,
      size: config.openAiImageSize as "1024x1024",
      quality: config.openAiImageQuality as "medium",
      output_format: "webp",
      output_compression: 85,
      background: "opaque",
      n: 1,
    });

    const encoded = image.data?.[0]?.b64_json;
    if (!encoded) throw new Error("The image model returned no data.");

    // Square down to the size pump.fun actually displays, which keeps the
    // payload small enough to hand back through the browser.
    const square = await sharp(Buffer.from(encoded, "base64"))
      .resize(config.tokenImageSize, config.tokenImageSize, { fit: "cover" })
      .webp({ quality: 86 })
      .toBuffer();

    return {
      ...meme,
      imageDataUrl: `data:image/webp;base64,${square.toString("base64")}`,
    };
  } catch (error) {
    return {
      ...meme,
      imageError:
        error instanceof Error
          ? `Artwork failed: ${error.message}`
          : "Artwork generation failed.",
    };
  }
}
