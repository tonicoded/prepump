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
  /** Visual style the artwork was rendered in. */
  style?: string;
  /** Short printed text on the artwork, when the joke has one. */
  slogan?: string;
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
  slogan: z.string().max(40),
});

/** Several very different concepts, then a ruthless pick of the funniest. */
const conceptBatchSchema = z.object({
  candidates: z.array(generatedMemeSchema),
  winner: z.number().int(),
  reason: z.string().max(240),
});

/** A coin PREPUMP already launched. Its name, ticker and subject are spent. */
export type MemeHistoryEntry = { name: string; ticker: string; description?: string };

export type GenerateMemeOptions = {
  /** Earlier coins, newest first. Never reused, and recent subjects are rested. */
  avoid?: readonly MemeHistoryEntry[];
};

const CANDIDATE_COUNT = 4;
/** How many recent coins rest their main subject before it can return. */
const SUBJECT_REST = 12;

const imageBriefSchema = z.object({
  imagePrompt: z.string().min(20).max(700),
});

const imageReviewSchema = z.object({
  identityAnchorVisible: z.boolean(),
  coreJokeReadable: z.boolean(),
  blockingIssue: z.boolean(),
  reason: z.string().min(5).max(240),
  correction: z.string().min(5).max(400),
});

/* ------------------------------------------------------------------------ */
/*  Ingredients. Subject, beat, lens and style are sampled independently,   */
/*  so the space of combinations is in the hundreds of thousands.           */
/* ------------------------------------------------------------------------ */

const SUBJECTS = [
  // animals
  "a house cat", "a golden retriever", "a pigeon", "a goat", "a frog",
  "a hamster", "a raccoon", "a cow", "a pug", "a seagull", "a llama",
  "a chimpanzee", "a bulldog", "a parrot", "a duck", "a turtle", "a donkey",
  "a walrus", "a sloth", "a crab", "an owl", "a bear", "a chicken",
  "a very tired capybara", "a wet-looking borzoi", "a furious cockatoo",
  "a confused alpaca", "a possum caught in daylight", "a bald eagle",
  "a flamingo", "a hedgehog", "a penguin", "an axolotl", "a moose",
  "a shrimp", "a snail", "a jellyfish", "a tiny horse in an oversized raincoat",
  "an aquarium lobster wearing one cheap accessory", "a hippo in a tutu",
  "a sweaty guinea pig", "a pelican", "a goose with a grudge",
  // Human archetypes are reserved for explicit operator direction.
  // statues, toys and figures
  "a marble statue of a Greek god", "an ancient Egyptian bust",
  "a plastic garden gnome", "a rubber duck", "a nutcracker soldier",
  "a bobblehead", "a garden flamingo ornament",
  // objects and food
  "a dented rice cooker", "a single supermarket rotisserie chicken",
  "a forgotten office printer", "a traffic cone", "a vending machine",
  "a robot vacuum", "a lava lamp", "a microwave", "a gas station hot dog",
  "a potato", "a houseplant", "a toaster", "a banana", "a slice of pizza",
  "a shopping trolley", "a fire hydrant", "a bowling pin", "a croissant",
] as const;

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
  "is flying upward in a superhero pose because one number turned green",
  "is telling everyone to stop being poor while being visibly broke",
  "is giving a TED talk about a mistake it made yesterday",
  "is proudly flexing a receipt for one dollar",
  "refuses to leave a boat that is clearly sinking",
  "is teaching a masterclass that nobody signed up for",
  "is posing next to a supercar it obviously rented for an hour",
  "is signing autographs for absolutely nobody",
  "is pretending to be on a very important phone call",
  "is holding a giant novelty cheque for a tiny amount",
  "is getting knighted for doing the bare minimum",
  "is personally escorting one tiny coin to safety",
  "is pitching a business idea to a pigeon",
  "is aggressively stretching before doing nothing at all",
  "is overreacting to a single phone notification",
  "is on its fourth energy drink before breakfast",
  "has built a candlelit shrine to one lucky screenshot",
  "is wearing a crown made of old receipts",
  "is staring at its phone and slowly accepting reality",
  "is running a meeting where it is the only attendee",
  "is doing a dramatic slow-motion walk away from a tiny explosion",
  "is stuck halfway through a cat flap but still giving orders",
  "is wearing a full crash helmet to open one envelope",
  "brought a folding chair and snacks to watch a microwave finish",
  "has hired a bodyguard for a single chicken nugget",
  "is filing a formal complaint against a puddle",
  "is taking a proud selfie with a completely normal rock",
  "is doing push-ups to impress a vending machine",
  "is leaving a five-star review for a cardboard box",
  "is parallel parking a shopping trolley with enormous concentration",
  "refuses to share one french fry with anyone, ever",
  "is dramatically fainting because the wifi dropped for one second",
  "is wearing sunglasses indoors to hide that it cried at a commercial",
] as const;

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
  "hype-thumbnail overconfidence about something tiny",
  "motivational poster energy for a terrible decision",
  "main character syndrome in an ordinary place",
  "a delusional flex with the evidence against it in the same frame",
  "a very serious documentary tone about something stupid",
] as const;

