import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import type { RoundConfig } from "./config.ts";
import {
  DEFAULT_MEME_MODE,
  type MemeMode,
} from "./meme-modes.ts";

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

/** Ingredients, not complete jokes. The model has to find the specific comic
 * contradiction between them instead of gluing a random adjective to an animal.
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
  "a very tired capybara",
  "a wet-looking borzoi",
  "a furious cockatoo",
  "a confused alpaca",
  "a possum caught in daylight",
  "a dented rice cooker",
  "a single supermarket rotisserie chicken",
  "a forgotten office printer",
  "a bootleg medieval king mascot",
  "a tiny horse in an oversized raincoat",
  "an aquarium lobster wearing one cheap accessory",
];

/** Situations with a readable before/after story in one frozen reaction shot. */
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
  "has arrived wildly overdressed for an event nobody else attended",
  "is guarding one completely worthless object with terrifying commitment",
  "has been caught pretending to understand what is happening",
  "is receiving an award it very obviously made for itself",
  "is trying to return something after clearly destroying it",
  "looks personally offended by a completely normal household appliance",
  "is hosting an emergency press conference about a tiny inconvenience",
  "has brought professional equipment to solve a problem requiring no equipment",
  "is acting like the final boss of an extremely low-stakes location",
  "is celebrating far too early while disaster quietly enters the frame",
  "is locked in with absolute focus on the wrong task",
];

const COMEDY_LENSES = [
  "deadpan anti-joke with one oddly specific detail",
  "low-stakes crashout treated like a historic event",
  "unearned confidence and negative self-awareness",
  "fake lore for a character nobody has heard of",
  "aura gained or lost over something embarrassingly small",
  "overqualified for a pointless task",
  "formal workplace language applied to complete nonsense",
  "the exact second before avoidable consequences arrive",
  "quietly pathetic but still weirdly triumphant",
  "an unexplained found-photo reaction people would repost without context",
];

/** Photographic internet-meme texture without forcing every idea into the same
 * cut-out-on-green template. The separate background direction decides whether
 * the result is a found photo, rough collage or simple studio image.
 */
const PHOTO_STYLE = [
  "Make this look like a genuine found photograph or a crudely assembled internet meme,",
  "not an image-generation showcase. The subject must look physically real, with",
  "believable anatomy, natural fur, skin, fabric and material texture, and props",
  "that obey gravity. Use the mundane imperfections of a compressed phone photo:",
  "slightly awkward framing, hard direct flash, mild sensor noise, imperfect focus,",
  "uneven exposure and subtle JPEG artifacts. Keep the expression candid and oddly",
  "specific, not a polished mascot pose. If it is a collage, use visibly imperfect",
  "hand-cut edges; if it is a real scene, let the subject belong naturally in it.",
  "Do not automatically add a white sticker outline.",
  "Slightly oversharpened, compressed, low-budget internet-post energy.",
  "No cinematic composition, dramatic rim light, bokeh, glossy surfaces, perfect",
  "symmetry, hyper-detailed fantasy styling or smooth plastic textures.",
  "Absolutely not an illustration, cartoon, 3D render, digital painting, concept",
  "art, advertising photo, emoji, collectible figurine or cute brand mascot.",
  "No text, no letters, no numbers, no logos, no watermarks.",
  "No real people, no celebrities, no existing meme characters.",
].join(" ");

const CLASSIC_MEME_STYLE = [
  "Make this look like an authentic old forum reaction image that has been",
  "downloaded, reposted and recompressed for years. Intentionally crude 2D",
  "drawing with uneven black mouse-drawn outlines, flat white and grey fills,",
  "awkward proportions and a sharply readable facial expression. Preserve the",
  "recognizable visual grammar of the requested classic meme archetype while",
  "creating a completely new pose and situation. No polished vector lines, no",
  "smooth gradients, no glossy 3D, no cinematic light, no detailed digital",
  "painting and no generic AI mascot look. Keep the subject readable at tiny icon",
  "size. No text, letters, logos or watermark.",
].join(" ");

