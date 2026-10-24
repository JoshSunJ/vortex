import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { request as httpRequest } from 'node:http';
import { startLocalKeySetup } from '../src/local-key-setup.mjs';

// These tests use disposable local files, loopback HTTP, and synthetic keys only.
// No Google service, real API key, or repository environment file is accessed.
const mockKey = 'MOCK_LOCAL_KEY_NOT_A_REAL_CREDENTIAL';
const modelLine = 'GEMINI_MODEL=gemini-3.5-flash-lite\n';

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'vortex-key-setup-test-'));
  const targetPath = join(directory, '.env.local');
  let server;
  try {
    server = await startLocalKeySetup({ targetPath });
    await run({ server, targetPath, directory });
  } finally {
    await server?.close();
    const absolute = resolve(directory);
    const allowedParent = resolve(tmpdir()) + sep;
    assert.equal(absolute.startsWith(allowedParent), true);
    assert.match(absolute.slice(allowedParent.length), /^vortex-key-setup-test-[^\\/]+$/u);
    await rm(absolute, { recursive: true, force: true });
  }
}

function form(server, changes = {}) {
  return new URLSearchParams({ token: server.token, apiKey: mockKey,
    freeTier: 'confirmed', ...changes }).toString();
}

async function post(server, { body = form(server), origin = new URL(server.url).origin,
  contentType = 'application/x-www-form-urlencoded', headers = {} } = {}) {
  return fetch(new URL('/configure', server.url), {
    method: 'POST', headers: { ...(origin === undefined ? {} : { Origin: origin }),
      'Content-Type': contentType, ...headers }, body,
    signal: AbortSignal.timeout(5000),
  });
}

test('serves a loopback-only password form without exposing a key', async () => {
  await fixture(async ({ server, targetPath }) => {
    assert.equal(new URL(server.url).hostname, '127.0.0.1');
    assert.ok(typeof server.token === 'string' && server.token.length >= 24);
    const response = await fetch(server.url, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /type=["']password["']/iu);
    assert.match(html, /name=["']apiKey["']/u);
    assert.equal(html.includes(mockKey), false);
    await assert.rejects(readFile(targetPath), { code: 'ENOENT' });
  });
});

test('stores the key locally only after confirmation and returns no key value', async () => {
  await fixture(async ({ server, targetPath }) => {
    const response = await post(server);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes(mockKey), false);
    assert.equal(await readFile(targetPath, 'utf8'), `GEMINI_API_KEY=${mockKey}\n${modelLine}`);
    await server.close();
    await assert.rejects(fetch(server.url, { signal: AbortSignal.timeout(1000) }));
  });
});

test('allows replacing only an existing blank key template', async () => {
  await fixture(async ({ server, targetPath }) => {
    await writeFile(targetPath, `GEMINI_API_KEY=\n${modelLine}`, 'utf8');
    const response = await post(server);
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(await readFile(targetPath, 'utf8'), `GEMINI_API_KEY=${mockKey}\n${modelLine}`);
  });
});

test('rejects missing or cross-origin requests without creating the local file', async () => {
  await fixture(async ({ server, targetPath }) => {
    for (const origin of ['', 'https://example.com', 'http://localhost:1']) {
      const response = await post(server, { origin });
      assert.equal(response.status, 403);
      assert.equal((await response.text()).includes(mockKey), false);
    }
    const response = await fetch(new URL('/configure', server.url), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form(server), signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 403);
    await response.text();
    await assert.rejects(readFile(targetPath), { code: 'ENOENT' });
  });
});

test('rejects invalid CSRF tokens without storing the key', async () => {
  await fixture(async ({ server, targetPath }) => {
    for (const token of ['', 'invalid-token']) {
      const response = await post(server, { body: form(server, { token }) });
      assert.equal(response.status, 403);
      await response.text();
    }
    await assert.rejects(readFile(targetPath), { code: 'ENOENT' });
  });
});

test('requires explicit free-tier confirmation and a bounded whitespace-free key', async () => {
  await fixture(async ({ server, targetPath }) => {
    for (const changes of [{ freeTier: '' }, { freeTier: 'false' }, { apiKey: '' },
      { apiKey: 'has whitespace' }, { apiKey: 'line\nbreak' }, { apiKey: 'key#comment' },
      { apiKey: '"quoted-key"' }, { apiKey: 'x'.repeat(257) }]) {
      const response = await post(server, { body: form(server, changes) });
      assert.equal(response.status, 400);
      await response.text();
    }
    await assert.rejects(readFile(targetPath), { code: 'ENOENT' });
  });
});

test('rejects a forged Host header even when the request Origin matches', async () => {
  await fixture(async ({ server, targetPath }) => {
    const url = new URL(server.url);
    const result = await new Promise((accept, reject) => {
      const request = httpRequest({ hostname: '127.0.0.1', port: url.port, path: '/configure',
        method: 'POST', headers: { Host: 'example.com', Origin: url.origin,
          'Content-Type': 'application/x-www-form-urlencoded' } }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => accept({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      request.on('error', reject);
      request.setTimeout(5000, () => request.destroy(new Error('Local test timed out.')));
      request.end(form(server));
    });
    assert.equal(result.status, 403);
    assert.equal(result.body.includes(mockKey), false);
    await assert.rejects(readFile(targetPath), { code: 'ENOENT' });
  });
});

test('rejects unsupported content types and oversized request bodies', async () => {
  await fixture(async ({ server, targetPath }) => {
    const invalidType = await post(server, { contentType: 'application/json', body: '{}' });
    assert.equal(invalidType.status, 415);
    await invalidType.text();
    const large = await post(server, { body: form(server) + '&padding=' + 'x'.repeat(3000) });
    assert.equal(large.status, 413);
    await large.text();
    await assert.rejects(readFile(targetPath), { code: 'ENOENT' });
  });
});

test('refuses to overwrite an existing nonempty local key', async () => {
  await fixture(async ({ server, targetPath }) => {
    const original = `GEMINI_API_KEY=MOCK_EXISTING_KEY\n${modelLine}`;
    await writeFile(targetPath, original, 'utf8');
    const response = await post(server);
    assert.equal(response.status, 409);
    const body = await response.text();
    assert.equal(body.includes('MOCK_EXISTING_KEY'), false);
    assert.equal(body.includes(mockKey), false);
    assert.equal(await readFile(targetPath, 'utf8'), original);
  });
});

test('rejects symlink targets without altering the destination when symlinks are available', async (t) => {
  await fixture(async ({ server, targetPath, directory }) => {
    const destination = join(directory, 'other.env');
    const original = `GEMINI_API_KEY=\n${modelLine}`;
    await writeFile(destination, original, 'utf8');
    try { await symlink(destination, targetPath, 'file'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        t.skip('This host does not permit creating test symlinks.');
        return;
      }
      throw error;
    }
    const response = await post(server);
    assert.notEqual(response.status, 200);
    await response.text();
    assert.equal(await readFile(destination, 'utf8'), original);
  });
});

test('close is safe to call twice and stops the listener', async () => {
  await fixture(async ({ server }) => {
    await server.close();
    await server.close();
    await assert.rejects(fetch(server.url, { signal: AbortSignal.timeout(1000) }));
  });
});
