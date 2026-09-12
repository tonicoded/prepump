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
 * The joke is always the same shape as the stickers on the site: a real
 * photographed thing, badly costumed, having a very bad or very stupid day on
 * the chart. Subject and beat are sampled separately so rounds do not repeat.
 */
const SUBJECTS = [
  "a house cat",
  "a golden retriever",
  "a pigeon",
  "a marble statue of a Greek god",
  "a goat",
  "a frog",
  "a hamster",
  "a raccoon",
  "a cow",
  "a pug",
  "a seagull",
  "a llama",
  "a chimpanzee",
  "a bulldog",
  "a parrot",
  "a duck",
  "a turtle",
  "a donkey",
  "a walrus",
  "a sloth",
  "a crab",
  "an owl",
  "a bear",
  "a chicken",
  "a Renaissance oil-painting nobleman",
  "an ancient Egyptian bust",
  "a plastic garden gnome",
  "a mall security guard",
  "a medieval knight in armour",
  "a deep sea diver in an old brass helmet",
];

/** What just happened to them. This is where the comedy actually lives. */
const BEATS = [
  "has just watched its entire portfolio go to zero and is screaming",
  "sold at the exact bottom and is holding its head in both hands",
  "is grinning with insane confidence while everything behind it burns",
  "has been waiting so long for a green candle that it is covered in cobwebs",
  "is crying while clutching a phone showing a red chart",
  "is flexing enormous muscles over a single tiny coin",
  "is asleep at a desk having missed the entire pump",
  "is sweating through a cheap suit during a live interview",
  "is pointing proudly at a chart that is going straight down",
  "is eating instant noodles in a mansion it cannot afford",
  "has too many monitors and clearly no idea what any of them say",
  "is being handed an enormous bill and looks betrayed",
  "is celebrating with champagne one second before the rug",
  "is stuffing its cheeks with as many coins as it can hold",
  "is wearing a neck brace and still refuses to sell",
  "is doing a victory dance on a completely empty trading floor",
  "has bloodshot eyes and has not slept since the launch",
  "is holding a briefcase that is obviously empty",
  "is trying to look serious in sunglasses two sizes too big",
  "is presenting a roadmap drawn on a napkin",
];

/**
 * House style, copied from the stickers already on the site: photographic
 * cut-outs, crudely combined, never illustration.
 */
const STYLE = [
  "Photographic meme sticker, cut out of real photographs.",
  "Looks like a crude photo collage somebody made in five minutes:",
  "real photographed subject, real photographed clothes and props pasted on,",
  "slightly mismatched lighting and scale, visible rough cut-out edges.",
  "Flat bright green background, nothing else in the scene.",
  "Thick white sticker outline around the whole subject.",
  "Slightly oversaturated and over-sharpened, low-fi internet meme energy.",
  "Absolutely not an illustration, not a cartoon, not a 3D render, not digital",
  "painting, not concept art, not a cute mascot.",
  "No text, no letters, no numbers, no logos, no watermarks.",
  "No real people, no celebrities, no existing meme characters.",
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
    : `This round's meme: ${pick(SUBJECTS)} that ${pick(BEATS)}.`;

  const response = await client.responses.parse({
    model: config.openAiModel,
    store: false,
    instructions: [
      "You write meme coins for a Solana mystery launch. Think 2016 forum",
      "reaction image, not brand mascot. It has to be funny first.",
      "The name is short, dumb and instantly readable, the kind of thing people",
      "type in a chat. Two words at most. It must describe the thing in the",
      "picture, so seeing the image explains the name.",
      "tagline is one short punchline under 60 characters.",
      "description is one or two sentences, under 200 characters, deadpan.",
      "imagePrompt describes ONLY what is physically in the photo: the subject,",
      "its exact facial expression, its clothes and its props. Be concrete and",
      "visual. One or two sentences. No style words, no background, no text in",
      "the image, no camera or lighting terms.",
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
