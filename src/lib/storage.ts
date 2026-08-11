import type { Flag01, Word } from "../types";

const SETTINGS_KEY = "vocab.settings";
const VOCAB_URL = "/api/vocabulary.json";

export type Settings = {
  accent: "us" | "uk";
  autoSpeak: boolean;
  order: "random" | "sequential";
};

const defaultSettings: Settings = {
  accent: "us",
  autoSpeak: true,
  order: "random",
};

/** In-memory copy of data/vocabulary.json (source of truth on disk). */
let vocabulary: Word[] = [];

function asFlag(value: unknown): Flag01 {
  return value === 1 || value === "1" || value === true ? 1 : 0;
}

export function normalizeWord(raw: Partial<Word> & {
  english: string;
  chinese: string;
  category: string;
  // legacy lowercase keys
  iswrong?: unknown;
  isfavorites?: unknown;
  iseasy?: unknown;
}): Word {
  return {
    id: Number(raw.id) || 0,
    categoryId: Number(raw.categoryId) || 0,
    category: raw.category ?? "",
    english: raw.english,
    chinese: raw.chinese,
    isWrong: asFlag(raw.isWrong ?? raw.iswrong),
    isFavorites: asFlag(raw.isFavorites ?? raw.isfavorites),
    isEasy: asFlag(raw.isEasy ?? raw.iseasy),
  };
}

export function getVocabulary(): Word[] {
  return vocabulary;
}

export function setVocabulary(words: Word[]) {
  vocabulary = words.map(normalizeWord);
}

export function getWrongWords(): Word[] {
  return vocabulary.filter((w) => w.isWrong === 1);
}

export function getFavorites(): Word[] {
  return vocabulary.filter((w) => w.isFavorites === 1);
}

export function getEasyWords(): Word[] {
  return vocabulary.filter((w) => w.isEasy === 1);
}

function findIndex(english: string, id?: number): number {
  if (id != null) {
    const byId = vocabulary.findIndex((w) => w.id === id);
    if (byId >= 0) return byId;
  }
  return vocabulary.findIndex(
    (w) => w.english.toLowerCase() === english.toLowerCase(),
  );
}

function setFlag(
  english: string,
  id: number | undefined,
  key: "isWrong" | "isFavorites" | "isEasy",
  value: Flag01,
): Word[] {
  const idx = findIndex(english, id);
  if (idx < 0) return vocabulary;
  vocabulary = vocabulary.map((w, i) =>
    i === idx ? { ...w, [key]: value } : w,
  );
  void syncVocabularyToDisk();
  return vocabulary;
}

export function setWrong(english: string, id: number | undefined, on: boolean) {
  return setFlag(english, id, "isWrong", on ? 1 : 0);
}

export function setFavorite(
  english: string,
  id: number | undefined,
  on: boolean,
) {
  return setFlag(english, id, "isFavorites", on ? 1 : 0);
}

export function setEasy(english: string, id: number | undefined, on: boolean) {
  return setFlag(english, id, "isEasy", on ? 1 : 0);
}

export function isWrong(english: string, id?: number): boolean {
  const idx = findIndex(english, id);
  return idx >= 0 && vocabulary[idx].isWrong === 1;
}

export function isFavorite(english: string, id?: number): boolean {
  const idx = findIndex(english, id);
  return idx >= 0 && vocabulary[idx].isFavorites === 1;
}

export function isEasy(english: string, id?: number): boolean {
  const idx = findIndex(english, id);
  return idx >= 0 && vocabulary[idx].isEasy === 1;
}

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

/**
 * Parse vocabulary CSV.
 * Required: category, english, chinese
 * Optional: id, categoryId, isWrong, isFavorites, isEasy
 */
export function parseVocabularyCsv(text: string): Word[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) {
    throw new Error("CSV 为空");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("english");
  if (!hasHeader) {
    throw new Error("CSV 需包含表头，且至少有 english 列");
  }

  const idx = (name: string) => header.indexOf(name);
  const idI = idx("id");
  const catIdI = idx("categoryid");
  const catI = idx("category");
  const enI = idx("english");
  const zhI = idx("chinese");
  const wrongI = Math.max(idx("iswrong"), idx("is_wrong"));
  const favI = Math.max(idx("isfavorites"), idx("is_favorites"));
  const easyI = Math.max(idx("iseasy"), idx("is_easy"));

  if (enI < 0 || zhI < 0 || catI < 0) {
    throw new Error("CSV 必须包含 category, english, chinese 列");
  }

  const words: Word[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const english = (cols[enI] ?? "").trim();
    if (!english) continue;
    const idRaw = idI >= 0 ? Number(cols[idI]) : i;
    const catIdRaw = catIdI >= 0 ? Number(cols[catIdI]) : 0;
    words.push(
      normalizeWord({
        id: Number.isFinite(idRaw) ? idRaw : i,
        categoryId: Number.isFinite(catIdRaw) ? catIdRaw : 0,
        category: (cols[catI] ?? "").trim(),
        english,
        chinese: (cols[zhI] ?? "").trim(),
        isWrong: asFlag(wrongI >= 0 ? cols[wrongI] : 0),
        isFavorites: asFlag(favI >= 0 ? cols[favI] : 0),
        isEasy: asFlag(easyI >= 0 ? cols[easyI] : 0),
      }),
    );
  }

  if (!words.length) {
    throw new Error("CSV 中没有有效单词行");
  }
  return words;
}

/** Export vocabulary.json → CSV (including book flags). */
export function vocabularyToCsv(list: Word[] = vocabulary): string {
  const lines = [
    "id,categoryId,category,english,chinese,isWrong,isFavorites,isEasy",
  ];
  for (const w of list) {
    lines.push(
      [
        String(w.id),
        String(w.categoryId),
        escapeCsvField(w.category),
        escapeCsvField(w.english),
        escapeCsvField(w.chinese),
        String(w.isWrong ?? 0),
        String(w.isFavorites ?? 0),
        String(w.isEasy ?? 0),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function downloadVocabularyCsv(list?: Word[]) {
  const csv = vocabularyToCsv(list);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vocabulary.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Replace vocabulary from CSV text and persist to disk. */
export async function importVocabularyFromCsv(text: string): Promise<Word[]> {
  const words = parseVocabularyCsv(text);
  await syncVocabularyToDisk(words);
  return vocabulary;
}

let syncing: Promise<void> | null = null;

/** Persist vocabulary into project `data/vocabulary.json` via Vite API. */
export async function syncVocabularyToDisk(list: Word[] = vocabulary) {
  vocabulary = list.map(normalizeWord);
  if (syncing) await syncing;
  syncing = (async () => {
    try {
      await fetch(VOCAB_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vocabulary, null, 2) + "\n",
      });
    } catch {
      // static preview without API — keep in-memory only
    }
  })();
  await syncing;
  syncing = null;
}

/** Load vocabulary from project file (falls back to public static JSON). */
export async function loadVocabularyFromDisk(): Promise<Word[]> {
  try {
    let res = await fetch(VOCAB_URL);
    if (!res.ok) res = await fetch("/data/vocabulary.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) throw new Error("vocabulary is not an array");
    vocabulary = data.map((row) =>
      normalizeWord(row as Partial<Word> & {
        english: string;
        chinese: string;
        category: string;
      }),
    );
    return vocabulary;
  } catch {
    vocabulary = [];
    return vocabulary;
  }
}
