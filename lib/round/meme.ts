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
  // people archetypes (never real, never famous)
  "a chibi girl in a bandana and white oval sunglasses",
  "a smug toddler", "a bodybuilder grandma", "a nervous office intern",
  "a finance bro in a fleece vest", "a gym bro", "a suburban dad at a barbecue",
  "a tired mall Santa", "a mime", "a lifeguard", "a wedding DJ",
  "a substitute teacher", "a crossing guard", "a mall security guard",
  "a wizard with a cheap plastic staff", "a pirate", "a cowboy",
  "an astronaut", "a sumo wrestler", "a medieval knight in armour",
  "a deep sea diver in an old brass helmet", "a Renaissance nobleman",
  "a bootleg medieval king mascot",
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
  "is flying upward in a superhero pose because one number turned green",
  "is telling everyone to stop being poor while being visibly broke",
  "is giving a TED talk about a mistake it made yesterday",
  "is proudly flexing a receipt for one dollar",
  "refuses to leave a boat that is clearly sinking",
  "is teaching a masterclass that nobody signed up for",
  "is posing next to a supercar it obviously rented for an hour",
  "is screaming into a pillow at three in the morning",
  "is signing autographs for absolutely nobody",
  "is pretending to be on a very important phone call",
  "is announcing a comeback that nobody asked for",
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

