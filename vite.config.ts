import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataVocabPath = path.join(rootDir, "data/vocabulary.json");
const publicVocabPath = path.join(rootDir, "public/data/vocabulary.json");

async function readVocabularyFile(): Promise<string> {
  try {
    return await fs.readFile(dataVocabPath, "utf8");
  } catch {
    return await fs.readFile(publicVocabPath, "utf8");
  }
}

async function writeVocabularyFile(body: string) {
  await fs.mkdir(path.dirname(dataVocabPath), { recursive: true });
  await fs.writeFile(dataVocabPath, body, "utf8");
  await fs.mkdir(path.dirname(publicVocabPath), { recursive: true });
  await fs.writeFile(publicVocabPath, body, "utf8");
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

function attachVocabularyApi(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const url = (req.url ?? "").split("?")[0];
    if (url !== "/api/vocabulary.json") {
      next();
      return;
    }

    try {
      if (req.method === "GET") {
        const body = await readVocabularyFile();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(body);
        return;
      }

      if (req.method === "PUT") {
        const body = await readRequestBody(req);
        JSON.parse(body); // validate
        await writeVocabularyFile(body.endsWith("\n") ? body : `${body}\n`);
        res.statusCode = 204;
        res.end();
        return;
      }

      res.statusCode = 405;
      res.end("Method not allowed");
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
        await writeVocabularyFile(body.endsWith("\n") ? body : `${body}\n`);
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
});
