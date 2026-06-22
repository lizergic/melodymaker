import type { GenInput } from "./engine";

const KEY = "melodymaker.history.v1";
export const HISTORY_MAX = 10;

export function loadHistory(): GenInput[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushHistory(input: GenInput): GenInput[] {
  const list = [input, ...loadHistory()].slice(0, HISTORY_MAX);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
