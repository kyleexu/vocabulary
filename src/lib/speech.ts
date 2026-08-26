import type { Accent } from "../types";

let speakToken = 0;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;
let currentAudio: HTMLAudioElement | null = null;

/** Youdao dict voice: type 0 = US, type 1 = UK. Undocumented public mp3. */
export function youdaoDictVoiceUrl(word: string, accent: Accent): string {
  const audio = encodeURIComponent(word.trim());
  const type = accent === "uk" ? 1 : 0;
  return `https://dict.youdao.com/dictvoice?type=${type}&audio=${audio}`;
}

function clampPlaybackRate(ratePercent: number): number {
  const pct = Number.isFinite(ratePercent) ? ratePercent : 100;
  return Math.min(1.25, Math.max(0.5, pct / 100));
}

function stopCurrentAudio() {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio.removeAttribute("src");
  currentAudio.load();
  currentAudio = null;
}

export function stopSpeaking() {
  speakToken += 1;
  stopCurrentAudio();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length) return Promise.resolve(existing);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    // Fallback if voiceschanged never fires
    window.setTimeout(done, 500);
  });
  return voicesReady;
}

/** Hyphenated compounds → each part, so Youdao can pronounce them separately. */
export function speakSegments(word: string): string[] {
  const parts = word
    .trim()
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [];
}

/** Speak via Youdao dictionary audio; fall back to local speechSynthesis. */
export function speakWord(
  word: string,
  accent: Accent,
  ratePercent = 100,
): Promise<void> {
  const token = ++speakToken;
  return speakWithYoudao(word, accent, token, ratePercent);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function playYoudaoClip(
  text: string,
  accent: Accent,
  token: number,
  ratePercent: number,
): Promise<void> {
  if (token !== speakToken) return;
  stopCurrentAudio();
  const audio = new Audio(youdaoDictVoiceUrl(text, accent));
  currentAudio = audio;
  audio.playbackRate = clampPlaybackRate(ratePercent);
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("youdao audio error"));
    void audio.play().catch(reject);
  });
}

async function speakWithYoudao(
  word: string,
  accent: Accent,
  token: number,
  ratePercent: number,
): Promise<void> {
  const segments = speakSegments(word);
  if (!segments.length || token !== speakToken) return;

  stopCurrentAudio();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  for (let i = 0; i < segments.length; i++) {
    if (token !== speakToken) return;
    const part = segments[i];
    try {
      await playYoudaoClip(part, accent, token, ratePercent);
    } catch {
      if (token !== speakToken) return;
      stopCurrentAudio();
      await speakWithSynthesis(part, accent, token, ratePercent);
    }
    if (i < segments.length - 1 && token === speakToken) {
      await wait(80);
    }
  }
}

export async function speakWithSynthesis(
  text: string,
  accent: Accent,
  token = ++speakToken,
  ratePercent = 100,
): Promise<void> {
  if (!("speechSynthesis" in window) || token !== speakToken) return;

  // Stop anything currently playing.
  window.speechSynthesis.cancel();
  // Chrome often no-ops speak() if called immediately after cancel().
  await new Promise((r) => setTimeout(r, 60));
  if (token !== speakToken) return;

  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  const voices = await loadVoices();
  if (token !== speakToken) return;

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = accent === "uk" ? "en-GB" : "en-US";
  utter.rate = clampPlaybackRate(ratePercent);
  const preferred = voices.find((v) =>
    accent === "uk"
      ? /en-GB|British/i.test(`${v.lang} ${v.name}`)
      : /en-US|American/i.test(`${v.lang} ${v.name}`),
  );
  if (preferred) utter.voice = preferred;

  await new Promise<void>((resolve) => {
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      resolve();
    }
  });
}

export function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[’‘']/g, "'")
    .replace(/\s+/g, " ");
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[j], a[i]] = [a[i], a[j]];
  }
  return a;
}
