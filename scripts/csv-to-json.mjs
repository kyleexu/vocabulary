/**
 * Convert data/vocabulary.csv → public/data/vocabulary.json
 * Order is taken from the CSV file as-is (no hardcoded category order).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = join(root, "data/vocabulary.csv");
const outPath = join(root, "public/data/vocabulary.json");

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const parseLine = (line) => {
    const cols = [];
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
  };

  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);

  const idI = idx("id");
  const catIdI = idx("categoryid");
  const catI = idx("category");
  const enI = idx("english");
  const zhI = idx("chinese");

  if (catI < 0 || enI < 0 || zhI < 0) {
    throw new Error("CSV must include category,english,chinese columns");
  }

  const words = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const english = (cols[enI] ?? "").trim();
    if (!english) continue;
    const word = {
      id: idI >= 0 ? Number(cols[idI]) : i,
      categoryId: catIdI >= 0 ? Number(cols[catIdI]) : 0,
      category: (cols[catI] ?? "").trim(),
      english,
      chinese: (cols[zhI] ?? "").trim(),
    };
    if (!Number.isFinite(word.id)) word.id = i;
    if (!Number.isFinite(word.categoryId)) word.categoryId = 0;
    words.push(word);
  }
  return words;
}

const words = parseCsv(readFileSync(csvPath, "utf8"));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(words, null, 2)}\n`, "utf8");
console.log(`Wrote ${words.length} words → ${outPath}`);