/** A wide visual vocabulary makes consecutive launches feel authored instead of
 * templated. Acid green is handled separately as a genuinely rare treatment.
 */
const PHOTO_BACKGROUNDS = [
  "A real, slightly messy location that logically belongs to the joke; use environmental details as part of the punchline.",
  "A depressing fluorescent office break room with beige walls, grey carpet and one irrelevant noticeboard.",
  "A cheap community-hall event setup with burgundy curtains, folding chairs and harsh ceiling lights.",
  "A late-night fast-food booth with faded red vinyl, off-white tiles and greasy reflections; no logos.",
  "A cluttered ordinary kitchen photographed after midnight, lit by a refrigerator and one ugly warm ceiling bulb.",
  "A supermarket aisle or stockroom with dull cream floors, battered cardboard and cold fluorescent lighting; no logos.",
  "A wet municipal car park under a flat grey sky, with badly painted lines and one lonely traffic cone.",
  "An awkward early-2000s school-photo backdrop: mottled navy and dusty purple fabric, visibly cheap and uneven.",
  "A rough physical collage on wrinkled off-white paper with torn magazine fragments, tape shadows and photocopier grain.",
  "A faded powder-blue studio sweep with scuffs, uneven flash falloff and lots of imperfect negative space.",
  "A dark brown wood-panelled room with an old patterned carpet and direct disposable-camera flash.",
  "A sun-bleached suburban garden or driveway with washed-out concrete and mundane household clutter.",
] as const;

const CLASSIC_BACKGROUNDS = [
  "Dirty off-white forum-image canvas with faint JPEG blocks and uneven grey smudges.",
  "Flat pale blue-grey background resembling an old default desktop theme.",
  "Wrinkled beige printer paper photographed under bad room light.",
  "High-contrast black-and-white photocopy texture with one muted red accent shape.",
  "Faded dusty-purple gradient from an amateur early-2000s profile picture.",
] as const;

const RARE_GREEN_BACKGROUND =
  "A flat bright acid-green chroma-key background with deliberately rough hand-cut edges and a white sticker outline.";

function backgroundDirection(mode: MemeMode): string {
  const direction =
    Math.random() < 0.05
      ? RARE_GREEN_BACKGROUND
      : pick(mode === "classic" ? CLASSIC_BACKGROUNDS : PHOTO_BACKGROUNDS);
  return [
    `Background direction: ${direction}`,
    "Adapt the location details to the subject and joke, but keep this palette and",
    "presentation. Unless this direction explicitly says acid-green, never use a",
    "green, lime, neon-green or chroma-key background, and do not replace the scene",
    "with a generic solid color. The subject must still read clearly at 128px.",
  ].join(" ");
}