/** Inspiration only. The writer picks, twists or ignores these. */
const SLOGAN_SEEDS = [
  "STOP BEING POOR", "TRUST ME BRO", "EMOTIONAL SUPPORT COIN",
  "SELLING IS FOR QUITTERS", "RICH IN SPIRIT", "BUY HIGH SELL LOW",
  "I READ ONE TWEET", "NOT A FINANCIAL ADVISOR", "LIVING ON VIBES",
  "RETIRED AT LUNCH", "CEO OF BAD DECISIONS", "WORLD'S OKAYEST TRADER",
  "SMARTEST GUY IN CHAT", "PROFESSIONAL LOSER", "FEW UNDERSTAND",
  "HE WAS RIGHT", "AURA FARMING", "COPE HARDER",
  "WIFE CHANGED THE PASSWORD", "LAST BRAIN CELL", "I SOLD TOO EARLY",
  "ASK ME ABOUT MY LOSSES", "MINDSET OF A WINNER", "DO NOT TALK TO ME",
  "RENT IS A SCAM", "BROKE BUT HAPPY", "ALL IN ALWAYS", "PAID IN VIBES",
  "GET RICH OR CRY", "MONEY PRINTER GO", "I AM THE ECONOMY", "MOM I MADE IT",
  "UNEMPLOYED AND THRIVING", "FINANCIAL FREEDOM SOON", "BELIEVE IN YOURSELF",
  "I HAVE A PLAN", "NEVER SELLING", "BILLIONAIRE MINDSET",
] as const;

/* ------------------------------------------------------------------------ */
/*  Visual styles                                                          */
/* ------------------------------------------------------------------------ */

// Direction distilled from the public website memes and the approved mop cat /
// raincoat horse. Borrow the visual grammar, not their exact subjects or scenes.
const MEME_DIRECTION = [
  "PREPUMP's visual language is a scrappy photographic internet meme: a strong",
  "recognizable subject, an exaggerated reaction or deadpan expression, a cheap",
  "costume/accessory and one immediately readable visual contradiction.",
  "Approved examples of the mechanism, NOT scenes to copy: a regal cat doing",
  "janitor work with a mop; a tiny horse in a raincoat acting like an important",
  "delegate; a crying cat with a broken phone; a stone bust in pixel sunglasses;",
  "a skeleton still waiting at an ancient computer. Invent a fresh combination.",
  "Animals standing upright, wearing capes, crowns, ties or raincoats and handling",
  "props with paws/hooves are welcome intentional Photoshop absurdity.",
  "Keep the animal face, fur and paws/hooves recognizable. Do not graft on exposed",
  "human skin or realistic human hands. Statues and skeletons are allowed subjects.",
  "The joke is the mismatch between status, expression, outfit and situation,",
  "not a slogan explaining a bland scene. One hero, not a busy website banner.",
].join(" ");

