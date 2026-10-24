import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiModel, DEFAULT_GEMINI_MODEL, GEMINI_ENDPOINT } from '../src/gemini.mjs';

// Injected fetch/Response fixtures only. No network or real credentials are used.
const apiKey = 'MOCK_TEST_KEY_NOT_A_REAL_CREDENTIAL';
const messages = [{ role: 'system', content: 'Return JSON only.' }, { role: 'user', content: 'Synthetic public demo data.' }];
const request = (changes = {}) => ({ messages, ...changes });
const completion = (changes = {}) => ({
  model: DEFAULT_GEMINI_MODEL,
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"ready":true}' } }],
  ...changes,
});
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const adapter = (fetchImpl, changes = {}) => createGeminiModel({ apiKey, fetchImpl, ...changes });

test('uses the selected Gemini model and a fixed official endpoint without SDK dependencies', async () => {
  let calls = 0;
  const controller = new AbortController();
  const model = adapter(async (url, options) => {
    calls++;
    assert.equal(url, GEMINI_ENDPOINT);
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.equal(url.includes(apiKey), false);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    const headers = new Headers(options.headers);
    assert.equal(headers.get('authorization'), `Bearer ${apiKey}`);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(options.signal, controller.signal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, DEFAULT_GEMINI_MODEL);
    assert.deepEqual(body.messages, messages);
    assert.equal(body.stream, false);
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.name, 'grounded_selection');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.type, 'object');
    assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'response_format', 'stream']);
    return jsonResponse(completion());
  });
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.5-flash-lite');
  assert.equal(model.providerId, 'google-gemini');
  assert.equal(model.modelId, DEFAULT_GEMINI_MODEL);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(await model.complete(request({ signal: controller.signal })), '{"ready":true}');
  assert.equal(calls, 1);
});

test('rejects missing or unsafe credentials and non-allowlisted models before any request', () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; };
  for (const invalidKey of [undefined, '', ' ', 'key with spaces', 'key\nsecret', 'x'.repeat(257), 123]) {
    assert.throws(() => createGeminiModel({ apiKey: invalidKey, fetchImpl }), { code: 'VALIDATION_ERROR' });
  }
  for (const modelId of ['gemini-4-argon', 'models/gemini-3.5-flash-lite', 'gpt-other', 'gemini-3.5-flash-lite?key=secret', '']) {
    assert.throws(() => createGeminiModel({ apiKey, modelId, fetchImpl }), { code: 'VALIDATION_ERROR' });
  }
  assert.throws(() => createGeminiModel({ apiKey, fetchImpl: null }), { code: 'VALIDATION_ERROR' });
  assert.equal(calls, 0);
});

