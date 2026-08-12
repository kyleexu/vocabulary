import type { Flag01, SpeakMode, Word } from "../types";

const SETTINGS_KEY = "vocab.settings";
const VOCAB_URL = "/api/vocabulary.json";
const FLAG_URL = "/api/vocabulary/flag";

export type Settings = {
  speakMode: SpeakMode;
  /** Speech rate as percent of default (100 = utterance.rate 1). */
  speakRate: number;
  order: "random" | "sequential";
};

const defaultSettings: Settings = {
  speakMode: "us",
  speakRate: 100,
  order: "random",
};

const SPEAK_RATE_OPTIONS = [50, 75, 100, 125] as const;

export const SPEAK_RATE_CHOICES = [...SPEAK_RATE_OPTIONS];

function asFlag(value: unknown): Flag01 {
  return value === 1 || value === "1" || value === true ? 1 : 0;
}

function normalizeSpeakMode(raw: unknown): SpeakMode {
  if (raw === "off" || raw === "us" || raw === "uk") return raw;
  return defaultSettings.speakMode;
}

function normalizeSpeakRate(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (SPEAK_RATE_OPTIONS.includes(n as (typeof SPEAK_RATE_OPTIONS)[number])) {
    return n;
  }
  return defaultSettings.speakRate;
}

export function normalizeWord(raw: Partial<Word> & {
  english: string;
  chinese: string;
  category: string;
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
    pos: String(raw.pos ?? "").trim(),
    isWrong: asFlag(raw.isWrong ?? raw.iswrong),
    isFavorites: asFlag(raw.isFavorites ?? raw.isfavorites),
    isEasy: asFlag(raw.isEasy ?? raw.iseasy),
  };
}

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<Settings> & {
      accent?: "us" | "uk";
      autoSpeak?: boolean;
    };
    let speakMode = normalizeSpeakMode(parsed.speakMode);
    if (
      parsed.speakMode == null &&
      (parsed.accent != null || parsed.autoSpeak != null)
    ) {
      speakMode =
        parsed.autoSpeak === false
          ? "off"
          : parsed.accent === "uk"
            ? "uk"
            : "us";
    }
    return {
      speakMode,
      speakRate: normalizeSpeakRate(parsed.speakRate),
      order: parsed.order === "sequential" ? "sequential" : "random",
    };
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
 * Optional: id, categoryId, pos, isWrong, isFavorites, isEasy
 */
export function parseVocabularyCsv(text: string): Word[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) {
    throw new Error("CSV 为空");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  if (!header.includes("english")) {
    throw new Error("CSV 需包含表头，且至少有 english 列");
  }

  const idx = (name: string) => header.indexOf(name);
  const idI = idx("id");
  const catIdI = idx("categoryid");
  const catI = idx("category");
  const enI = idx("english");
  const zhI = idx("chinese");
  const posI = Math.max(idx("pos"), idx("partofspeech"), idx("词性"));
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
        pos: posI >= 0 ? (cols[posI] ?? "").trim() : "",
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
export function vocabularyToCsv(list: Word[]): string {
  const lines = [
    "id,categoryId,category,english,chinese,pos,isWrong,isFavorites,isEasy",
  ];
  for (const w of list) {
    lines.push(
      [
        String(w.id),
        String(w.categoryId),
        escapeCsvField(w.category),
        escapeCsvField(w.english),
        escapeCsvField(w.chinese),
        escapeCsvField(w.pos ?? ""),
        String(w.isWrong ?? 0),
        String(w.isFavorites ?? 0),
        String(w.isEasy ?? 0),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function downloadVocabularyCsv(list: Word[]) {
  const csv = vocabularyToCsv(list);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vocabulary.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Load vocabulary from physical data/vocabulary.json via Vite API. */
export async function loadVocabularyFromDisk(): Promise<Word[]> {
  let res = await fetch(VOCAB_URL);
  if (!res.ok) res = await fetch("/data/vocabulary.json");
  if (!res.ok) throw new Error(`加载词库失败: HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("vocabulary is not an array");
  return data.map((row) =>
    normalizeWord(row as Partial<Word> & {
      english: string;
      chinese: string;
      category: string;
    }),
  );
}

/** Replace entire vocabulary.json on disk (CSV import). */
export async function replaceVocabularyOnDisk(words: Word[]): Promise<Word[]> {
  const list = words.map(normalizeWord);
  const res = await fetch(VOCAB_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(list, null, 2) + "\n",
  });
  if (!res.ok) {
    throw new Error(`写入词库失败: HTTP ${res.status} ${await res.text()}`);
  }
  return list;
}

export async function importVocabularyFromCsv(text: string): Promise<Word[]> {
  return replaceVocabularyOnDisk(parseVocabularyCsv(text));
}

type FlagKey = "isWrong" | "isFavorites" | "isEasy";

/** Read physical JSON, find by id, patch flags, write back. */
export async function patchWordFlags(
  id: number,
  flags: Partial<Pick<Word, FlagKey>>,
): Promise<Word> {
  const res = await fetch(FLAG_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...flags }),
  });
  if (!res.ok) {
    throw new Error(`更新词本失败: HTTP ${res.status} ${await res.text()}`);
  }
  return normalizeWord(await res.json());
}

export function setWrong(id: number, on: boolean): Promise<Word> {
  return patchWordFlags(id, { isWrong: on ? 1 : 0 });
}

export function setFavorite(id: number, on: boolean): Promise<Word> {
  return patchWordFlags(id, { isFavorites: on ? 1 : 0 });
}

export function setEasy(id: number, on: boolean): Promise<Word> {
  return patchWordFlags(id, { isEasy: on ? 1 : 0 });
}
