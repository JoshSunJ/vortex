import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lstat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_GEMINI_MODEL } from './gemini.mjs';

const defaultPath = fileURLToPath(new URL('../.env.local', import.meta.url));
const problem = (status) => Object.assign(new Error('Local setup could not complete.'), { status });

async function checkTarget(targetPath) {
  try {
    const info = await lstat(targetPath);
    if (!info.isFile() || info.isSymbolicLink()) throw problem(409);
    const current = await readFile(targetPath, 'utf8');
    if (current.length > 4096 || /^\s*GEMINI_API_KEY[ \t]*=[ \t]*\S/m.test(current)) throw problem(409);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) throw problem(413);
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/** One-time development setup only, never a product API or public server.
 * The caller chooses a trusted local target, not an HTTP-provided path. No key
 * is logged, returned, or accepted in a URL. The helper cannot inspect billing;
 * the user must verify Free tier in Google AI Studio before confirming the form.
 */
export async function startLocalKeySetup({ targetPath = defaultPath, port = 0, timeoutMs = 600000 } = {}) {
  if (typeof targetPath !== 'string' || !targetPath || !Number.isInteger(port) || port < 0 || port > 65535 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) throw problem(400);
  targetPath = resolve(targetPath);
  const token = randomBytes(32).toString('hex');
  let url;
  let consumed = false;
  let timer;
  const reply = (response, status, body, type = 'text/plain; charset=utf-8') => {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
    response.end(body);
  };
  const server = createServer((request, response) => {
    void (async () => {
      try {
        if (request.headers.host !== new URL(url).host || request.socket.remoteAddress !== '127.0.0.1') throw problem(403);
        if (request.method === 'GET' && request.url === '/') {
          return reply(response, 200, `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Vortex Gemini Setup</title>
<style>body{font:18px system-ui;max-width:640px;margin:64px auto;padding:24px;background:#f5f7fb;color:#172033}label{display:block;margin:24px 0}input[type=password]{display:block;width:95%;padding:12px;margin-top:8px}button{padding:12px 20px;font:inherit}small{display:block;line-height:1.6}</style>
<h1>Vortex Gemini Setup</h1><p>This one-time page runs only on your computer.</p>
<small>The key will be saved to the Git-ignored local environment file. No billing changes or paid model fallback will be enabled. Your project must show Free tier in Google AI Studio.</small>
<form method="post" action="/configure" autocomplete="off">
<input type="hidden" name="token" value="${token}">
<label>Gemini API key<input type="password" name="apiKey" required maxlength="256" autocomplete="off" spellcheck="false"></label>
<label><input type="checkbox" name="freeTier" value="confirmed" required> I verified that this key belongs to a Free-tier project.</label>
<button type="submit">Save key locally</button></form></html>`, 'text/html; charset=utf-8');
        }
        if (request.method !== 'POST' || request.url !== '/configure') throw problem(404);
        if (consumed) throw problem(409);
        if (request.headers.origin !== url ||
            (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) throw problem(403);
        if (request.headers['content-type']?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') throw problem(415);
        const form = await readForm(request);
        if ([...form.keys()].some((key) => !['token', 'apiKey', 'freeTier'].includes(key)) ||
            ['token', 'apiKey', 'freeTier'].some((key) => form.getAll(key).length !== 1)) throw problem(400);
        const submitted = Buffer.from(form.get('token'));
        const expected = Buffer.from(token);
        if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) throw problem(403);
        const key = form.get('apiKey');
        if (form.get('freeTier') !== 'confirmed' || !key || key.length > 256 || !/^[A-Za-z0-9._-]+$/u.test(key)) throw problem(400);
        if (consumed) throw problem(409);
        consumed = true;
        await checkTarget(targetPath);
        const temporary = `${targetPath}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, `GEMINI_API_KEY=${key}\nGEMINI_MODEL=${DEFAULT_GEMINI_MODEL}\n`, { flag: 'wx', mode: 0o600 });
          await checkTarget(targetPath);
          await rename(temporary, targetPath);
        } finally {
          await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
        }
        reply(response, 200, 'Key saved locally. No key was displayed or sent to GitHub. You can close this tab.');
        clearTimeout(timer);
        server.close();
      } catch (error) {
        if (!response.headersSent) reply(response, Number.isInteger(error.status) ? error.status : 500,
          'Setup was not completed. Existing keys are never overwritten. No key value is returned.');
      }
    })();
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); accept(); });
  });
  url = `http://127.0.0.1:${server.address().port}`;
  timer = setTimeout(() => { server.close(); server.closeAllConnections(); }, timeoutMs);
  return { url, token, close: async () => {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise((accept) => server.close(() => accept()));
  } };
}
