// Vortex phone reader server: serves the static brief reader and forwards SpacetimeDB's /v1 API
// (HTTP and the client WebSocket), so the phone needs only one address or one tunnel.
import http from "node:http";
import net from "node:net";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const PORT = Number(process.env.PORT ?? 8791);
const STDB_HOST = process.env.STDB_HOST ?? "127.0.0.1";
const STDB_PORT = Number(process.env.STDB_PORT ?? 3100);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/v1/")) {
      const upstream = http.request({ host: STDB_HOST, port: STDB_PORT, method: req.method, path: req.url, headers: req.headers }, (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      });
      upstream.on("error", () => send(res, 502, { error: "SpacetimeDB is not running" }));
      return req.pipe(upstream);
    }

    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (path.includes("..")) return send(res, 400, { error: "bad path" });
    const file = await readFile(new URL(`./public${path}`, import.meta.url)).catch(() => null);
    if (!file) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(file);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err?.message ?? err) });
  }
});

// WebSocket upgrades (the SpacetimeDB client connection): replay the handshake upstream, then pipe bytes.
server.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith("/v1/")) return socket.destroy();
  const upstream = net.connect(STDB_PORT, STDB_HOST, () => {
    let handshake = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) handshake += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    upstream.write(handshake + "\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, () => console.log(`Vortex phone reader on http://localhost:${PORT}  (SpacetimeDB at ${STDB_HOST}:${STDB_PORT})`));

function send(res, status, body) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
