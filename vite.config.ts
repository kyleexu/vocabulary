import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataVocabPath = path.join(rootDir, "data/vocabulary.json");
const publicVocabPath = path.join(rootDir, "public/data/vocabulary.json");

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

async function readVocabularyFile(): Promise<string> {
  try {
    return await fs.readFile(dataVocabPath, "utf8");
  } catch {
    return await fs.readFile(publicVocabPath, "utf8");
  }
}

async function writeVocabularyFile(body: string) {
  const text = body.endsWith("\n") ? body : `${body}\n`;
  await fs.mkdir(path.dirname(dataVocabPath), { recursive: true });
  await fs.writeFile(dataVocabPath, text, "utf8");
  await fs.mkdir(path.dirname(publicVocabPath), { recursive: true });
  await fs.writeFile(publicVocabPath, text, "utf8");
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

function attachVocabularyApi(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const url = (req.url ?? "").split("?")[0];

    try {
      // Full vocabulary file
      if (url === "/api/vocabulary.json") {
        if (req.method === "GET") {
          const body = await enqueueDisk(() => readVocabularyFile());
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(body);
          return;
        }

        if (req.method === "PUT") {
          const body = await readRequestBody(req);
          JSON.parse(body); // validate
          await enqueueDisk(() => writeVocabularyFile(body));
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
          const list = JSON.parse(await readVocabularyFile()) as Array<
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
          await writeVocabularyFile(JSON.stringify(list, null, 2));
          return word;
        });

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(updated));
        return;
      }

      next();
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : String(err));
    }
  });
}

/** Serve/persist data/vocabulary.json; mirror to public for static builds. */
function vocabularyDataPlugin(): Plugin {
  return {
    name: "vocabulary-data-api",
    async buildStart() {
      try {
        const body = await readVocabularyFile();
        await writeVocabularyFile(body);
      } catch (err) {
        console.warn(
          "[vocabulary] could not sync vocabulary.json:",
          err instanceof Error ? err.message : err,
        );
      }
    },
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
