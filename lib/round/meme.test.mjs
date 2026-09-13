import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { Responses } from "openai/resources/responses/responses";
import { Images } from "openai/resources/images";
import sharp from "sharp";
import { generateMeme } from "./meme.ts";

const config = {
  openAiApiKey: "test-not-a-real-key",
  openAiModel: "test-text",
  openAiImageModel: "test-image",
  openAiImageSize: "1024x1024",
  openAiImageQuality: "medium",
  tokenImageSize: 32,
};
const concept = {
  name: "Sun Queue", ticker: "QUEUE", tagline: "Still waiting.",
  description: "A wilted plant waits behind a barrier just outside a patch of sunlight.",
  slogan: "MY TURN",
};
const passed = {
  identityAnchorVisible: true, coreJokeReadable: true,
  blockingIssue: false, reason: "The visual joke is readable.",
  correction: "No correction needed.",
};
const pixel = (await sharp({
  create: { width: 2, height: 2, channels: 3, background: "white" },
}).webp().toBuffer()).toString("base64");

const fresh = {
  name: "Nugget Guard", ticker: "NUGGET", tagline: "Nobody touches the nugget.",
  description: "A pug in a tiny security vest protects one chicken nugget on a paper plate.",
  slogan: "BACK OFF",
};

function setup(rolls, reviews = [passed], candidates = [concept], winner = 0) {
  const prompts = [];
  const textCalls = [];
  mock.method(Math, "random", () => rolls.shift() ?? 0.5);
  mock.method(Responses.prototype, "parse", async (request) => {
    textCalls.push(request);
    const format = request.text.format.name;
    if (format === "prepump_meme_candidates") return {
      output_parsed: { candidates: candidates.map((c) => ({ ...c })), winner, reason: "Funniest at a glance." },
    };
    if (format === "meme_image_brief") return {
      output_parsed: { imagePrompt: "Sun Queue: a potted wilted plant behind a tiny rope barrier beside a patch of sunlight." },
    };
    assert.equal(format, "meme_art_review");
    return { output_parsed: reviews.shift() };
  });
  mock.method(Images.prototype, "generate", async (request) => {
    prompts.push(request.prompt);
    return { data: [{ b64_json: pixel }] };
  });
  return { prompts, textCalls };
}

test("default photo drops unsolicited slogans and forbids photographic extras", async () => {
  try {
    const { prompts, textCalls } = setup([0]);
    const result = await generateMeme(config, "plant waiting for sunlight", true);
    assert.equal(result.imageError, undefined);
    assert.equal(result.style, "photo");
    assert.equal(result.slogan, "");
    assert.match(result.imageDataUrl, /^data:image\/webp;base64,/);
    assert.match(prompts[0], /No readable words/);
    assert.match(prompts[0], /No photographic humans/);
    assert.doesNotMatch(prompts[0], /MY TURN|acid-green|forced smiles/);
    assert.equal(JSON.parse(textCalls[1].input).sloganPlacement, null);
  } finally { mock.restoreAll(); }
});

test("rare slogan uses one consistent physical placement, never shirt plus whiteboard", async () => {
  try {
    // Non-classic styles have weight 19: .6 selects disposable, .1 allows text.
    const { prompts, textCalls } = setup([0.6, 0.1]);
    const result = await generateMeme(config, "plant waiting for sunlight", true);
    assert.equal(result.imageError, undefined);
    assert.equal(result.style, "disposable");
    assert.equal(result.slogan, "MY TURN");
    assert.match(prompts[0], /exactly ONCE/);
    assert.match(prompts[0], /one small physical label on the main prop/);
    assert.equal(JSON.parse(textCalls[1].input).sloganPlacement, "one small physical label on the main prop");
  } finally { mock.restoreAll(); }
});

test("review correction retries once without changing the coin identity", async () => {
  try {
    const { prompts, textCalls } = setup([0], [
      { ...passed, blockingIssue: true, reason: "Unrequested human extras.", correction: "Remove the two photographic people." },
      passed,
    ]);
    const result = await generateMeme(config, "plant waiting for sunlight", true);
    assert.equal(result.imageError, undefined);
    assert.equal(result.name, concept.name);
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /Mandatory correction.*Remove the two photographic people/);
    assert.match(textCalls[2].instructions, /Duplicating the slogan/);
    assert.match(textCalls[2].instructions, /photographic human extras/);
  } finally { mock.restoreAll(); }
});

test("approved costumed-animal direction reaches concept, brief, image and review", async () => {
  try {
    const { prompts, textCalls } = setup([0]);
    await generateMeme(config, "an animal with an absurd job", true);
    for (const instructions of [textCalls[0].instructions, textCalls[1].instructions, prompts[0]]) {
      assert.match(instructions, /handling props with paws\/hooves/);
      assert.match(instructions, /NOT scenes to copy/);
    }
    assert.match(textCalls[1].instructions, /Do not remove the funny costume/);
    assert.match(textCalls[2].instructions, /Do NOT reject upright animals/);
    assert.match(textCalls[2].instructions, /Statues, skeletons and pixel sunglasses/);
  } finally { mock.restoreAll(); }
});

test("website cutout styling allows a white outline without forcing green", async () => {
  try {
    const { prompts } = setup([0.4, 0]);
    const result = await generateMeme(config, "an animal with an absurd job", true);
    assert.equal(result.style, "sticker");
    assert.match(prompts[0], /white cut-out outline/);
    assert.match(prompts[0], /Simple background in off-white/);
    assert.doesNotMatch(prompts[0], /acid-green/);
  } finally { mock.restoreAll(); }
});

test("image macro always carries its caption, exactly once, over the picture edge", async () => {
  try {
    // .9 of weight 19 lands on the caption style.
    const { prompts, textCalls } = setup([0.9]);
    const result = await generateMeme(config, "plant waiting for sunlight", true);
    assert.equal(result.imageError, undefined);
    assert.equal(result.style, "caption");
    assert.equal(result.slogan, "MY TURN");
    assert.match(textCalls[0].instructions, /slogan is REQUIRED/);
    assert.match(prompts[0], /bold white block-capital caption/);
    assert.match(prompts[0], /exactly ONCE/);
  } finally { mock.restoreAll(); }
});

test("earlier coins are listed as spent and a reused pick is swapped for a fresh candidate", async () => {
  try {
    const { textCalls } = setup([0], [passed], [concept, fresh], 0);
    const result = await generateMeme(config, undefined, false, "trend", {
      avoid: [{ name: "Sun Queue", ticker: "QUEUE", description: "A plant waits for sun." }],
    });
    assert.equal(result.name, "Nugget Guard");
    assert.match(textCalls[0].instructions, /Already launched.*Sun Queue \(\$QUEUE\)/);
    assert.match(textCalls[0].input, /Candidate 1: .*Candidate 4: /s);
  } finally { mock.restoreAll(); }
});
