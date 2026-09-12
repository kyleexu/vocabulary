import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, "data");
const DEFAULT_VOCAB_FILE = "vocabulary.json";
const VOCAB_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

/** Serialize disk reads/writes so concurrent flag updates don't clobber. */
let diskQueue: Promise<void> = Promise.resolve();

function enqueueDisk<T>(fn: () => Promise<T>): Promise<T> {
  const run = diskQueue.then(fn, fn);
  diskQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sanitizeVocabFile(raw: string | null): string {
  const name = (raw ?? "").trim() || DEFAULT_VOCAB_FILE;
  if (!VOCAB_FILE_RE.test(name)) {
    throw new Error("invalid vocabulary file name");
  }
  return name;
}

function vocabPath(file: string) {
  return path.join(dataDir, file);
}

function fileFromRequest(url: string): string {
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  return sanitizeVocabFile(new URLSearchParams(query).get("file"));
}

async function listVocabFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(dataDir);
    return entries.filter((entry) => VOCAB_FILE_RE.test(entry)).sort((a, b) => {
      if (a === DEFAULT_VOCAB_FILE) return -1;
      if (b === DEFAULT_VOCAB_FILE) return 1;
      return a.localeCompare(b);
    });
  } catch {
    return [];
  }
}

async function readVocabularyFile(file: string): Promise<string> {
  try {
    return await fs.readFile(vocabPath(file), "utf8");
  } catch {
    const error = new Error(`vocabulary file not found: ${file}`);
    (error as Error & { statusCode: number }).statusCode = 404;
    throw error;
  }
}

async function writeVocabularyFile(file: string, body: string) {
  const text = body.endsWith("\n") ? body : `${body}\n`;
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(vocabPath(file), text, "utf8");
}

function readRequestBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function asFlag(value: unknown): 0 | 1 {
  return value === 1 || value === "1" || value === true ? 1 : 0;
}

/** Spaces / underscores / dash variants → ASCII hyphen; spelling pairs keep the first form. */
function normalizeEnglishPhrase(raw: string): string {
  let s = String(raw)
    .trim()
    .replace(/_/g, "-")
    .replace(/[–—−‐]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-*\/-*/g, "/")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  const slash = s.indexOf("/");
  if (slash > 0) {
    const left = s.slice(0, slash);
    const right = s.slice(slash + 1);
    if (isSpellingVariantPair(left, right)) {
      s = left;
    }
  }
  return s;
}

function isSpellingVariantPair(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (/^\d+$/.test(b)) return false;
  if (a.length <= 1 || b.length <= 1) return false;
  if (a.length <= 3 && b.length <= 3) return false;
  const word = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-']*$/;
  return word.test(a) && word.test(b);
}

