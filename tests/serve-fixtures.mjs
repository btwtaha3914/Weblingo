/**
 * Serves tests/fixtures/site as an "external" website on another origin, with
 * the WebLingo widget tag pointing at your WebLingo server.
 *
 *   node tests/serve-fixtures.mjs <projectKey> [apiUrl=http://localhost:3000] [port=8090]
 *
 * Then open http://localhost:8090/index.html
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [key, api = "http://localhost:3000", port = "8090"] = process.argv.slice(2);
if (!key) {
  console.error("Usage: node tests/serve-fixtures.mjs <projectKey> [apiUrl] [port]");
  process.exit(1);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "site");

http
  .createServer(async (req, res) => {
    const name = path.basename(new URL(req.url, "http://x").pathname) || "index.html";
    if (!/^[a-z0-9-]+\.html$/i.test(name)) {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      const html = (await readFile(path.join(root, name), "utf8")).replaceAll("__KEY__", key).replaceAll("__API__", api);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(Number(port), () => console.log(`Fixture site on http://localhost:${port}/index.html (widget from ${api})`));