const PHOTO_STYLE = [
  "Make this look like a genuine found photograph or a crudely assembled internet meme,",
  "not an image-generation showcase. The subject must look physically real, with",
  "believable anatomy, natural fur, skin, fabric and material texture, and props",
  "that have believable material texture. Impossible meme poses and cheap costume",
  "composites are intentional; do not simplify them into a boring wildlife photo.",
  "Use the mundane imperfections of a compressed phone photo:",
  "slightly awkward framing, hard direct flash, mild sensor noise, imperfect focus,",
  "uneven exposure and subtle JPEG artifacts. Keep the expression candid and oddly",
  "specific, not a polished mascot pose. If it is a collage, use visibly imperfect",
  "hand-cut edges; if it is a real scene, let the subject belong naturally in it.",
  "Slightly oversharpened, compressed, low-budget internet-post energy.",
  "Let a raincoat look like shiny cheap nylon, not polished CGI.",
  "No cinematic composition, dramatic rim light, bokeh, airbrushed surfaces or",
  "hyper-detailed fantasy styling. Not an illustration, cartoon or 3D render.",
].join(" ");

const CLASSIC_MEME_STYLE = [
  "Make this look like an authentic old forum reaction image that has been",
  "downloaded, reposted and recompressed for years. Intentionally crude 2D",
  "drawing with uneven black mouse-drawn outlines, flat white and grey fills,",
  "awkward proportions and a sharply readable facial expression. Preserve the",
  "recognizable visual grammar of the requested classic meme archetype while",
  "creating a completely new pose and situation. No polished vector lines, no",
  "smooth gradients, no glossy 3D and no generic AI mascot look. Keep the",
  "subject readable at tiny icon size.",
].join(" ");

const CLASSIC_BACKGROUNDS = [
  "Dirty off-white forum-image canvas with faint JPEG blocks and uneven grey smudges.",
  "Flat pale blue-grey background resembling an old default desktop theme.",
  "Wrinkled beige printer paper photographed under bad room light.",
  "High-contrast black-and-white photocopy texture with one muted red accent shape.",
  "Faded dusty-purple gradient from an amateur early-2000s profile picture.",
] as const;

type VisualStyle = {
  id: string;
  label: string;
  weight: number;
  modes: readonly MemeMode[] | "all";
  /** Where a slogan would physically appear; null means no slogan in this style. */
  sloganPlacement: string | null;
  /** The style is a captioned meme: the words are the punchline, always present. */
  captionRequired?: boolean;
  /** Text the style itself needs, besides any slogan. */
  extraText?: string;
  render: () => string;
};

const NOT_CLASSIC: readonly MemeMode[] = [
  "trend", "brand", "stock", "workplace", "animal", "cursed",
];

const VISUAL_STYLES: readonly VisualStyle[] = [
  {
    id: "photo",
    label: "Candid phone snapshot",
    weight: 6,
    modes: NOT_CLASSIC,
    sloganPlacement: null,
    render: () => PHOTO_STYLE,
  },
  {
    id: "sticker",
    label: "Rough photocollage",
    weight: 4,
    modes: NOT_CLASSIC,
    sloganPlacement: null,
    render: () => [
      "A deliberately amateur photographic cut-and-paste collage, with uneven",
      "scissor edges, mismatched scale and one obviously pasted-in prop.",
      "A rough white cut-out outline and hard offset black shadow are welcome,",
      "like PREPUMP website memes. No smooth vector mascot or polished ad layout.",
      `Simple background in ${pick(["off-white", "dusty blue", "muted peach", "charcoal", "faded lavender", "pale yellow", "grass green"])}.`,
      "Preserve the locked subject, action and prop; the collage is the medium, not a new joke.",
    ].join(" "),
  },
  {
    id: "disposable",
    label: "Disposable-camera snapshot",
    weight: 3,
    modes: NOT_CLASSIC,
    sloganPlacement: "one small physical label on the main prop",
    render: () => [
      "An awkward disposable-camera snapshot, muted warm colors, slightly tilted",
      "framing, hard flash falloff and ordinary lived-in surroundings belonging to",
      "the requested scene. No added border, date stamp or props.",
      "Believable materials and natural anatomy; no studio lighting or stock-photo polish.",
    ].join(" "),
  },
  {
    id: "forum-doodle",
    label: "Mouse-drawn reaction doodle",
    weight: 1,
    modes: "all",
    sloganPlacement: null,
    render: () => [
      CLASSIC_MEME_STYLE,
      "Use the locked subject rather than substituting a familiar meme character.",
      `Background: ${pick(CLASSIC_BACKGROUNDS)}`,
    ].join(" "),
  },
  {
    id: "cctv",
    label: "Security camera",
    weight: 1,
    modes: NOT_CLASSIC,
    sloganPlacement: null,
    extraText: "a small camera timestamp overlay in one corner",
    render: () => [
      "A grainy security-camera still from a high corner angle, nearly monochrome,",
      "slight lens distortion and uneven exposure. Preserve the exact requested",
      "action and location. Crop close enough that the subject and joke prop remain",
      "recognizable at icon size. No added people or invented criminal premise.",
    ].join(" "),
  },
  {
    id: "caption",
    label: "Classic image macro",
    weight: 4,
    modes: NOT_CLASSIC,
    sloganPlacement:
      "one bold white block-capital caption with a thick black outline along the top or bottom edge of the picture",
    captionRequired: true,
    render: () => [
      "The dumbest, most reposted kind of group-chat meme: a plain, slightly",
      "low-quality photo with one big caption over it. The photo is simple and",
      "readable in a second: one subject, one reaction, at most one prop. The caption",
      "sits over the picture edge like a classic image macro, never on a sign, shirt",
      "or screen. Compressed phone-photo imperfections, no polished studio look.",
    ].join(" "),
  },
  {
    id: "classic",
    label: "Classic forum drawing",
    weight: 3,
    modes: ["classic"],
    sloganPlacement: null,
    render: () =>
      `Background direction: ${pick(CLASSIC_BACKGROUNDS)} ${CLASSIC_MEME_STYLE}`,
  },
];