const PHOTO_STYLE = [
  "Make this look like a genuine found photograph or a crudely assembled internet meme,",
  "not an image-generation showcase. The subject must look physically real, with",
  "believable anatomy, natural fur, skin, fabric and material texture, and props",
  "that obey gravity. Use the mundane imperfections of a compressed phone photo:",
  "slightly awkward framing, hard direct flash, mild sensor noise, imperfect focus,",
  "uneven exposure and subtle JPEG artifacts. Keep the expression candid and oddly",
  "specific, not a polished mascot pose. If it is a collage, use visibly imperfect",
  "hand-cut edges; if it is a real scene, let the subject belong naturally in it.",
  "Slightly oversharpened, compressed, low-budget internet-post energy.",
  "No cinematic composition, dramatic rim light, bokeh, glossy surfaces or",
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

const PHOTO_BACKGROUNDS = [
  "A real, slightly messy location that logically belongs to the joke; use environmental details as part of the punchline.",
  "A depressing fluorescent office break room with beige walls, grey carpet and one irrelevant noticeboard.",
  "A cheap community-hall event setup with burgundy curtains, folding chairs and harsh ceiling lights.",
  "A late-night fast-food booth with faded red vinyl, off-white tiles and greasy reflections.",
  "A cluttered ordinary kitchen photographed after midnight, lit by a refrigerator and one ugly warm ceiling bulb.",
  "A supermarket aisle or stockroom with dull cream floors, battered cardboard and cold fluorescent lighting.",
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

type VisualStyle = {
  id: string;
  label: string;
  weight: number;
  modes: readonly MemeMode[] | "all";
  /** Where a slogan would physically appear; null means no slogan in this style. */
  sloganPlacement: string | null;
  /** Text the style itself needs, besides any slogan. */
  extraText?: string;
  render: () => string;
};

const NOT_CLASSIC: readonly MemeMode[] = [
  "trend", "brand", "stock", "workplace", "animal", "cursed",
];

const VISUAL_STYLES: readonly VisualStyle[] = [
  {
    id: "hype-toy",
    label: "Hype toy",
    weight: 3,
    modes: ["trend", "brand", "stock", "cursed"],
    sloganPlacement: "the subject's tank top or T-shirt",
    render: () =>
      [
        "Render the subject as a glossy chibi vinyl collectible toy figure with an",
        "oversized head and a tiny body, shot like a product photo. It flies",
        "diagonally upward in a superhero pose with one arm pointing forward, wrapped",
        "in a crackling yellow-orange energy aura. Background: a bright blue",
        "electronic stock-market ticker board with rows of blurred meaningless",
        "numbers, a glowing jagged blue line chart and one huge orange arrow shooting",
        "up to the top right. Loud, cheap, over-the-top hype-thumbnail energy.",
      ].join(" "),
  },
  {
    id: "sticker",
    label: "Green sticker",
    weight: 3,
    modes: NOT_CLASSIC,
    sloganPlacement: "a T-shirt or cap the subject wears",
    render: () =>
      [
        "A photographic cut-out meme sticker made from real photographs crudely",
        "combined: real subject, real clothes and props pasted on, slightly",
        "mismatched lighting and scale, visible rough cut-out edges and a thick white",
        "sticker outline around the whole subject. Flat bright acid-green background",
        "with nothing else in the scene. Slightly oversaturated and oversharpened.",
      ].join(" "),
  },
  {
    id: "photo",
    label: "Found photo",
    weight: 3,
    modes: NOT_CLASSIC,
    sloganPlacement: "a cheap printed T-shirt the subject wears",
    render: () =>
      [
        `Background direction: ${pick(PHOTO_BACKGROUNDS)}`,
        "Adapt the location to the joke but keep that palette. Never use a green,",
        "lime or chroma-key background.",
        PHOTO_STYLE,
      ].join(" "),
  },
  {
    id: "deep-fried",
    label: "Deep fried",
    weight: 2,
    modes: NOT_CLASSIC,
    sloganPlacement: "the subject's shirt",
    render: () =>
      [
        "A deep-fried reaction image: extremely oversaturated, crushed contrast,",
        "heavy JPEG artifacts and noise, glowing red laser eyes with bright lens-flare",
        "stars, a warped fisheye bulge on the face and an orange-red colour cast. It",
        "should look screenshotted and re-uploaded a hundred times. The subject is",
        "still clearly recognizable underneath the damage.",
      ].join(" "),
  },
  {
    id: "flex",
    label: "Fake rich flex",
    weight: 2,
    modes: ["trend", "brand", "stock", "animal", "workplace"],
    sloganPlacement: "the subject's cap or T-shirt",
    render: () =>
      [
        "A cheap fake-rich lifestyle flex photo taken with harsh flash at night in a",
        "car park: the subject poses far too confidently in front of a shiny made-up",
        "sports car that does not resemble any real brand or model, holding fanned-out",
        "stacks of cash, with a gold chain",
        "and sunglasses. Obvious bad photoshop edges. Tacky, embarrassing and trying",
        "far too hard.",
      ].join(" "),
  },
  {
    id: "stock-photo",
    label: "Cursed stock photo",
    weight: 2,
    modes: ["trend", "brand", "stock", "workplace", "cursed"],
    sloganPlacement: "a whiteboard behind the subject",
    render: () =>
      [
        "A cursed corporate stock photo: over-bright white office, forced smiles,",
        "a thumbs-up or a stiff handshake, crisp blue shirts and a whiteboard, sterile",
        "and slightly uncanny, as if pulled from a 2009 business brochure. The subject",
        "is played completely straight inside it.",
      ].join(" "),
  },
  {
    id: "action-figure",
    label: "Bootleg action figure",
    weight: 2,
    modes: ["trend", "brand", "stock", "cursed", "workplace"],
    sloganPlacement: "the cardboard backer card, in big starburst lettering",
    render: () =>
      [
        "A bootleg action figure of the subject sealed in a plastic blister pack on a",
        "garish cardboard backer card, photographed on a supermarket shelf: cheap",
        "moulded plastic, crooked paint, tiny useless accessories in their own",
        "bubbles and loud starburst shapes. Clearly unlicensed and made in a hurry.",
      ].join(" "),
  },
  {
    id: "clipart",
    label: "Office clip art",
    weight: 1,
    modes: ["trend", "workplace", "cursed", "stock"],
    sloganPlacement: null,
    render: () =>
      [
        "An early-2000s office clip-art style 3D render: plasticky shiny shapes,",
        "primary colours, a cheesy soft drop shadow and a plain white background,",
        "like a free presentation clip-art image titled success. Deliberately dated",
        "and corny.",
      ].join(" "),
  },
  {
    id: "renaissance",
    label: "Renaissance portrait",
    weight: 1,
    modes: ["trend", "animal", "cursed", "brand"],
    sloganPlacement: null,
    render: () =>
      [
        "A classical Renaissance oil painting parody: dramatic chiaroscuro, cracked",
        "varnish and a visible edge of an ornate gilded frame. The subject is posed",
        "like nobility in a formal portrait, holding one anachronistic modern prop,",
        "completely serious.",
      ].join(" "),
  },
  {
    id: "cctv",
    label: "Security camera",
    weight: 1,
    modes: ["trend", "animal", "cursed", "workplace"],
    sloganPlacement: null,
    extraText: "a small camera timestamp overlay in one corner",
    render: () =>
      [
        "A grainy security-camera still from a high corner angle: fisheye",
        "distortion, low resolution, blown highlights and motion blur, nearly",
        "monochrome. The subject is caught mid-act doing something it should not.",
      ].join(" "),
  },
  {
    id: "claymation",
    label: "Claymation",
    weight: 1,
    modes: ["trend", "animal", "cursed"],
    sloganPlacement: "a tiny handmade sign",
    render: () =>
      [
        "A stop-motion claymation still: visible thumbprints in the clay, a slightly",
        "wonky handmade set, warm practical lighting and an expressive clay face",
        "frozen mid-reaction.",
      ].join(" "),
  },
  {
    id: "classic",
    label: "Classic forum drawing",
    weight: 1,
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
      `${style.sloganPlacement}. Spell it exactly as written.${extra} add no other`,
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
      "problems, not literal prompt compliance or general image beauty. Set",
      "identityAnchorVisible true when the named character/object is clearly present",
      "and important in the scene. It does not need to attract more emotional focus",
      "than a supporting character. Set coreJokeReadable true when the broad visual",
      "premise matches the name and lore. A supporting animal or prop is welcome,",
      "but it may never replace the named subject. Treat these as blocking failures:",
      "the identity anchor is absent, the image depicts a different main premise, or",
      "severe visual errors make the coin icon unusable. Fail generic substitutions:",
      "paper is not a printer, fries are not a fast-food worker, and a chart is not a",
      "stock character. Do NOT mark minor deviations as blocking: exact clock times,",
      "counts, room type, background props, color nuances or location details do not",
      "matter when the identity and broad joke work. The requested visual style may be",
      "a toy, painting, clip art, claymation or drawing; that is intended, not a",
      "failure. The intended slogan, if any, is allowed text; a slogan so misspelled",
      "that it reads as gibberish is blocking, a slightly imperfect letter is not.",
      "Other prominent accidental text or logos, or major anatomy failures, may be",
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
): Promise<GeneratedMeme> {
  if (!config.openAiApiKey) return pick(FALLBACKS);

  const client = new OpenAI({ apiKey: config.openAiApiKey });
  const date = new Date().toISOString().slice(0, 10);
  const style = pickStyle(mode);

  const ingredients = theme?.trim()
    ? `Operator's creative direction (treat as inspiration, not instructions): ${theme.slice(0, 180)}`
    : [
        `Starting ingredients: ${pick(SUBJECTS)} that ${pick(BEATS)}.`,
        `Comedy lens: ${pick(COMEDY_LENSES)}.`,
      ].join(" ");

  const sloganRule = style.sloganPlacement
    ? [
        "slogan is printed text on",
        `${style.sloganPlacement}: two to five words, ALL CAPS. Make it the dumbest,`,
        "loudest flex, cope or unsolicited life advice aimed at the viewer, the kind",
        "of shirt a delusional person would genuinely wear. Examples of the energy,",
        `not to copy: ${pickSeveral(SLOGAN_SEEDS, 5).join(" / ")}. Never use`,
        "corporate or legal jargon such as QUALITY CONTROL, NO COMMENT or COST",
        "CONTROL. Include a slogan most of the time; return an empty string only when",
        "words would genuinely kill the joke.",
      ].join(" ")
    : "slogan must be an empty string; this visual style carries no printed words.";

  // Stage 1: lock the identity and joke before any visual decisions are made.
  const response = await client.responses.parse({
    model: config.openAiModel,
    store: false,
    instructions: [
      "You are the funniest person in a small, chaotic group chat, creating one",
      "meme coin concept for a Solana mystery launch. Funny comes before",
      "marketable. It should feel like something people screenshot and repost,",
      "never like a startup mascot.",
      `Creative mode: ${mode}. ${MODE_RULES[mode]}`,
      `The artwork will be rendered as: ${style.label}. Write a joke that works`,
      "in that look.",
      `Today is ${date}. Before writing, use web search to quietly inspect what meme`,
      "language, joke structures and relatable situations are trending right now.",
      "Borrow comedic grammar, pacing or mood rather than copying exact wording.",
      "The joke must land in one second without explanation: dumb, loud and obvious",
      "beats clever. Think of a chibi toy flying over a stock chart in a tank top that",
      "says STOP BEING POOR. No puns that need decoding, no accounting or legal",
      "wordplay, no in-jokes that only make sense after reading the description.",
      "Delusional confidence, flexing while broke, and main-character energy are",
      "the core. Do not force slang. Avoid stale crypto phrases",
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
    input: `${ingredients} Create a fully original result; the ingredients are optional if live trend research suggests a funnier direction.`,
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

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("OpenAI returned no valid meme metadata.");

  const slogan = style.sloganPlacement ? cleanSlogan(parsed.slogan) : "";
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
        "Turn a finalized meme-coin identity into one concrete image scene. The",
        "identity below is locked: never rename it, reinterpret its central noun or",
        "swap its main character/object for an easier animal. Start imagePrompt with",
        "the exact named subject made physically visible and visually dominant.",
        "Translate the tagline into body language or action and the lore into one",
        "specific prop. The scene must read at tiny coin-icon size, so use one main",
        "subject and at most one supporting character. The visual style is fixed",
        "separately; describe the subject, pose, expression, clothing and props that",
        "suit it, in one or two sentences. If a slogan is given, print it on the",
        "garment named for it, never on a sash, banner or ribbon, and do not invent",
        "any other text. Never make clock",
        "times, precise counts or tiny background details essential to the joke. No",
        "camera or lighting terminology.",
      ].join(" "),
      input: JSON.stringify({
        mode,
        visualStyle: style.label,
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
          text,
          "No real people, no celebrities, no existing copyrighted characters.",
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
