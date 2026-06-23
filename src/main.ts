import "@fontsource-variable/space-grotesk/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import { generate, REGISTER, type GenInput, type Melody } from "./engine";
import { SCALES, scalePitchClasses, isValidChord } from "./theory";
import { play, stop, isPlaying, position } from "./audio";
import { toMidiBlob, midiFilename, toChordsMidiBlob, chordsMidiFilename } from "./midi";
import { loadHistory, pushHistory, HISTORY_MAX } from "./history";

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PRESETS: Record<string, string> = {
  "ii–V–I (major)": "Dm7 G7 Cmaj7 Cmaj7",
  "I–V–vi–IV (pop)": "C G Am F",
  "i–VI–III–VII (minor)": "Am F C G",
  "12-bar blues (quick)": "C7 F7 C7 G7",
};
const BEATS_PER_BAR = 4;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const keyEl = $<HTMLSelectElement>("key");
const scaleEl = $<HTMLSelectElement>("scale");
const chordsEl = $<HTMLInputElement>("chords");
const presetEl = $<HTMLSelectElement>("preset");
const barsEl = $<HTMLInputElement>("bars");
const tempoEl = $<HTMLInputElement>("tempo");
const errslot = $<HTMLDivElement>("errslot");
const errtext = $<HTMLSpanElement>("errtext");
const genBtn = $<HTMLButtonElement>("gen");
const playBtn = $<HTMLButtonElement>("play");
const stopBtn = $<HTMLButtonElement>("stop");
const dlMidiBtn = $<HTMLButtonElement>("dlmidi");
const dlChordsBtn = $<HTMLButtonElement>("dlchords");
const seedB = $<HTMLSpanElement>("seedtag").querySelector("b") as HTMLElement;
const roll = $<HTMLDivElement>("roll");
const rollgrid = $<HTMLDivElement>("rollgrid");
const rollbars = $<HTMLDivElement>("rollbars");
const rollempty = $<HTMLDivElement>("rollempty");
const rollmeta = $<HTMLDivElement>("rollmeta");
const playhead = $<HTMLDivElement>("playhead");
const statusEl = $<HTMLDivElement>("rollstatus");
const statusTxt = statusEl.querySelector(".txt") as HTMLElement;
const histwrap = $<HTMLDivElement>("histwrap");
const histcount = $<HTMLSpanElement>("histcount");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let current: Melody | null = null;
let noteEls: { el: HTMLElement; start: number; end: number }[] = [];
let rafId = 0;
let totalDur = 0;

function fillSelect(el: HTMLSelectElement, items: string[]) {
  el.replaceChildren(
    ...items.map((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      return o;
    }),
  );
}
fillSelect(keyEl, KEYS);
fillSelect(scaleEl, [...SCALES]);
fillSelect(presetEl, ["—", ...Object.keys(PRESETS)]);

function parseChords(): string[] {
  return chordsEl.value.trim().split(/\s+/).filter(Boolean);
}

function setStatus(live: boolean, text: string) {
  statusEl.classList.toggle("live", live);
  statusTxt.textContent = text;
}

function validate(): boolean {
  const chords = parseChords();
  const bad = chords.filter((c) => !isValidChord(c));
  let ok = false;
  if (chords.length === 0) {
    errslot.dataset.state = "err";
    errtext.textContent = "enter at least one chord";
  } else if (bad.length) {
    errslot.dataset.state = "err";
    errtext.textContent = `invalid: ${bad.join(", ")}`;
  } else {
    errslot.dataset.state = "ok";
    errtext.textContent = `${chords.length} chord${chords.length > 1 ? "s" : ""} parsed — ready to generate`;
    ok = true;
  }
  genBtn.disabled = !ok;
  return ok;
}

function readInput(seed: number): GenInput {
  return {
    key: keyEl.value,
    scale: scaleEl.value,
    chords: parseChords(),
    bars: Math.min(16, Math.max(1, Number(barsEl.value) || 1)),
    beatsPerBar: BEATS_PER_BAR,
    tempo: Math.min(240, Math.max(40, Number(tempoEl.value) || 100)),
    seed,
  };
}

function applyInput(input: GenInput) {
  keyEl.value = input.key;
  scaleEl.value = input.scale;
  chordsEl.value = input.chords.join(" ");
  barsEl.value = String(input.bars);
  tempoEl.value = String(input.tempo);
  presetEl.value = "—";
  validate();
}