function pickStyle(mode: MemeMode): VisualStyle {
  const eligible = VISUAL_STYLES.filter(
    (style) => style.modes === "all" || style.modes.includes(mode),
  );
  const total = eligible.reduce((sum, style) => sum + style.weight, 0);
  let roll = Math.random() * total;
  for (const style of eligible) {
    roll -= style.weight;
    if (roll <= 0) return style;
  }
  return eligible[eligible.length - 1];
}

/**
 * Uppercase, no quotes, at most five words and 30 characters. A slogan that is
 * too long is dropped whole: a cut-off phrase on a shirt is worse than none.
 */
function cleanSlogan(raw: string): string {
  const words = raw
    .replace(/["“”]/g, "")
    .replace(/[‘’]/g, "'")
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const slogan = words.join(" ");
  return words.length <= 5 && slogan.length <= 30 ? slogan : "";
}

function textRule(style: VisualStyle, slogan: string): string {
  const extra = style.extraText ? ` Apart from ${style.extraText},` : "";
  if (slogan && style.sloganPlacement) {
    return [
      `The only intended words are "${slogan}", printed clearly and legibly on`,
      `${style.sloganPlacement}, exactly ONCE in the entire image. Never repeat it on clothing or in the background. Spell it exactly as written.${extra} add no other`,
      "words, letters, logos, brand marks or watermarks.",
    ].join(" ");
  }
  return style.extraText
    ? `${extra.trim()} there are no readable words, letters, logos or watermarks.`
    : "No readable words, letters, logos or watermarks anywhere.";
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

/** "a tiny horse in an oversized raincoat" → "horse": the thing the joke is about. */
export function subjectHeadNoun(subject: string) {
  const core = subject.toLowerCase().split(/\s+(?:in|with|wearing|caught|of|that)\s+/)[0];
  return core.replace(/[^a-z\s-]/g, "").trim().split(/\s+/).at(-1) ?? core;
}

/** Subjects whose main noun did not star in the most recent coins. */
export function freshSubjects(
  subjects: readonly string[],
  history: readonly MemeHistoryEntry[],
  rest = SUBJECT_REST,
) {
  const recent = history
    .slice(0, rest)
    .map((entry) => `${entry.name} ${entry.description ?? ""}`.toLowerCase())
    .join(" ");
  const fresh = subjects.filter(
    (subject) => !new RegExp(`\\b${subjectHeadNoun(subject)}s?\\b`).test(recent),
  );
  return fresh.length >= CANDIDATE_COUNT ? fresh : [...subjects];
}

/** The judge's pick, unless its name or ticker was already launched. */
export function chooseFreshCandidate<T extends { name: string; ticker: string }>(
  candidates: readonly T[],
  winner: number,
  history: readonly MemeHistoryEntry[],
): T | undefined {
  const names = new Set(history.map((entry) => entry.name.trim().toLowerCase()));
  const tickers = new Set(history.map((entry) => entry.ticker.trim().toUpperCase()));
  const isFresh = (candidate: T) =>
    !names.has(candidate.name.trim().toLowerCase()) &&
    !tickers.has(candidate.ticker.trim().toUpperCase());
  const judged = candidates[winner];
  return judged && isFresh(judged) ? judged : candidates.find(isFresh);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickSeveral<T>(items: readonly T[], count: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

async function reviewArtwork(
  client: OpenAI,
  model: string,
  meme: GeneratedMeme,
  encoded: string,
) {
  const review = await client.responses.parse({
    model,
    store: false,
    instructions: [
      "You are a practical meme art director checking only blocking semantic",
      "problems and concrete art-direction violations, not subjective beauty. Set",
      "identityAnchorVisible true when the named character/object is clearly present",
      "and important in the scene. When the name itself names an object or food",
      "(a fry, a receipt, a nugget), that exact object must be clearly visible too;",
      "a prop the joke depends on being absent is a blocking failure. It does not",
      "need to attract more emotional focus",
      "than a supporting character. Set coreJokeReadable true when the broad visual",
      "premise matches the name and lore. A supporting animal or prop is welcome,",
      "but it may never replace the named subject. Treat these as blocking failures:",
      "the identity anchor is absent, the image depicts a different main premise, or",
      "severe visual errors make the coin icon unusable. Fail generic substitutions:",
      "paper is not a printer, fries are not a fast-food worker, and a chart is not a",
      "stock character. Do NOT mark minor deviations as blocking: exact clock times,",
      "counts, room type, background props, color nuances or location details do not",
      "matter when the identity and broad joke work. The requested visual style may be",
      "a rough collage or crude drawing; visible handmade roughness is not a",
      "failure. The intended slogan, if any, is allowed text; a slogan so misspelled",
      "that it reads as gibberish is blocking, a slightly imperfect letter is not.",
      "Duplicating the slogan on multiple surfaces, prominent text when intendedSlogan",
      "is null (except a small CCTV timestamp), photographic human extras, or exposed",
      "human skin/hands grafted onto an animal/object are blocking failures.",
      "Do NOT reject upright animals, costumes, capes, raincoats, paws holding props,",
      "exaggerated expressions, odd scale or obvious Photoshop compositing. A crowned",
      "cat with a mop and a raincoat horse raising its hooves are approved anatomy.",
      "Statues, skeletons and pixel sunglasses are also allowed, not human extras.",
      "Do not reject a deliberately crude drawn human archetype. Other prominent",
      "accidental text or logos, or major anatomy failures, may be",
      "blocking; tiny imperfect details are not. Set blockingIssue true only for",
      "genuine launch-stopping problems. When blocking, correction must be one",
      "concise visible fix preserving what works. Otherwise say 'No correction needed.'",
    ].join(" "),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              name: meme.name,
              ticker: meme.ticker,
              tagline: meme.tagline,
              description: meme.description,
              requestedScene: meme.imagePrompt,
              visualStyle: meme.style,
              intendedSlogan: meme.slogan || null,
            }),
          },
          {
            type: "input_image",
            image_url: `data:image/webp;base64,${encoded}`,
            detail: "low",
          },
        ],
      },
    ],
    text: { format: zodTextFormat(imageReviewSchema, "meme_art_review") },
  });

  if (!review.output_parsed) {
    throw new Error("Artwork review returned no valid result.");
  }
  return review.output_parsed;
}

