// Picture coverage page (27.11): node tools/coverage/server.mjs [port=8234]  ->  http://127.0.0.1:8234/
// Serves tools/coverage/*, reads and writes the config docs/pics/coverage.json (POST /api/config). No dependencies.
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CFG = resolve(HERE, "../../docs/pics/coverage.json");
const port = Number(process.argv[2] ?? 8234);
const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/api/config") {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try { JSON.parse(body); writeFileSync(CFG, body); res.end("ok"); } catch (e) { res.statusCode = 400; res.end(String(e)); }
      });
      return;
    }
    res.setHeader("content-type", TYPES[".json"]);
    res.end(existsSync(CFG) ? readFileSync(CFG) : "null");
    return;
  }
  const file = join(HERE, url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, ""));
  if (!file.startsWith(HERE) || !existsSync(file)) { res.statusCode = 404; res.end("not found"); return; }
  res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`coverage: http://127.0.0.1:${port}/  (config: ${CFG})`));