function span(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

function renderRoll(melody: Melody) {
  const { lo, hi } = REGISTER;
  const lanes = hi - lo + 1;
  const totalBeats = melody.input.bars * melody.input.beatsPerBar;
  const scalePcs = scalePitchClasses(melody.input.key, melody.input.scale);
  const rootPc = KEYS.indexOf(melody.input.key);
  const secPerBeat = 60 / melody.input.tempo;

  // pitch lanes, highest pitch at top; tint in-scale rows, brighten the tonic
  const rows: HTMLDivElement[] = [];
  for (let midi = hi; midi >= lo; midi--) {
    const row = document.createElement("div");
    row.className = "roll-row";
    const pc = ((midi % 12) + 12) % 12;
    if (pc === rootPc) row.classList.add("root");
    else if (scalePcs.includes(pc)) row.classList.add("inscale");
    rows.push(row);
  }
  rollgrid.replaceChildren(...rows);

  // bar lines (bright) + beat lines (faint)
  const lines: HTMLDivElement[] = [];
  for (let beat = 1; beat < totalBeats; beat++) {
    const line = document.createElement("div");
    line.className = beat % melody.input.beatsPerBar === 0 ? "bar-line" : "beat-line";
    line.style.left = `${(beat / totalBeats) * 100}%`;
    lines.push(line);
  }
  rollbars.replaceChildren(...lines);

  // notes (glowing bars), inserted before the playhead so it stays on top
  roll.querySelectorAll(".note").forEach((n) => n.remove());
  noteEls = [];
  for (const n of melody.notes) {
    const el = document.createElement("div");
    el.className = "note";
    el.style.left = `${(n.startBeat / totalBeats) * 100}%`;
    el.style.width = `calc(${(n.durBeats / totalBeats) * 100}% - 1px)`;
    el.style.top = `calc(${((hi - n.midi) / lanes) * 100}% + 1px)`;
    el.style.height = `calc(${(1 / lanes) * 100}% - 2px)`;
    roll.insertBefore(el, playhead);
    noteEls.push({
      el,
      start: n.startBeat * secPerBeat,
      end: (n.startBeat + n.durBeats) * secPerBeat,
    });
  }
  totalDur = totalBeats * secPerBeat;
  rollempty.style.display = melody.notes.length ? "none" : "";

  const b = document.createElement("b");
  b.textContent = `${melody.input.key} ${melody.input.scale}`;
  rollmeta.replaceChildren(
    b,
    document.createTextNode(
      ` · ${melody.input.bars} bars · ${melody.input.tempo} bpm · ${melody.input.chords.length} chords`,
    ),
  );
}

function setCurrent(melody: Melody) {
  current = melody;
  renderRoll(melody);
  playBtn.disabled = false;
  stopBtn.disabled = false;
  dlMidiBtn.disabled = false;
  dlChordsBtn.disabled = false;
  seedB.textContent = String(melody.input.seed);
}

function renderHistory() {
  const list = loadHistory();
  histcount.textContent = `/ last ${HISTORY_MAX}`;
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "no melodies yet — generate one and it lands here.";
    histwrap.replaceChildren(empty);
    return;
  }
  const hlist = document.createElement("div");
  hlist.className = "hlist";
  list.forEach((h, i) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "hrow";
    row.dataset.i = String(i);
    const kc = document.createElement("div");
    kc.className = "kc";
    kc.append(span("ks", `${h.key} ${h.scale}`), span("ch", h.chords.join(" ")));
    row.append(
      span("idx", String(i + 1).padStart(2, "0")),
      kc,
      span("seed", `seed ${h.seed}`),
      span("restore", "restore"),
    );
    hlist.append(row);
  });
  histwrap.replaceChildren(hlist);
}

// ---------- playback visuals ----------
function tick() {
  if (!isPlaying()) {
    finishVisuals();
    return;
  }
  if (!reduceMotion) {
    const pos = position();
    playhead.style.left = `${totalDur ? Math.min(100, (pos / totalDur) * 100) : 0}%`;
    for (const ne of noteEls) ne.el.classList.toggle("lit", pos >= ne.start && pos < ne.end);
  }
  rafId = requestAnimationFrame(tick);
}

function startVisuals() {
  setStatus(true, "playing");
  playBtn.classList.add("is-playing");
  if (!reduceMotion) playhead.classList.add("on");
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

function finishVisuals() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  playhead.classList.remove("on");
  for (const ne of noteEls) ne.el.classList.remove("lit");
  playBtn.classList.remove("is-playing");
  setStatus(false, "idle");
}

function startPlayback() {
  if (!current || isPlaying()) return;
  void play(current);
  startVisuals();
}

function stopPlayback() {
  stop();
  finishVisuals();
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Defer revoke: some browsers cancel the download if the URL dies too soon.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------- events ----------
genBtn.addEventListener("click", () => {
  if (!validate()) return;
  stopPlayback(); // a fresh melody clears any in-progress playback
  const seed = Math.floor(Math.random() * 2 ** 31);
  const melody = generate(readInput(seed));
  setCurrent(melody);
  pushHistory(melody.input);
  renderHistory();
});

playBtn.addEventListener("click", startPlayback);
stopBtn.addEventListener("click", stopPlayback);

dlMidiBtn.addEventListener("click", () => {
  if (current) download(toMidiBlob(current), midiFilename(current.input));
});
dlChordsBtn.addEventListener("click", () => {
  if (current) download(toChordsMidiBlob(current), chordsMidiFilename(current.input));
});

presetEl.addEventListener("change", () => {
  const p = PRESETS[presetEl.value];
  if (p) {
    chordsEl.value = p;
    validate();
  }
  presetEl.value = "—";
});
chordsEl.addEventListener("input", validate);

histwrap.addEventListener("click", (e) => {
  const row = (e.target as HTMLElement).closest(".hrow") as HTMLElement | null;
  if (!row) return;
  const input = loadHistory()[Number(row.dataset.i)];
  if (!input) return;
  stopPlayback();
  applyInput(input);
  setCurrent(generate(input));
});

// keyboard: g = generate, space = play/stop (ignored while typing or on a focused control)
window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  const typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
  if (e.key === "g" || e.key === "G") {
    if (typing) return;
    e.preventDefault();
    genBtn.click();
  } else if (e.code === "Space") {
    if (typing || tag === "BUTTON" || tag === "A") return; // let native activation handle it
    e.preventDefault();
    if (isPlaying()) stopPlayback();
    else startPlayback();
  }
});

validate();
renderHistory();
