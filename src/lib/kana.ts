import type { Word } from "../types";
import { shuffle } from "./speech";

const KANA_RE = /[\u3040-\u30FF]/;

export const KANA_CHOICE_COUNT = 6;

export function isKanaWord(word: Word): boolean {
  return KANA_RE.test(word.chinese) || KANA_RE.test(word.english);
}

export function isKanaVocab(words: Word[]): boolean {
  if (!words.length) return false;
  const sample = words.slice(0, 12);
  return sample.every(isKanaWord);
}

export function kanaParts(chinese: string): { hira: string; kata: string } {
  const hira = chinese.match(/[\u3040-\u309F]+/)?.[0] ?? "";
  const kata = chinese.match(/[\u30A0-\u30FF]+/)?.[0] ?? "";
  return { hira, kata };
}

/** 6 options: prefer same 行 as distractors, then the rest of the pool. */
export function pickKanaChoices(
  correct: Word,
  pool: Word[],
  count = KANA_CHOICE_COUNT,
): Word[] {
  const seen = new Set<string>([correct.chinese]);
  const rest = pool.filter((w) => w.id !== correct.id);
  const sameRow = shuffle(
    rest.filter((w) => w.pos && w.pos === correct.pos && !seen.has(w.chinese)),
  );
  const others = shuffle(
    rest.filter((w) => w.pos !== correct.pos && !seen.has(w.chinese)),
  );

  const picks: Word[] = [correct];
  for (const w of [...sameRow, ...others]) {
    if (picks.length >= count) break;
    if (seen.has(w.chinese)) continue;
    seen.add(w.chinese);
    picks.push(w);
  }
  return shuffle(picks);
}
