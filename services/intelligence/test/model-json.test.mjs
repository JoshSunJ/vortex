import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { generateValidatedJson } from '../src/model-json.mjs';

function validate(value) {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(typeof value.point, 'string');
  assert.deepEqual(Object.keys(value), ['point']);
  return value;
}
const options = (changes = {}) => ({
  system: 'Return JSON with one string field named point.',
  payload: { selectedText: 'An explicitly permitted source.' },
  validate,
  complete: async () => '{"point":"A supported point."}',
  ...changes,
});

test('preserves a sanitized access-denied error without repair or retry', async () => {
  let calls = 0;
  await assert.rejects(generateValidatedJson(options({ complete: async () => {
    calls++;
    throw Object.assign(new Error('SECRET_ACCESS_DETAILS'), { code: 'FORBIDDEN' });
  } })), (error) => error.code === 'FORBIDDEN' && !error.message.includes('SECRET'));
  assert.equal(calls, 1);
});

test('returns validated JSON with system instructions and serialized source data', async () => {
  let calls = 0;
  const result = await generateValidatedJson(options({ complete: async ({ messages, signal }) => {
    calls++;
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
    assert.deepEqual(JSON.parse(messages[1].content), { selectedText: 'An explicitly permitted source.' });
    assert.equal(signal.aborted, false);
    return '{"point":"A supported point."}';
  } }));
  assert.deepEqual(result, { point: 'A supported point.' });
  assert.equal(calls, 1);
});

test('repairs invalid JSON once without echoing raw model content', async () => {
  const requests = [];
  const result = await generateValidatedJson(options({ complete: async (request) => {
    requests.push(request);
    return requests.length === 1 ? 'SECRET invalid model response' : '{"point":"Repaired."}';
  } }));
  assert.equal(result.point, 'Repaired.');
  assert.equal(requests.length, 2);
  assert.equal(JSON.stringify(requests[1].messages).includes('SECRET'), false);
  assert.match(requests[1].messages[0].content, /previous response did not pass validation/);
});

test('repairs schema-invalid JSON and supports asynchronous trusted validation', async () => {
  let calls = 0;
  const result = await generateValidatedJson(options({
    complete: async () => ++calls === 1 ? '{"point":3}' : '{"point":"Valid."}',
    validate: async (value) => validate(value),
  }));
  assert.equal(result.point, 'Valid.');
  assert.equal(calls, 2);
});

test('strict JSON parsing rejects markdown and never extracts embedded JSON', async () => {
  let calls = 0;
  await assert.rejects(generateValidatedJson(options({ complete: async () => {
    calls++;
    return '```json\n{"point":"Do not accept this wrapper."}\n```';
  } })), { code: 'VALIDATION_ERROR' });
  assert.equal(calls, 2);
});

test('rejects invalid and oversized model output within the two-call budget', async () => {
  for (const output of [null, { point: 'not text' }, '{"point":"' + 'x'.repeat(20_000) + '"}']) {
    let calls = 0;
    await assert.rejects(generateValidatedJson(options({ complete: async () => { calls++; return output; } })),
      { code: 'VALIDATION_ERROR' });
    assert.equal(calls, 2);
  }
});

test('validates configuration and serializable bounded payloads before a model call', async () => {
  let calls = 0;
  const complete = async () => { calls++; return '{}'; };
  const circular = {};
  circular.self = circular;
  for (const changes of [
    { system: '' }, { system: 'x'.repeat(20_001) }, { validate: undefined },
    { timeoutMs: 0 }, { timeoutMs: 20_001 }, { timeoutMs: 1.5 },
    { payload: undefined }, { payload: circular }, { payload: 1n },
    { payload: { selectedText: 'x'.repeat(260_001) } }, { signal: {} },
  ]) {
    await assert.rejects(generateValidatedJson(options({ complete, ...changes })), { code: 'VALIDATION_ERROR' });
  }
  await assert.rejects(generateValidatedJson(null), { code: 'VALIDATION_ERROR' });
  assert.equal(calls, 0);
});

test('retries one typed transient timeout and succeeds without repair instructions', async () => {
  let calls = 0;
  const result = await generateValidatedJson(options({ complete: async ({ messages }) => {
    calls++;
    if (calls === 1) throw Object.assign(Error('SECRET provider detail'), { code: 'PROVIDER_TIMEOUT' });
    assert.equal(messages[0].content.includes('previous response'), false);
    return '{"point":"Recovered."}';
  } }));
  assert.equal(result.point, 'Recovered.');
  assert.equal(calls, 2);
});

test('timeout and repair share one retry budget', async () => {
  let calls = 0;
  await assert.rejects(generateValidatedJson(options({ complete: async () => {
    calls++;
    if (calls === 1) throw Object.assign(Error('transient'), { code: 'PROVIDER_TIMEOUT' });
    return 'invalid';
  } })), { code: 'VALIDATION_ERROR' });
  assert.equal(calls, 2);
});

test('deadline works when the transport ignores abort and aborts both attempts', async () => {
  const signals = [];
  await assert.rejects(generateValidatedJson(options({ timeoutMs: 10, complete: ({ signal }) => {
    signals.push(signal);
    return new Promise(() => {});
  } })), { code: 'PROVIDER_TIMEOUT' });
  assert.equal(signals.length, 2);
  assert.equal(signals.every((signal) => signal.aborted), true);
});

test('pre-aborted signals do not call the provider or expose the abort reason', async () => {
  const controller = new AbortController();
  controller.abort(Error('SECRET abort reason'));
  let calls = 0;
  await assert.rejects(generateValidatedJson(options({ signal: controller.signal, complete: async () => {
    calls++; return '{}';
  } })), (error) => {
    assert.equal(error.code, 'ABORTED');
    assert.equal(error.name, 'AbortError');
    assert.equal(error.message.includes('SECRET'), false);
    return true;
  });
  assert.equal(calls, 0);
});

test('external cancellation stops a pending transport without retry and removes listeners', async () => {
  const controller = new AbortController();
  let calls = 0;
  let innerSignal;
  const result = generateValidatedJson(options({ signal: controller.signal, complete: ({ signal }) => {
    calls++;
    innerSignal = signal;
    queueMicrotask(() => controller.abort('SECRET reason'));
    return new Promise(() => {});
  } }));
  await assert.rejects(result, { code: 'ABORTED', name: 'AbortError' });
  assert.equal(calls, 1);
  assert.equal(innerSignal.aborted, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('removes abort listeners after successful completion', async () => {
  const controller = new AbortController();
  await generateValidatedJson(options({ signal: controller.signal }));
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('sanitizes provider failures without retrying unknown errors', async () => {
  let calls = 0;
  await assert.rejects(generateValidatedJson(options({ complete: async () => {
    calls++;
    throw Error('SECRET API key and provider payload');
  } })), (error) => {
    assert.equal(error.code, 'CONTENT_UNAVAILABLE');
    assert.equal(error.message.includes('SECRET'), false);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(calls, 1);
});
