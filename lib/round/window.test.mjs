import assert from "node:assert/strict";
import { test } from "node:test";
import { depositWindowState } from "./window.ts";

test("opens at start and closes exactly at deadline", () => {
  const window = { opensAt: 1000, closesAt: 2000 };
  assert.equal(depositWindowState(window, 999), "UPCOMING");
  assert.equal(depositWindowState(window, 1000), "OPEN");
  assert.equal(depositWindowState(window, 1999), "OPEN");
  assert.equal(depositWindowState(window, 2000), "CLOSED");
  assert.equal(depositWindowState(window, 99999), "CLOSED");
});

test("missing or invalid windows never accept deposits", () => {
  for (const window of [
    { opensAt: 0, closesAt: 0 },
    { opensAt: 2000, closesAt: 1000 },
    { opensAt: 1000, closesAt: 1000 },
    { opensAt: NaN, closesAt: 2000 },
    { opensAt: 1000, closesAt: Infinity },
  ]) assert.equal(depositWindowState(window, 1500), "UNSCHEDULED");
});

test("reloading after expiry cannot restart the round", () => {
  const window = { opensAt: 1000, closesAt: 2000 };
  for (let now = 2000; now < 10000; now += 1000) {
    assert.equal(depositWindowState({ ...window }, now), "CLOSED");
  }
});
