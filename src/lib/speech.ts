import type { Accent } from "../types";

let speakToken = 0;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

export function stopSpeaking() {
  speakToken += 1;
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

/** Speak with the browser's local speechSynthesis (no network). */
export function speakWord(word: string, accent: Accent): Promise<void> {
  const token = ++speakToken;
  return speakWithSynthesis(word, accent, token);
}

export async function speakWithSynthesis(
  text: string,
  accent: Accent,
  token = ++speakToken,
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