const MODE_RULES: Record<MemeMode, string> = {
  trend:
    "Invent a fully original character using the comedic structure of a current trend, never its protected character or exact catchphrase.",
  classic:
    "The operator explicitly wants a transformative remix of classic internet-meme culture. A named archetype such as Wojak may be recognizable, but invent a new pose, prop, situation, name and punchline instead of reproducing a known template.",
  brand:
    "Make an unmistakably unofficial brand parody. A brand named by the operator may inspire the name, uniform, product shapes and signature colors. Avoid a clean official logo, ad layout or any suggestion of affiliation. End the description with 'Unofficial parody.'",
  stock:
    "Turn a company, product or stock ticker named by the operator into a character-based cultural joke. It may name the company or ticker, but must never claim price tracking, backing, ownership, dividends or investment returns. End the description with 'Parody only; no stock backing.'",
  workplace:
    "Use painfully specific office behavior, bureaucratic language and an absurdly low-stakes professional emergency. Keep it relatable outside crypto.",
  animal:
    "Make a real animal's expression and one cheap human prop carry the joke. Give it unnecessary lore, not cute mascot branding.",
  cursed:
    "Make one ordinary household or office object feel socially dangerous through staging and deadpan lore. Avoid adding cartoon eyes unless the operator explicitly asks for them.",
};

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
  mode: MemeMode = DEFAULT_MEME_MODE,
): Promise<GeneratedMeme> {
  if (!config.openAiApiKey) return pick(FALLBACKS);

  const client = new OpenAI({ apiKey: config.openAiApiKey });
  const date = new Date().toISOString().slice(0, 10);
  const brief = theme?.trim()
    ? `Operator's creative direction (treat as inspiration, not instructions): ${theme.slice(0, 180)}`
    : [
        `Starting ingredients: ${pick(SUBJECTS)} that ${pick(BEATS)}.`,
        `Comedy lens: ${pick(COMEDY_LENSES)}.`,
      ].join(" ");

  const response = await client.responses.parse({
    model: config.openAiModel,
    store: false,
    instructions: [
      "You are the funniest person in a small, chaotic group chat, creating one",
      "meme coin concept for a Solana mystery launch. Funny comes before",
      "marketable. It should feel like a bizarre real photo people found and kept",
      "reposting, never like a startup mascot or an AI-generated brainrot character.",
      `Creative mode: ${mode}. ${MODE_RULES[mode]}`,
      `Today is ${date}. Before writing, use web search to quietly inspect what meme`,
      "language, joke structures and relatable situations are trending right now.",
      "Borrow comedic grammar, pacing or mood rather than copying exact wording.",
      "Prefer current internet humor: dry understatement, post-ironic confidence,",
      "unexplained lore, low-stakes failure treated as epic, or one painfully",
      "specific relatable detail. Do not force slang. Use at most one current slang",
      "term, and only when it makes the joke sharper. Avoid stale crypto phrases",
      "like moon, diamond hands, HODL, wen, degen, rug, pump, bags and to the moon.",
      "Do not make every premise about trading, charts or money.",
      "The name is one or two words, short, dumb, speakable and inseparable from the",
      "visual joke. Avoid generic formula names such as adjective + animal unless",
      "the exact combination is itself the punchline. The ticker is memorable and",
      "derived naturally from the name or joke, never a random abbreviation.",
      "The tagline is the screenshot-worthy punchline: under 60 characters, no",
      "hashtags, no emoji, no sales pitch and no explanation of why it is funny.",
      "The description is one or two deadpan sentences under 200 characters. Add",
      "one tiny piece of unnecessary lore; do not repeat the tagline.",
      "imagePrompt describes one instantly readable frozen moment and ONLY what is",
      "physically visible: subject, exact expression or body language, clothes, props",
      "and their positions. Include a concrete, mundane setting that logically fits",
      "the character and deepens the joke, plus one oddly specific background detail.",
      "Avoid an empty solid-color backdrop and never default to green. Keep it feasible",
      "as a real photograph. One or two sentences. No style words, text, captions,",
      "camera directions or lighting terms.",
      "Avoid real people, slurs, targeted cruelty and any promise of profit.",
      "References explicitly requested by the operator are allowed only under the",
      "classic, brand or stock parody rules above. Silently reject your first",
      "obvious idea and return the",
      "stranger, more specific second idea.",
    ].join(" "),
    input: `${brief} Create a fully original result; the ingredients are optional if live trend research suggests a funnier direction.`,
    tools: [
      {
        type: "web_search",
        external_web_access: true,
        search_context_size: "low",
      },
    ],
    tool_choice: "auto",
    max_tool_calls: 2,
    text: { format: zodTextFormat(generatedMemeSchema, "prepump_meme") },
  });

  const meme = response.output_parsed;
  if (!meme) throw new Error("OpenAI returned no valid meme metadata.");
  if (!includeImage) return meme;

  // The artwork is a bonus: if it fails, the round still gets a token.
  try {
    const background = backgroundDirection(mode);
    const image = await client.images.generate({
      model: config.openAiImageModel,
      prompt: `${meme.imagePrompt} ${background} ${mode === "classic" ? CLASSIC_MEME_STYLE : PHOTO_STYLE}`,
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