test('validates message count, roles, contents, payload size, and AbortSignal before fetch', async () => {
  let calls = 0;
  const model = adapter(async () => { calls++; return jsonResponse(completion()); });
  for (const invalid of [undefined, null, {}, { messages: [] },
    { messages: Array(5).fill(messages[0]) },
    { messages: [{ role: 'tool', content: 'An unsupported role.' }] },
    { messages: [{ role: 'user', content: 123 }] },
    { messages: [{ role: 'user', content: '' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(280001) }] },
    { messages, signal: {} }]) {
    await assert.rejects(model.complete(invalid), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(calls, 0);
});

test('does not forward extra tools, message fields, or a caller-supplied endpoint', async () => {
  let sent;
  const model = adapter(async (url, options) => {
    assert.equal(url, GEMINI_ENDPOINT);
    sent = JSON.parse(options.body);
    return jsonResponse(completion());
  });
  await model.complete(request({
    messages: [{ role: 'user', content: 'Only permitted text.', tool_calls: [{ function: 'shell' }] }],
    tools: [{ type: 'function' }], endpoint: 'https://attacker.invalid',
  }));
  assert.deepEqual(sent.messages, [{ role: 'user', content: 'Only permitted text.' }]);
  assert.equal('tools' in sent, false);
  assert.equal('endpoint' in sent, false);
});

test('returns raw content for the existing strict JSON validator instead of executing or repairing it', async () => {
  const raw = 'not valid JSON; never execute this';
  const model = adapter(async () => jsonResponse(completion({ choices: [{
    finish_reason: 'stop', message: { content: raw },
  }] })));
  assert.equal(await model.complete(request()), raw);
});

test('maps HTTP failures without retries, raw provider bodies, or paid fallbacks', async () => {
  for (const [status, code] of [[400, 'CONTENT_UNAVAILABLE'], [401, 'FORBIDDEN'], [403, 'FORBIDDEN'],
    [429, 'CONTENT_UNAVAILABLE'], [408, 'PROVIDER_TIMEOUT'], [500, 'CONTENT_UNAVAILABLE'], [504, 'PROVIDER_TIMEOUT']]) {
    let calls = 0;
    const model = adapter(async () => { calls++; return jsonResponse({ error: `SECRET_${apiKey}` }, status); });
    await assert.rejects(model.complete(request()), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.message.includes('SECRET'), false);
      assert.equal(error.message.includes(apiKey), false);
      if (status === 429) assert.equal(error.retryable, false);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('rejects redirected and non-JSON HTTP responses', async () => {
  for (const response of [new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } }),
    new Response('SECRET_HTML_PAGE', { status: 200, headers: { 'content-type': 'text/html' } }),
    new Response('SECRET_MALFORMED_JSON', { status: 200, headers: { 'content-type': 'application/json' } })]) {
    const model = adapter(async () => response);
    await assert.rejects(model.complete(request()), (error) => {
      assert.equal(error.code, 'CONTENT_UNAVAILABLE');
      assert.equal(error.message.includes('SECRET'), false);
      return true;
    });
  }
});

test('rejects incomplete, refused, tool-calling, mismatched, or ambiguous model responses', async () => {
  const invalidBodies = [
    {}, completion({ choices: [] }),
    completion({ choices: [completion().choices[0], completion().choices[0]] }),
    completion({ model: 'another-model' }),
    completion({ choices: [{ finish_reason: 'length', message: { content: '{"partial":' } }] }),
    completion({ choices: [{ finish_reason: 'stop', message: { content: '' } }] }),
    completion({ choices: [{ finish_reason: 'stop', message: { content: 'x'.repeat(20001) } }] }),
    completion({ choices: [{ finish_reason: 'stop', message: { content: '{"ready":true}', refusal: 'blocked' } }] }),
    completion({ choices: [{ finish_reason: 'stop', message: { content: '{"ready":true}', tool_calls: [{ name: 'shell' }] } }] }),
  ];
  for (const body of invalidBodies) {
    const model = adapter(async () => jsonResponse(body));
    await assert.rejects(model.complete(request()), { code: 'CONTENT_UNAVAILABLE' });
  }
});

test('accepts an omitted response model field without silently changing the requested model', async () => {
  const body = completion(); delete body.model;
  const model = adapter(async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, DEFAULT_GEMINI_MODEL);
    return jsonResponse(body);
  });
  assert.equal(await model.complete(request()), '{"ready":true}');
});

test('bounds streamed response bytes instead of buffering an unbounded provider body', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(128001).fill(120)); },
    cancel() { cancelled = true; },
  });
  const model = adapter(async () => new Response(stream, { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(model.complete(request()), { code: 'CONTENT_UNAVAILABLE' });
  assert.equal(cancelled, true);
});

test('sanitizes network failures without leaking credentials or exception text', async () => {
  const model = adapter(async () => { throw Error(`SECRET_NETWORK_${apiKey}`); });
  await assert.rejects(model.complete(request()), (error) => {
    assert.equal(error.code, 'CONTENT_UNAVAILABLE');
    assert.equal(error.message.includes('SECRET'), false);
    assert.equal(error.message.includes(apiKey), false);
    return true;
  });
});

test('pre-aborted requests stop before fetch and preserve helper-local cancellation semantics', async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort('SECRET_ABORT_REASON');
  const model = adapter(async () => { calls++; return jsonResponse(completion()); });
  await assert.rejects(model.complete(request({ signal: controller.signal })), (error) => {
    assert.equal(error.code, 'ABORTED');
    assert.equal(error.name, 'AbortError');
    assert.equal(error.message.includes('SECRET'), false);
    return true;
  });
  assert.equal(calls, 0);
});

test('forwards active cancellation without retries or leaking the abort reason', async () => {
  const controller = new AbortController();
  let calls = 0;
  const model = adapter(async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('SECRET_ABORT', 'AbortError')), { once: true });
      controller.abort('SECRET_ABORT_REASON');
    });
  });
  await assert.rejects(model.complete(request({ signal: controller.signal })), (error) => {
    assert.equal(error.code, 'ABORTED');
    assert.equal(error.name, 'AbortError');
    assert.equal(error.message.includes('SECRET'), false);
    return true;
  });
  assert.equal(calls, 1);
});