function attachVocabularyApi(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const rawUrl = req.url ?? "";
    const url = rawUrl.split("?")[0];

    try {
      if (url === "/api/vocabulary/files") {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        const files = await enqueueDisk(() => listVocabFiles());
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ files }));
        return;
      }

      // Full vocabulary file
      if (url === "/api/vocabulary.json") {
        const file = fileFromRequest(rawUrl);
        if (req.method === "GET") {
          const body = await enqueueDisk(() => readVocabularyFile(file));
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(body);
          return;
        }

        if (req.method === "PUT") {
          const body = await readRequestBody(req);
          JSON.parse(body); // validate
          await enqueueDisk(() => writeVocabularyFile(file, body));
          res.statusCode = 204;
          res.end();
          return;
        }

        res.statusCode = 405;
        res.end("Method not allowed");
        return;
      }

      // Patch one word's flags by id → rewrite physical JSON
      if (url === "/api/vocabulary/flag") {
        if (req.method !== "PUT") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const file = fileFromRequest(rawUrl);
        const raw = JSON.parse(await readRequestBody(req)) as {
          id?: unknown;
          isWrong?: unknown;
          isFavorites?: unknown;
          isEasy?: unknown;
        };
        const id = Number(raw.id);
        if (!Number.isFinite(id)) {
          res.statusCode = 400;
          res.end("id required");
          return;
        }

        const updated = await enqueueDisk(async () => {
          const list = JSON.parse(await readVocabularyFile(file)) as Array<
            Record<string, unknown>
          >;
          const idx = list.findIndex((w) => Number(w.id) === id);
          if (idx < 0) {
            throw new Error(`word id ${id} not found`);
          }
          const word = { ...list[idx] };
          if ("isWrong" in raw) word.isWrong = asFlag(raw.isWrong);
          if ("isFavorites" in raw) word.isFavorites = asFlag(raw.isFavorites);
          if ("isEasy" in raw) word.isEasy = asFlag(raw.isEasy);
          // drop legacy keys if present
          delete word.iswrong;
          delete word.isfavorites;
          delete word.iseasy;
          list[idx] = word;
          await writeVocabularyFile(file, JSON.stringify(list, null, 2));
          return word;
        });

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(updated));
        return;
      }

      // Append or update one word in the vocabulary file
      if (url === "/api/vocabulary/word") {
        const file = fileFromRequest(rawUrl);

        if (req.method === "PUT") {
          const raw = JSON.parse(await readRequestBody(req)) as {
            id?: unknown;
            english?: unknown;
            chinese?: unknown;
            pos?: unknown;
          };
          const id = Number(raw.id);
          if (!Number.isFinite(id)) {
            res.statusCode = 400;
            res.end("id required");
            return;
          }

          const updated = await enqueueDisk(async () => {
            const list = JSON.parse(await readVocabularyFile(file)) as Array<
              Record<string, unknown>
            >;
            const idx = list.findIndex((w) => Number(w.id) === id);
            if (idx < 0) {
              throw new Error(`word id ${id} not found`);
            }
            const word = { ...list[idx] };
            if ("english" in raw) {
              const english = normalizeEnglishPhrase(String(raw.english ?? ""));
              if (!english) throw Object.assign(new Error("english required"), { statusCode: 400 });
              word.english = english;
            }
            if ("chinese" in raw) {
              const chinese = String(raw.chinese ?? "").trim();
              if (!chinese) throw Object.assign(new Error("chinese required"), { statusCode: 400 });
              word.chinese = chinese;
            }
            if ("pos" in raw) {
              word.pos = String(raw.pos ?? "").trim();
            }
            list[idx] = word;
            await writeVocabularyFile(file, JSON.stringify(list, null, 2));
            return word;
          });

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(updated));
          return;
        }

        if (req.method === "DELETE") {
          const raw = JSON.parse(await readRequestBody(req)) as { id?: unknown };
          const id = Number(raw.id);
          if (!Number.isFinite(id)) {
            res.statusCode = 400;
            res.end("id required");
            return;
          }

          await enqueueDisk(async () => {
            const list = JSON.parse(await readVocabularyFile(file)) as Array<
              Record<string, unknown>
            >;
            const idx = list.findIndex((w) => Number(w.id) === id);
            if (idx < 0) {
              throw new Error(`word id ${id} not found`);
            }
            list.splice(idx, 1);
            await writeVocabularyFile(file, JSON.stringify(list, null, 2));
          });

          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const raw = JSON.parse(await readRequestBody(req)) as {
          english?: unknown;
          chinese?: unknown;
          pos?: unknown;
          category?: unknown;
          categoryId?: unknown;
          isWrong?: unknown;
          isFavorites?: unknown;
          isEasy?: unknown;
        };

        const english = normalizeEnglishPhrase(String(raw.english ?? ""));
        const chinese = String(raw.chinese ?? "").trim();
        const category = String(raw.category ?? "").trim();
        const pos = String(raw.pos ?? "").trim();

        if (!english || !chinese || !category) {
          res.statusCode = 400;
          res.end("english, chinese, category required");
          return;
        }

        const created = await enqueueDisk(async () => {
          const list = JSON.parse(await readVocabularyFile(file)) as Array<
            Record<string, unknown>
          >;
          let maxId = 0;
          let maxCategoryId = 0;
          let matchedCategoryId: number | null = null;
          for (const w of list) {
            const wid = Number(w.id);
            if (Number.isFinite(wid) && wid > maxId) maxId = wid;
            const cid = Number(w.categoryId);
            if (Number.isFinite(cid) && cid > maxCategoryId) maxCategoryId = cid;
            if (
              matchedCategoryId == null &&
              String(w.category ?? "").trim() === category
            ) {
              matchedCategoryId = Number.isFinite(cid) ? cid : null;
            }
          }

          const requestedCategoryId = Number(raw.categoryId);
          const categoryId =
            Number.isFinite(requestedCategoryId) && requestedCategoryId > 0
              ? requestedCategoryId
              : matchedCategoryId != null && matchedCategoryId > 0
                ? matchedCategoryId
                : maxCategoryId + 1;

          const word = {
            id: maxId + 1,
            categoryId,
            category,
            english,
            chinese,
            pos,
            isWrong: asFlag(raw.isWrong),
            isFavorites: asFlag(raw.isFavorites),
            isEasy: asFlag(raw.isEasy),
          };
          list.push(word);
          await writeVocabularyFile(file, JSON.stringify(list, null, 2));
          return word;
        });

        res.statusCode = 201;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(created));
        return;
      }

      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        typeof err === "object" &&
        err &&
        "statusCode" in err &&
        typeof err.statusCode === "number"
          ? err.statusCode
          : message.includes("invalid vocabulary file")
            ? 400
            : 500;
      res.statusCode = status;
      res.end(message);
    }
  });
}

/** Serve/persist JSON files in data/. */
function vocabularyDataPlugin(): Plugin {
  return {
    name: "vocabulary-data-api",
    configureServer(server: ViteDevServer) {
      attachVocabularyApi(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      attachVocabularyApi(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), vocabularyDataPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
