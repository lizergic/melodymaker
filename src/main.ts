import { generate, REGISTER, type GenInput, type Melody } from "./engine";
import { SCALES, isValidChord } from "./theory";
import { play, stop } from "./audio";
import { toMidiBlob, midiFilename } from "./midi";
import { loadHistory, pushHistory } from "./history";

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PRESETS: Record<string, string> = {
  "ii–V–I (major)": "Dm7 G7 Cmaj7 Cmaj7",
  "I–V–vi–IV (pop)": "C G Am F",
  "i–VI–III–VII (minor)": "Am F C G",
  "12-bar blues (quick)": "C7 F7 C7 G7",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const keyEl = $<HTMLSelectElement>("key");
const scaleEl = $<HTMLSelectElement>("scale");
const barsEl = $<HTMLInputElement>("bars");
const tempoEl = $<HTMLInputElement>("tempo");
const chordsEl = $<HTMLInputElement>("chords");
const presetsEl = $<HTMLSelectElement>("presets");
const errEl = $<HTMLSpanElement>("chord-error");
const genBtn = $<HTMLButtonElement>("generate");
const playBtn = $<HTMLButtonElement>("play");
const stopBtn = $<HTMLButtonElement>("stop");
const dlBtn = $<HTMLButtonElement>("download");
const canvas = $<HTMLCanvasElement>("roll");
const historyEl = $<HTMLOListElement>("history");

let current: Melody | null = null;

function fillSelect(el: HTMLSelectElement, items: string[]) {
  el.replaceChildren(
    ...items.map((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      return opt;
    }),
  );
}

fillSelect(keyEl, KEYS);
fillSelect(scaleEl, [...SCALES]);
fillSelect(presetsEl, ["—", ...Object.keys(PRESETS)]);

function parseChords(): string[] {
  return chordsEl.value.trim().split(/\s+/).filter(Boolean);
}

function validate(): boolean {
  const chords = parseChords();
  const bad = chords.filter((c) => !isValidChord(c));
  if (chords.length === 0) {
    errEl.textContent = "Enter at least one chord";
  } else if (bad.length) {
    errEl.textContent = `Invalid: ${bad.join(", ")}`;
  } else {
    errEl.textContent = "";
  }
  const ok = chords.length > 0 && bad.length === 0;
  genBtn.disabled = !ok;
  return ok;
}

function readInput(seed: number): GenInput {
  return {
    key: keyEl.value,
    scale: scaleEl.value,
    chords: parseChords(),
    bars: Math.max(1, Number(barsEl.value)),
    beatsPerBar: 4,
    tempo: Math.max(40, Number(tempoEl.value)),
    seed,
  };
}

function applyInput(input: GenInput) {
  keyEl.value = input.key;
  scaleEl.value = input.scale;
  chordsEl.value = input.chords.join(" ");
  barsEl.value = String(input.bars);
  tempoEl.value = String(input.tempo);
}

function draw(melody: Melody) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const totalBeats = melody.input.bars * melody.input.beatsPerBar;
  const span = REGISTER.hi - REGISTER.lo + 1;
  const cw = canvas.width / totalBeats;
  const rh = canvas.height / span;
  ctx.fillStyle = "#4fa3ff";
  for (const n of melody.notes) {
    const x = n.startBeat * cw;
    const y = (REGISTER.hi - n.midi) * rh;
    ctx.fillRect(x + 1, y + 1, n.durBeats * cw - 2, rh - 2);
  }
}

function setCurrent(melody: Melody) {
  current = melody;
  draw(melody);
  playBtn.disabled = false;
  stopBtn.disabled = false;
  dlBtn.disabled = false;
}

function renderHistory() {
  const list = loadHistory();
  historyEl.replaceChildren(
    ...list.map((h, i) => {
      const li = document.createElement("li");
      li.dataset.i = String(i);
      li.textContent = `${h.key} ${h.scale} · ${h.chords.join(" ")} · seed ${h.seed}`;
      return li;
    }),
  );
}

genBtn.addEventListener("click", () => {
  if (!validate()) return;
  const seed = Math.floor(Math.random() * 2 ** 31);
  const melody = generate(readInput(seed));
  setCurrent(melody);
  pushHistory(melody.input);
  renderHistory();
});

playBtn.addEventListener("click", () => {
  if (current) void play(current);
});
stopBtn.addEventListener("click", () => stop());

dlBtn.addEventListener("click", () => {
  if (!current) return;
  const url = URL.createObjectURL(toMidiBlob(current));
  const a = document.createElement("a");
  a.href = url;
  a.download = midiFilename(current.input);
  a.click();
  URL.revokeObjectURL(url);
});

presetsEl.addEventListener("change", () => {
  const p = PRESETS[presetsEl.value];
  if (p) {
    chordsEl.value = p;
    validate();
  }
  presetsEl.value = "—";
});

chordsEl.addEventListener("input", validate);

historyEl.addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest("li");
  if (!li) return;
  const input = loadHistory()[Number(li.dataset.i)];
  if (!input) return;
  applyInput(input);
  setCurrent(generate(input));
});

validate();
renderHistory();
