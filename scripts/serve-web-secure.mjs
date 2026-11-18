// Local static verification, not a public HTTPS deployment or a development packager.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isContainedPath } from "./lib/contained-path.mjs";
import { webSecurityHeaders } from "./lib/web-security.mjs";

const root = fs.realpathSync(
  path.join(fileURLToPath(new URL("../", import.meta.url)), "mobile/app/dist"),
);
const port = Number(process.env.WEB_SECURE_PORT ?? 8099);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("invalid_web_port");
const headers = webSecurityHeaders(root, process.env);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const server = http.createServer(
  { headersTimeout: 10_000, requestTimeout: 15_000, keepAliveTimeout: 5_000 },
  (request, response) => {
    for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
    response.setHeader("Cache-Control", "no-store");
    const reject = (status) => {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unavailable");
    };
    try {
      const host = new URL(`http://${request.headers.host ?? ""}`).hostname;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return reject(403);
      if (!["GET", "HEAD"].includes(request.method)) return reject(405);
      if (!request.url?.startsWith("/") || request.url.length > 4096) return reject(400);
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (
        pathname.includes("\\") ||
        pathname.includes("\0") ||
        pathname.split("/").some((part) => part.startsWith(".")) ||
        pathname.endsWith(".map") ||
        pathname === "/_headers"
      )
        return reject(404);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//u, "");
      let file = path.resolve(root, relative);
      if (!path.extname(file)) file += ".html";
      if (
        !isContainedPath(root, file) ||
        !fs.existsSync(file) ||
        fs.lstatSync(file).isSymbolicLink() ||
        !isContainedPath(root, fs.realpathSync(file)) ||
        !fs.statSync(file).isFile()
      )
        return reject(404);
      response.writeHead(200, {
        "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
      });
      if (request.method === "HEAD") return response.end();
      const stream = fs.createReadStream(file);
      stream.on("error", () => response.destroy());
      response.on("close", () => stream.destroy());
      stream.pipe(response);
    } catch {
      reject(400);
    }
  },
);
server.maxConnections = 64;
server.maxRequestsPerSocket = 100;
process.once("SIGTERM", () => server.close());
process.once("SIGINT", () => server.close());
server.listen(port, "127.0.0.1", () =>
  console.log(`Secure-header static preview: http://localhost:${port} (loopback only)`),
);
