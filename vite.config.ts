import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, "data");

const ALLOWED = new Set([
  "wrong-words.csv",
  "favorites.csv",
  "easy-words.json",
]);

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

function attachBooksApi(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/books/")) {
      next();
      return;
    }

    const name = decodeURIComponent(url.slice("/api/books/".length).split("?")[0]);
    if (!ALLOWED.has(name)) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const filePath = path.join(dataDir, name);

    try {
      if (req.method === "GET") {
        const body = await fs.readFile(filePath, "utf8");
        res.setHeader(
          "Content-Type",
          name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json",
        );
        res.end(body);
        return;
      }

      if (req.method === "PUT") {
        const body = await readRequestBody(req);
        await fs.mkdir(dataDir, { recursive: true });
        await fs.writeFile(filePath, body, "utf8");
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

function booksDataPlugin(): Plugin {
  return {
    name: "books-data-api",
    configureServer(server: ViteDevServer) {
      attachBooksApi(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      attachBooksApi(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), booksDataPlugin()],
});
