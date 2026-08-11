import type { Accent } from "../types";

let speakToken = 0;

export function stopSpeaking() {
  speakToken += 1;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/** Speak with the browser's local speechSynthesis (no network). */
export function speakWord(word: string, accent: Accent): Promise<void> {
  const token = ++speakToken;
  return speakWithSynthesis(word, accent, token);
}

export function speakWithSynthesis(
  text: string,
  accent: Accent,
  token = ++speakToken,
): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || token !== speakToken) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = accent === "uk" ? "en-GB" : "en-US";
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) =>
      accent === "uk"
        ? /en-GB|British/i.test(`${v.lang} ${v.name}`)
        : /en-US|American/i.test(`${v.lang} ${v.name}`),
    );
    if (preferred) utter.voice = preferred;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
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