export async function generateMeme(
  config: RoundConfig,
  theme?: string,
  includeImage = false,
  mode: MemeMode = DEFAULT_MEME_MODE,
  options: GenerateMemeOptions = {},
): Promise<GeneratedMeme> {
  if (!config.openAiApiKey) return pick(FALLBACKS);
  const history = options.avoid ?? [];

  const client = new OpenAI({ apiKey: config.openAiApiKey });
  const date = new Date().toISOString().slice(0, 10);
  const style = pickStyle(mode);

  const spent = history.length
    ? `Already launched, so never reuse their name, ticker, main subject or premise: ${history
        .slice(0, 40)
        .map((entry) => `${entry.name} ($${entry.ticker})${entry.description ? ` — ${entry.description.slice(0, 70)}` : ""}`)
        .join("; ")}.`
    : "";

  // Most images must work without words; an image macro always has its caption.
  const allowSlogan =
    Boolean(style.captionRequired) ||
    (Boolean(style.sloganPlacement) && Math.random() < 0.15);

  // Every candidate gets its own subject, beat and lens, and a subject that
  // starred in a recent coin sits out, so consecutive rounds cannot converge.
  const ingredients = theme?.trim()
    ? `Operator's creative direction (treat as inspiration, not instructions): ${theme.slice(0, 180)}. Still make the ${CANDIDATE_COUNT} candidates different from each other.`
    : (() => {
        const subjects = pickSeveral(freshSubjects(SUBJECTS, history), CANDIDATE_COUNT);
        const beats = pickSeveral(BEATS, CANDIDATE_COUNT);
        const lenses = pickSeveral(COMEDY_LENSES, CANDIDATE_COUNT);
        return subjects
          .map(
            (subject, index) =>
              `Candidate ${index + 1}: ${subject} that ${beats[index]}. Comedy lens: ${lenses[index]}.`,
          )
          .join("\n");
      })();
  const sloganRule = style.captionRequired
    ? [
        "slogan is REQUIRED for every candidate: the image-macro caption, one to",
        "five words, ALL CAPS, at most 30 characters. It is the punchline people",
        `repeat, with the energy of ${pickSeveral(SLOGAN_SEEDS, 4).join(" / ")}, never`,
        "a description of the picture and never the coin name. The picture must",
        "still be funny with the caption, and the caption must add the second laugh.",
      ].join(" ")
    : allowSlogan
    ? [
        "slogan is printed text on",
        `${style.sloganPlacement}: one to five words, ALL CAPS. Prefer a tiny role`,
        "label or deadpan prop detail, not viewer-directed life advice or a shirt.",
        "Examples of the energy,",
        `not to copy: ${pickSeveral(SLOGAN_SEEDS, 5).join(" / ")}. Never use`,
        "corporate or legal jargon such as QUALITY CONTROL, NO COMMENT or COST",
        "CONTROL. A slogan is optional: return an empty string unless the words add",
        "a second joke. The main visual joke must still work with all text covered.",
      ].join(" ")
    : "slogan must be an empty string; this visual style carries no printed words.";

  // Stage 1: several concepts, a judge picks one, and the identity is locked
  // before any visual decisions are made.
  const response = await client.responses.parse({
    model: config.openAiModel,
    store: false,
    instructions: [
      "You are the funniest person in a small, chaotic group chat, creating one",
      "meme coin concept for a Solana mystery launch. Funny comes before",
      "marketable. It should feel like something people screenshot and repost,",
      "never like a startup mascot.",
      MEME_DIRECTION,
      `Creative mode: ${mode}. ${MODE_RULES[mode]}`,
      `The artwork will be rendered as: ${style.label}. Write a joke that works`,
      "in that look.",
      `Today is ${date}. You may use web search to see which joke structures and`,
      "pacing are trending right now. Trends shape only the comedic grammar: never",
      "take the subject, character or premise from them.",
      `Write exactly ${CANDIDATE_COUNT} candidates. Each one stars its own numbered`,
      "subject from the input as the main character and must differ from the others",
      "in subject, setting and joke mechanism. Then act as a ruthless group-chat",
      "judge: set winner to the zero-based index of the candidate most likely to get",
      "an instant laugh and a repost with zero explanation. Prefer the dumbest,",
      "most immediately readable picture over the clever one.",
      "Overused in earlier coins, never use: being awake or not sleeping since",
      "launch, specific clock times, 'nobody asked', empty rooms or empty trading",
      "floors, screaming into a pillow, comeback announcements, security-camera",
      "footage as the joke itself.",
      spent,
      "The joke must land in one second with every word in the image covered.",
      "Use one visible absurd relationship between the subject and a prop or situation.",
      "Do not default to a suit, meeting, whiteboard, slogan shirt or stock chart.",
      "No puns that need decoding, no accounting or legal",
      "wordplay, no in-jokes that only make sense after reading the description.",
      "Let the chosen comedy lens guide the joke: awkward timing, petty triumph,",
      "unnecessary effort or deadpan absurdity, not always financial flexing.",
      "Default to an animal, statue, skeleton or ordinary object, not a human cast.",
      "Costumed upright animals and deliberately pasted-on props are encouraged.",
      "Avoid a plant or appliance head grafted onto a human office worker. Human archetypes",
      "requested by the operator must be clearly drawn, not photorealistic.",
      "Do not force slang. Avoid stale crypto phrases",
      "like moon, diamond hands, HODL, wen, degen, rug, pump, bags and to the moon.",
      "The name is one or two words a twelve-year-old instantly gets, short, dumb,",
      "speakable and inseparable from the visual joke. Avoid generic formula names",
      "such as adjective + animal unless the exact combination is the punchline. The ticker is memorable and",
      "derived naturally from the name or joke, never a random abbreviation.",
      "The tagline is the screenshot-worthy punchline: under 60 characters, no",
      "hashtags, no emoji, no sales pitch and no explanation of why it is funny.",
      "The description is one or two deadpan sentences under 200 characters. Add",
      "one tiny piece of unnecessary lore; do not repeat the tagline.",
      sloganRule,
      "Avoid real people, political symbols, slurs, targeted cruelty and any promise",
      "of profit. References explicitly requested by the operator are allowed only",
      "under the classic, brand or stock parody rules above. Silently reject ideas",
      "that are clever but not funny.",
    ].join(" "),
    input: `${ingredients}\nKeep each candidate's subject as its main character.`,
    tools: [
      {
        type: "web_search",
        external_web_access: true,
        search_context_size: "low",
      },
    ],
    tool_choice: "auto",
    max_tool_calls: 2,
    text: { format: zodTextFormat(conceptBatchSchema, "prepump_meme_candidates") },
  });

  const batch = response.output_parsed;
  if (!batch?.candidates.length) throw new Error("OpenAI returned no valid meme metadata.");
  const parsed = chooseFreshCandidate(batch.candidates, batch.winner, history);
  if (!parsed) throw new Error("Every meme candidate reused an earlier name or ticker.");

  const slogan = allowSlogan ? cleanSlogan(parsed.slogan) : "";
  const concept = { ...parsed, slogan };

  let meme: GeneratedMeme = {
    ...concept,
    style: style.id,
    imagePrompt: concept.description,
  };
  if (!includeImage) return meme;

  // The artwork is a bonus: if it fails, the round still gets a token.
  try {
    // Stage 2: an art director receives the now-final identity as immutable input.
    const briefResponse = await client.responses.parse({
      model: config.openAiModel,
      store: false,
      instructions: [
        MEME_DIRECTION,
        "Turn a finalized meme-coin identity into one concrete image scene. The",
        "identity below is locked: never rename it, reinterpret its central noun or",
        "swap its main character/object for an easier animal. Start imagePrompt with",
        "the exact named subject made physically visible and visually dominant.",
        "Translate the tagline into body language or action and the lore into one",
        "specific prop. The scene must read at tiny coin-icon size, so use one main",
        "subject and at most one supporting character. The visual style is fixed",
        "separately; describe the subject, pose, expression, clothing and props that",
        "suit it, in one or two sentences. Keep the recognizable animal face and",
        "paws/hooves, but allow upright poses, clothes and holding props.",
        "Do not remove the funny costume or action in pursuit of strict realism.",
        "Keep ordinary objects recognizable rather than giving them human bodies.",
        "No background people. Statues and skeletons are fine.",
        "Human archetypes must be crude drawings, never photographic humans.",
        "If a slogan is given, place it ONLY ONCE at sloganPlacement. Otherwise",
        "leave every surface blank. Do not print the name, ticker or tagline.",
        "Make the visual punchline work without any writing. Never make clock",
        "times, precise counts or tiny background details essential to the joke. No",
        "camera or lighting terminology.",
      ].join(" "),
      input: JSON.stringify({
        mode,
        visualStyle: style.label,
        sloganPlacement: slogan ? style.sloganPlacement : null,
        ...concept,
        slogan: slogan || null,
      }),
      text: { format: zodTextFormat(imageBriefSchema, "meme_image_brief") },
    });
    if (!briefResponse.output_parsed) {
      throw new Error("OpenAI returned no valid image brief.");
    }
    meme = {
      ...meme,
      imagePrompt: briefResponse.output_parsed.imagePrompt,
    };

    const renderDirection = style.render();
    const text = textRule(style, slogan);
    const generateArtwork = async (correction?: string) => {
      const image = await client.images.generate({
        model: config.openAiImageModel,
        prompt: [
          meme.imagePrompt,
          correction
            ? `Mandatory correction after visual review: ${correction}`
            : "",
          renderDirection,
          MEME_DIRECTION,
          text,
          "No photographic humans, including background extras. Any requested human",
          "archetype must be visibly mouse-drawn. Animal costumes and upright poses",
          "are allowed; no exposed human skin or realistic human hands grafted onto them.",
          "No corporate-stock-photo lighting, perfect smiles, glossy 3D mascots,",
          "slogan-shirt template or duplicate captions. No celebrities.",
        ]
          .filter(Boolean)
          .join(" "),
        size: config.openAiImageSize as "1024x1024",
        quality: config.openAiImageQuality as "medium",
        output_format: "webp",
        output_compression: 85,
        background: "opaque",
        n: 1,
      });
      const data = image.data?.[0]?.b64_json;
      if (!data) throw new Error("The image model returned no data.");
      return data;
    };

    const isSafetyRejection = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return /safety system|safety|content policy|moderation|request was rejected/i.test(
        message,
      );
    };

    let safetyRetryUsed = false;
    const generateWithSafetyRecovery = async (correction?: string) => {
      try {
        return await generateArtwork(correction);
      } catch (error) {
        if (safetyRetryUsed || !isSafetyRejection(error)) throw error;
        safetyRetryUsed = true;

        // Image moderation occasionally rejects an innocent but ambiguous
        // phrase. Rewrite only the visual scene, keeping the already-finalized
        // coin identity intact, then retry once without the rejected wording.
        const safeBriefResponse = await client.responses.parse({
          model: config.openAiModel,
          store: false,
          instructions: [
            "Rewrite the supplied meme artwork scene as an unambiguously harmless",
            "image prompt. Preserve the exact named subject, its recognizable visual",
            "identity and the one-second joke, but replace ambiguous wording or props",
            "with a silly low-stakes everyday equivalent. The subject is an entirely",
            "original fictional creation, never a real person, celebrity, political",
            "figure, protected character or official brand mascot. No violence, danger,",
            "weapons, drugs, hate, nudity or sexual content. Use one main subject and at",
            "most one ordinary prop. Do not discuss moderation or explain the rewrite.",
          ].join(" "),
          input: JSON.stringify({
            name: meme.name,
            ticker: meme.ticker,
            tagline: meme.tagline,
            description: meme.description,
            rejectedScene: meme.imagePrompt,
            intendedSlogan: meme.slogan || null,
          }),
          text: { format: zodTextFormat(imageBriefSchema, "safe_meme_image_brief") },
        });
        if (!safeBriefResponse.output_parsed) {
          throw new Error("OpenAI returned no safety-rewritten image brief.");
        }
        meme = {
          ...meme,
          imagePrompt: safeBriefResponse.output_parsed.imagePrompt,
        };
        return generateArtwork();
      }
    };

    let encoded = await generateWithSafetyRecovery();
    let review = await reviewArtwork(client, config.openAiModel, meme, encoded);
    const needsRetry = () =>
      !review.identityAnchorVisible ||
      !review.coreJokeReadable ||
      review.blockingIssue;
    if (needsRetry()) {
      encoded = await generateWithSafetyRecovery(review.correction);
      review = await reviewArtwork(client, config.openAiModel, meme, encoded);
    }
    if (needsRetry()) {
      throw new Error(`Artwork rejected after retry: ${review.reason}`);
    }

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
