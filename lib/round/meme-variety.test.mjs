import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { subjectHeadNoun, freshSubjects, chooseFreshCandidate } from "./meme.ts";
import { loadMemeHistory } from "./meme-history.ts";

test("the head noun is what the joke is about", () => {
  assert.equal(subjectHeadNoun("a banana"), "banana");
  assert.equal(subjectHeadNoun("a tiny horse in an oversized raincoat"), "horse");
  assert.equal(subjectHeadNoun("an aquarium lobster wearing one cheap accessory"), "lobster");
  assert.equal(subjectHeadNoun("a possum caught in daylight"), "possum");
  assert.equal(subjectHeadNoun("a marble statue of a Greek god"), "statue");
});

test("a subject that starred in a recent coin sits out", () => {
  const subjects = ["a banana", "a frog", "a goat", "a toaster", "a pug", "a croissant"];
  const history = [
    { name: "Banana Crisis", ticker: "CRISIS", description: "A banana handles one missing grape." },
    { name: "Pillow Champ", ticker: "PCHP", description: "A frog screams into a pillow." },
  ];
  const fresh = freshSubjects(subjects, history);
  assert.ok(!fresh.includes("a banana") && !fresh.includes("a frog"));
  assert.deepEqual(fresh, ["a goat", "a toaster", "a pug", "a croissant"]);
});

test("the subject returns once enough newer coins have launched", () => {
  const subjects = ["a banana", "a goat", "a toaster", "a pug", "a croissant"];
  const newer = Array.from({ length: 12 }, (_, i) => ({ name: `Coin ${i}`, ticker: `C${i}`, description: "A cloud." }));
  const history = [...newer, { name: "Banana Crisis", ticker: "CRISIS", description: "A banana." }];
  assert.ok(freshSubjects(subjects, history).includes("a banana"));
});

test("the judge's pick is replaced when its name or ticker was already used", () => {
  const history = [{ name: "Coin Cheeks", ticker: "CHEEK" }];
  const candidates = [
    { name: "Coin Cheeks", ticker: "CHEEKY" },
    { name: "Goat Lawyer", ticker: "CHEEK" },
    { name: "Nugget Guard", ticker: "NUGGET" },
  ];
  assert.equal(chooseFreshCandidate(candidates, 0, history).name, "Nugget Guard");
  assert.equal(chooseFreshCandidate(candidates, 2, history).name, "Nugget Guard");
  assert.equal(chooseFreshCandidate(candidates.slice(0, 2), 0, history), undefined);
});

test("history comes from every season, newest first, without key folders", () => {
  const root = mkdtempSync(path.join(tmpdir(), "prepump-history-"));
  try {
    const write = (dir, file, record) => {
      mkdirSync(path.join(root, dir), { recursive: true });
      writeFileSync(path.join(root, dir, file), JSON.stringify(record));
    };
    write("", "round-001.json", { token: { name: "Old", ticker: "OLD" }, launch: { launchedAt: "2026-09-01T00:00:00Z" } });
    write("dev", "round-002.json", { token: { name: "Banana Crisis", ticker: "CRISIS" }, launch: { launchedAt: "2026-09-13T13:48:00Z" } });
    write("archive/test", "round-004.json", { token: { name: "Coin Cheeks", ticker: "CHEEK" }, launch: { launchedAt: "2026-09-05T00:00:00Z" } });
    write("test-live", "round-001.json", { token: { name: "Coin Cheeks", ticker: "CHEEK" }, launch: { launchedAt: "2026-09-13T10:10:00Z" } });
    write("owners", "round-003.json", { token: { name: "Should Not Load", ticker: "NOPE" } });
    write("dev", "round-003.json", { deposits: [] });
    assert.deepEqual(
      loadMemeHistory(root).map((entry) => entry.ticker),
      ["CRISIS", "CHEEK", "OLD"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
