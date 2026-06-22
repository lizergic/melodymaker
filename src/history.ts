import type { GenInput } from "./engine";

const KEY = "melodymaker.history.v1";
export const HISTORY_MAX = 10;

// Trust boundary: anything in localStorage may be stale-schema, hand-edited, or
// corrupt. Filter to well-formed entries on load so consumers (render + replay
// into generate()) never see a malformed GenInput.
function isGenInput(x: unknown): x is GenInput {
  const o = x as Record<string, unknown>;
  return (
    !!o &&
    typeof o.key === "string" &&
    typeof o.scale === "string" &&
    Array.isArray(o.chords) &&
    o.chords.length > 0 &&
    o.chords.every((c) => typeof c === "string") &&
    Number.isFinite(o.bars) &&
    (o.bars as number) > 0 &&
    Number.isFinite(o.beatsPerBar) &&
    (o.beatsPerBar as number) > 0 &&
    Number.isFinite(o.tempo) &&
    Number.isFinite(o.seed)
  );
}

export function loadHistory(): GenInput[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isGenInput) : [];
  } catch {
    return [];
  }
}

export function pushHistory(input: GenInput): GenInput[] {
  const list = [input, ...loadHistory()].slice(0, HISTORY_MAX);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
