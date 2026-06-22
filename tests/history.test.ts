// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadHistory, pushHistory, HISTORY_MAX } from "../src/history";
import type { GenInput } from "../src/engine";

const make = (seed: number): GenInput => ({
  key: "C",
  scale: "major",
  chords: ["Cmaj7"],
  bars: 4,
  beatsPerBar: 4,
  tempo: 100,
  seed,
});

describe("history", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("prepends newest first", () => {
    pushHistory(make(1));
    pushHistory(make(2));
    expect(loadHistory().map((i) => i.seed)).toEqual([2, 1]);
  });

  it("caps at HISTORY_MAX, dropping the oldest", () => {
    for (let s = 1; s <= HISTORY_MAX + 2; s++) pushHistory(make(s));
    const seeds = loadHistory().map((i) => i.seed);
    expect(seeds.length).toBe(HISTORY_MAX);
    expect(seeds[0]).toBe(HISTORY_MAX + 2); // newest
    expect(seeds).not.toContain(1); // oldest dropped
  });

  it("returns [] on corrupt storage", () => {
    localStorage.setItem("melodymaker.history.v1", "{not json");
    expect(loadHistory()).toEqual([]);
  });
});
