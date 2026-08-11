import type { WordEntry } from "../types";

const WRONG_KEY = "vocab.wrong-words";
const FAVORITES_KEY = "vocab.favorites";
const EASY_KEY = "vocab.easy-words";
const TRASH_KEY = "vocab.trash";
const SETTINGS_KEY = "vocab.settings";

export type Settings = {
  accent: "us" | "uk";
  showPhonetic: boolean;
  autoSpeak: boolean;
  order: "random" | "sequential";
};

const defaultSettings: Settings = {
  accent: "us",
  showPhonetic: true,
  autoSpeak: true,
  order: "random",
};

function readList(key: string): WordEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: WordEntry[]) {
  localStorage.setItem(key, JSON.stringify(list, null, 2));
}

export function getWrongWords(): WordEntry[] {
  return readList(WRONG_KEY);
}

export function getFavorites(): WordEntry[] {
  return readList(FAVORITES_KEY);
}

export function getEasyWords(): WordEntry[] {
  return readList(EASY_KEY);
}

export function getTrashWords(): WordEntry[] {
  return readList(TRASH_KEY);
}

export function setWrongWords(list: WordEntry[]) {
  writeList(WRONG_KEY, list);
  void syncBooksToDisk();
}

export function setFavorites(list: WordEntry[]) {
  writeList(FAVORITES_KEY, list);
  void syncBooksToDisk();
}

export function setEasyWords(list: WordEntry[]) {
  writeList(EASY_KEY, list);
  void syncBooksToDisk();
}

export function setTrashWords(list: WordEntry[]) {
  writeList(TRASH_KEY, list);
  void syncBooksToDisk();
}

export function upsertWrongWord(entry: Omit<WordEntry, "addedAt" | "wrongCount">) {
  const list = getWrongWords();
  const idx = list.findIndex(
    (w) => w.english.toLowerCase() === entry.english.toLowerCase(),
  );
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      ...entry,
      wrongCount: (list[idx].wrongCount ?? 1) + 1,
    };
  } else {
    list.unshift({
      ...entry,
      addedAt: new Date().toISOString(),
      wrongCount: 1,
    });
  }
  setWrongWords(list);
  return list;
}

export function addFavorite(entry: Omit<WordEntry, "addedAt">) {
  const list = getFavorites();
  if (list.some((w) => w.english.toLowerCase() === entry.english.toLowerCase())) {
    return list;
  }
  list.unshift({ ...entry, addedAt: new Date().toISOString() });
  setFavorites(list);
  return list;
}

export function removeFavorite(english: string) {
  const list = getFavorites().filter(
    (w) => w.english.toLowerCase() !== english.toLowerCase(),
  );
  setFavorites(list);
  return list;
}

export function removeWrong(english: string) {
  const list = getWrongWords().filter(
    (w) => w.english.toLowerCase() !== english.toLowerCase(),
  );
  setWrongWords(list);
  return list;
}

export function addEasy(entry: Omit<WordEntry, "addedAt">) {
  const list = getEasyWords();
  if (list.some((w) => w.english.toLowerCase() === entry.english.toLowerCase())) {
    return list;
  }
  list.unshift({ ...entry, addedAt: new Date().toISOString() });
  setEasyWords(list);
  return list;
}

export function removeEasy(english: string) {
  const list = getEasyWords().filter(
    (w) => w.english.toLowerCase() !== english.toLowerCase(),
  );
  setEasyWords(list);
  return list;
}

export function isEasy(english: string): boolean {
  return getEasyWords().some(
    (w) => w.english.toLowerCase() === english.toLowerCase(),
  );
}

export function isFavorite(english: string): boolean {
  return getFavorites().some(
    (w) => w.english.toLowerCase() === english.toLowerCase(),
  );
}

export function isTrashed(english: string): boolean {
  return getTrashWords().some(
    (w) => w.english.toLowerCase() === english.toLowerCase(),
  );
}

/** Move word into trash.csv; also strip from other books. */
export function addToTrash(entry: Omit<WordEntry, "addedAt">) {
  const list = getTrashWords();
  if (!list.some((w) => w.english.toLowerCase() === entry.english.toLowerCase())) {
    list.unshift({ ...entry, addedAt: new Date().toISOString() });
    // write without double-sync from remove* calls
    writeList(TRASH_KEY, list);
  }
  writeList(
    WRONG_KEY,
    getWrongWords().filter((w) => w.english.toLowerCase() !== entry.english.toLowerCase()),
  );
  writeList(
    FAVORITES_KEY,
    getFavorites().filter((w) => w.english.toLowerCase() !== entry.english.toLowerCase()),
  );
  writeList(
    EASY_KEY,
    getEasyWords().filter((w) => w.english.toLowerCase() !== entry.english.toLowerCase()),
  );
  void syncBooksToDisk();
  return list;
}

