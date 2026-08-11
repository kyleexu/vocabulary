import type { Accent, PhoneticInfo } from "../types";

const cache = new Map<string, PhoneticInfo>();

type DictPhonetic = {
  text?: string;
  audio?: string;
};

type DictResponse = Array<{
  phonetics?: DictPhonetic[];
  phonetic?: string;
}>;

let activeAudio: HTMLAudioElement | null = null;
let speakToken = 0;

export function stopSpeaking() {
  speakToken += 1;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function pickPhonetics(data: DictResponse): PhoneticInfo {
  const info: PhoneticInfo = {};
  const phonetics = data.flatMap((d) => d.phonetics ?? []);
  for (const p of phonetics) {
    const audio = p.audio ?? "";
    const text = p.text?.trim();
    if (audio.includes("-us") || audio.includes("_us")) {
      if (text) info.us = text;
      if (audio) info.usAudio = audio;
    } else if (audio.includes("-uk") || audio.includes("_uk")) {
      if (text) info.uk = text;
      if (audio) info.ukAudio = audio;
    } else if (audio) {
      if (!info.usAudio) info.usAudio = audio;
      if (text && !info.us) info.us = text;
    } else if (text) {
      if (!info.us) info.us = text;
    }
  }
  if (!info.us && data[0]?.phonetic) info.us = data[0].phonetic;
  if (!info.uk && info.us) info.uk = info.us;
  return info;
}

export async function fetchPhonetics(word: string): Promise<PhoneticInfo> {
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`,
    );
    if (!res.ok) {
      const empty = {};
      cache.set(key, empty);
      return empty;
    }
    const data = (await res.json()) as DictResponse;
    const info = pickPhonetics(data);
    cache.set(key, info);
    return info;
  } catch {
    const empty = {};
    cache.set(key, empty);
    return empty;
  }
}

function playAudio(url: string, token: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (token !== speakToken) {
      resolve(false);
      return;
    }
    const audio = new Audio(url);
    activeAudio = audio;
    const done = (ok: boolean) => {
      if (activeAudio === audio) activeAudio = null;
      resolve(ok);
    };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    void audio.play().catch(() => done(false));
  });
}

export async function speakWord(
  word: string,
  accent: Accent,
  phonetic?: PhoneticInfo,
) {
  const token = ++speakToken;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  const audioUrl =
    accent === "us"
      ? phonetic?.usAudio ?? phonetic?.ukAudio
      : phonetic?.ukAudio ?? phonetic?.usAudio;

  if (audioUrl) {
    const ok = await playAudio(audioUrl, token);
    if (ok || token !== speakToken) return;
  }

  if (token !== speakToken) return;
  await speakWithSynthesis(word, accent, token);
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
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