export function removeTrash(english: string) {
  const list = getTrashWords().filter(
    (w) => w.english.toLowerCase() !== english.toLowerCase(),
  );
  setTrashWords(list);
  return list;
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

/** Basic word CSV: category,english,chinese */
export function entriesToCsv(list: WordEntry[]): string {
  const lines = ["category,english,chinese"];
  for (const w of list) {
    lines.push(
      [
        escapeCsvField(w.category ?? ""),
        escapeCsvField(w.english),
        escapeCsvField(w.chinese),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Wrong words CSV includes wrongCount. */
export function wrongWordsToCsv(list: WordEntry[] = getWrongWords()): string {
  const lines = ["category,english,chinese,wrongCount"];
  for (const w of list) {
    lines.push(
      [
        escapeCsvField(w.category ?? ""),
        escapeCsvField(w.english),
        escapeCsvField(w.chinese),
        String(w.wrongCount ?? 1),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function parseEntriesCsv(text: string): WordEntry[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("english");
  const start = hasHeader ? 1 : 0;
  const headerCols = hasHeader ? parseCsvLine(lines[0]).map((c) => c.trim().toLowerCase()) : [];
  const wrongIdx = headerCols.indexOf("wrongcount");

  const out: WordEntry[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const category = cols[0]?.trim() ?? "";
    const english = cols[1]?.trim() ?? "";
    const chinese = cols[2]?.trim() ?? "";
    if (!english) continue;
    const entry: WordEntry = {
      category,
      english,
      chinese,
      addedAt: new Date().toISOString(),
    };
    if (wrongIdx >= 0 && cols[wrongIdx]) {
      const n = Number(cols[wrongIdx]);
      if (!Number.isNaN(n)) entry.wrongCount = n;
    } else if (cols[3] && headerCols.length === 0) {
      const n = Number(cols[3]);
      if (!Number.isNaN(n)) entry.wrongCount = n;
    }
    out.push(entry);
  }
  return out;
}

export function trashToCsv(list: WordEntry[] = getTrashWords()): string {
  return entriesToCsv(list);
}

export function parseTrashCsv(text: string): WordEntry[] {
  return parseEntriesCsv(text);
}

let syncing: Promise<void> | null = null;

/** Persist word books into project `data/` via Vite API. */
export async function syncBooksToDisk() {
  if (syncing) {
    await syncing;
  }
  syncing = (async () => {
    const puts: Array<[string, string, string]> = [
      ["/api/books/wrong-words.csv", "text/csv;charset=utf-8", wrongWordsToCsv()],
      ["/api/books/favorites.csv", "text/csv;charset=utf-8", entriesToCsv(getFavorites())],
      ["/api/books/easy-words.json", "application/json", JSON.stringify(getEasyWords(), null, 2)],
      ["/api/books/trash.csv", "text/csv;charset=utf-8", trashToCsv()],
    ];
    await Promise.all(
      puts.map(async ([url, type, body]) => {
        try {
          await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": type },
            body,
          });
        } catch {
          // static preview without API — keep localStorage only
        }
      }),
    );
  })();
  await syncing;
  syncing = null;
}

/** Load word books from project `data/` files. */
export async function loadBooksFromDisk() {
  try {
    const [wrongRes, favRes, easyRes, trashRes] = await Promise.all([
      fetch("/api/books/wrong-words.csv"),
      fetch("/api/books/favorites.csv"),
      fetch("/api/books/easy-words.json"),
      fetch("/api/books/trash.csv"),
    ]);
    if (wrongRes.ok) {
      writeList(WRONG_KEY, parseEntriesCsv(await wrongRes.text()));
    }
    if (favRes.ok) {
      writeList(FAVORITES_KEY, parseEntriesCsv(await favRes.text()));
    }
    if (easyRes.ok) {
      const data = (await easyRes.json()) as WordEntry[];
      if (Array.isArray(data)) writeList(EASY_KEY, data);
    }
    if (trashRes.ok) {
      writeList(TRASH_KEY, parseTrashCsv(await trashRes.text()));
    }
  } catch {
    // keep whatever is in localStorage
  }
}
