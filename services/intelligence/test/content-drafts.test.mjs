import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createContentDrafts } from '../src/content-drafts.mjs';
import { createGeminiModel, DEFAULT_GEMINI_MODEL } from '../src/gemini.mjs';

// MOCK records and schema/service doubles only. These tests do not establish
// live model access, canonical schema compatibility, consent, or persistence.
const id = (number) => `${String(number).padStart(8, '0')}-1111-4111-8111-111111111111`;
const hashText = (text) => createHash('sha256').update(text).digest('hex');
const stamp = '2026-10-24T19:00:00.000Z';
const article = 'Batteries store energy for later use. Solar panels generate electricity from sunlight.';
const quote = 'Batteries store energy for later use.';
const auth = { userId: id(1), deviceId: id(2) };
const resource = {
  id: id(3), deviceId: auth.deviceId, sessionId: id(4), revision: 1,
  kind: 'tab', title: 'Energy Research', url: 'https://example.com/energy',
  firstObservedAt: stamp, active: true, protectedByUser: false, capabilities: ['activate_tab'],
};
const native = { ...resource, id: id(5), kind: 'window', title: 'PRIVATE_NATIVE_NOTES',
  capabilities: ['focus_window'], nativeHandle: 'PRIVATE_HANDLE', processId: 12345 };
delete native.url;
const workspace = {
  id: id(6), deviceId: auth.deviceId, name: 'Group Project', goal: 'Compare energy storage options',
  revision: 1, resourceIds: [resource.id, native.id], primaryTabId: resource.id,
  primaryWindowId: native.id, updatedAt: stamp, createdAt: stamp,
};
const source = {
  id: id(7), resourceId: resource.id, title: resource.title, url: resource.url,
  retrievedAt: stamp, contentHash: hashText(article), extraction: 'extension',
  availability: 'ready', text: article,
};
const selection = { quotes: [{ sourceId: source.id, quote }], nextStep: 'Compare the selected evidence with a second source.' };
const base = () => ({ workspace: structuredClone(workspace), resources: structuredClone([resource, native]),
  sources: [structuredClone(source)], sourceIds: [source.id], userNote: 'I have not finished the comparison.' });
const contracts = () => Object.fromEntries(['workspace', 'resource', 'source', 'checkpoint', 'brief']
  .map((name) => [name, { parse: (value) => structuredClone(value) }]));
function setup(overrides = {}) {
  let calls = 0;
  let disclosure;
  let sent;
  const deps = {
    contracts: contracts(), hashText, clock: () => new Date(stamp),
    authorize: async (_context, value) => { disclosure = value; return true; },
    model: { providerId: 'MOCK_PROVIDER', modelId: 'MOCK_Gemini_Flash_Lite', complete: async (request) => {
      calls++; sent = request; return JSON.stringify(selection);
    } }, ...overrides,
  };
  return { service: createContentDrafts(deps), deps, get calls() { return calls; },
    get disclosure() { return disclosure; }, get sent() { return sent; } };
}
const briefInput = () => ({ ...base(), format: 'reading', audience: 'self' });

test('builds source-backed checkpoint quotes, preserves the note, and labels the next step inferred', async () => {
  const ctx = setup();
  const input = base();
  input.userNote = '  Still comparing sources.\nNothing is complete yet.  ';
  const result = await ctx.service.draftCheckpoint(input, auth);
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, '1.0');
  assert.equal(result.data.taskId, workspace.id);
  assert.equal(result.data.userNote, input.userNote);
  assert.equal(result.data.createdAt, stamp);
  assert.equal(result.data.summary.at(-1).text, quote);
  assert.equal(result.data.summary.at(-1).basis, 'observed');
  assert.equal(result.data.summary[0].basis, 'user_stated');
  assert.equal(result.data.proposedNextStep.basis, 'inferred');
  assert.equal('nativeHandle' in result.data.resourceSnapshots[1], false);
  assert.equal('operationId' in result.data, false);
  assert.equal(ctx.calls, 1);
});

test('brief keeps the original URLs and IDs from selected records, never model-supplied links', async () => {
  const ctx = setup();
  const result = await ctx.service.draftBrief(briefInput(), auth);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.originalUrls, [source.url]);
  assert.deepEqual(result.data.sourceIds, [source.id]);
  assert.equal(result.data.points[0].text, quote);
  assert.equal(result.data.excerpt, quote);
  assert.equal(result.data.audience, 'self');
});

test('mixed-source briefs take their default title from actual cited content', async () => {
  const ctx = setup();
  const input = briefInput();
  const unavailable = { ...source, id: id(11), title: 'Unavailable Article',
    url: 'https://example.com/unavailable', availability: 'unavailable' };
  delete unavailable.text;
  input.sources.unshift(unavailable);
  input.sourceIds.unshift(unavailable.id);
  const result = await ctx.service.draftBrief(input, auth);
  assert.equal(result.ok, true);
  assert.equal(result.data.title, source.title);
  assert.deepEqual(result.data.originalUrls, [unavailable.url, source.url]);
  assert.deepEqual(result.data.points[0].sourceIds, [source.id]);
});

test('binds cloud disclosure to provider, purpose, audience, and exact goal/note/source hashes', async () => {
  const ctx = setup();
  const input = briefInput();
  assert.equal((await ctx.service.draftBrief(input, auth)).ok, true);
  assert.equal(ctx.disclosure.providerId, 'MOCK_PROVIDER');
  assert.equal(ctx.disclosure.cloud, true);
  assert.equal(ctx.disclosure.purpose, 'create_brief');
  assert.equal(ctx.disclosure.goalHash, hashText(workspace.goal));
  assert.equal(ctx.disclosure.userNoteHash, hashText(input.userNote));
  assert.deepEqual(ctx.disclosure.sourceHashes, [{ id: source.id, contentHash: source.contentHash }]);
});

test('does not disclose native titles, handles, URLs, or inventory to the model', async () => {
  const ctx = setup();
  await ctx.service.draftCheckpoint(base(), auth);
  const payload = JSON.parse(ctx.sent.messages[1].content);
  assert.deepEqual(Object.keys(payload).sort(), ['goal', 'sources', 'userNote']);
  const serialized = JSON.stringify(ctx.sent);
  for (const forbidden of ['PRIVATE_NATIVE_NOTES', 'PRIVATE_HANDLE', 'processId', source.url, native.id]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('denied consent stops before any model call and missing auth returns UNAUTHORIZED', async () => {
  const ctx = setup({ authorize: async () => false });
  assert.equal((await ctx.service.draftCheckpoint(base(), auth)).error.code, 'FORBIDDEN');
  assert.equal((await ctx.service.draftCheckpoint(base(), {})).error.code, 'UNAUTHORIZED');
  assert.equal(ctx.calls, 0);
});

test('metadata-only checkpoint uses only explicit context and does not invent native progress', async () => {
  const ctx = setup({ model: undefined });
  const result = await ctx.service.draftCheckpoint({ ...base(), sources: [], sourceIds: [], metadataOnly: true }, auth);
  assert.equal(result.ok, true);
  assert.equal(result.data.summary.every((point) => point.basis === 'user_stated'), true);
  assert.equal('proposedNextStep' in result.data, false);
  assert.equal(ctx.disclosure.cloud, false);
});

test('unavailable or metadata-only sources never receive fabricated article summaries', async () => {
  const ctx = setup();
  const input = base();
  input.sources[0] = { ...source, availability: 'unavailable' };
  delete input.sources[0].text;
  const result = await ctx.service.draftCheckpoint(input, auth);
  assert.equal(result.ok, true);
  assert.match(result.data.summary.at(-1).text, /^Source content unavailable:/);
  assert.equal(ctx.calls, 0);
  assert.equal((await ctx.service.draftBrief({ ...input, format: 'reading', audience: 'self' }, auth)).error.code, 'CONTENT_UNAVAILABLE');
  input.sources[0] = { ...source, extraction: 'metadata' };
  assert.equal((await ctx.service.draftBrief({ ...input, format: 'reading', audience: 'self' }, auth)).error.code, 'CONTENT_UNAVAILABLE');
});

test('rejects changed source content before model invocation', async () => {
  const ctx = setup();
  const input = base();
  input.sources[0].text = 'Changed content';
  assert.equal((await ctx.service.draftCheckpoint(input, auth)).error.code, 'STALE_STATE');
  assert.equal(ctx.calls, 0);
});

test('rejects cross-device records, native-window evidence, and nonmember resources', async () => {
  const ctx = setup();
  const crossDevice = base(); crossDevice.workspace.deviceId = id(9);
  assert.equal((await ctx.service.draftCheckpoint(crossDevice, auth)).error.code, 'FORBIDDEN');
  const nativeSource = base(); nativeSource.sources[0].resourceId = native.id;
  assert.equal((await ctx.service.draftCheckpoint(nativeSource, auth)).error.code, 'FORBIDDEN');
  const nonmember = base(); nonmember.resources[0].id = id(9);
  assert.equal((await ctx.service.draftCheckpoint(nonmember, auth)).error.code, 'FORBIDDEN');
  assert.equal(ctx.calls, 0);
});

test('rejects invalid source membership, duplicates, oversized text, and unsafe URLs', async () => {
  const ctx = setup();
  const mismatch = base(); mismatch.sourceIds = [id(9)];
  assert.equal((await ctx.service.draftCheckpoint(mismatch, auth)).error.code, 'NOT_FOUND');
  const duplicate = base(); duplicate.sourceIds = [source.id, source.id];
  assert.equal((await ctx.service.draftCheckpoint(duplicate, auth)).error.code, 'VALIDATION_ERROR');
  const large = base(); large.sources[0].text = 'x'.repeat(50001);
  assert.equal((await ctx.service.draftCheckpoint(large, auth)).error.code, 'VALIDATION_ERROR');
  for (const url of ['file:///private', 'https://user:password@example.com/article']) {
    const unsafe = base(); unsafe.sources[0].url = url;
    assert.equal((await ctx.service.draftCheckpoint(unsafe, auth)).error.code, 'VALIDATION_ERROR');
  }
  assert.equal(ctx.calls, 0);
});

test('repairs unsupported quotes once, then returns only verified verbatim evidence', async () => {
  let calls = 0;
  const ctx = setup({ model: { providerId: 'MOCK', modelId: 'MOCK_Gemini', complete: async () => {
    calls++;
    return JSON.stringify(calls === 1 ? { quotes: [{ sourceId: source.id, quote: 'An invented fact.' }] } : selection);
  } } });
  const result = await ctx.service.draftBrief(briefInput(), auth);
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.data.points[0].text, quote);
});

test('rejects unknown citations and executable model fields after one repair', async () => {
  for (const invalid of [{ quotes: [{ sourceId: id(9), quote }] }, { ...selection, shell: 'arbitrary script' }]) {
    let calls = 0;
    const ctx = setup({ model: { providerId: 'MOCK', modelId: 'MOCK_Gemini', complete: async () => {
      calls++; return JSON.stringify(invalid);
    } } });
    const result = await ctx.service.draftBrief(briefInput(), auth);
    assert.equal(result.error.code, 'VALIDATION_ERROR');
    assert.equal(calls, 2);
    assert.equal('data' in result, false);
  }
});

test('requires canonical validators and rejects invalid final wire drafts', async () => {
  const missing = setup({ contracts: {} });
  assert.equal((await missing.service.draftCheckpoint(base(), auth)).error.code, 'INTERNAL_ERROR');
  const ctx = setup();
  ctx.deps.contracts.checkpoint.parse = () => { throw Error('PRIVATE_SCHEMA_ERROR'); };
  const result = await ctx.service.draftCheckpoint(base(), auth);
  assert.equal(result.error.code, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(result).includes('PRIVATE_SCHEMA_ERROR'), false);
});

test('propagates cancellation to the operation worker without reporting draft success', async () => {
  const controller = new AbortController(); controller.abort();
  const ctx = setup();
  await assert.rejects(ctx.service.draftCheckpoint({ ...base(), metadataOnly: true }, { ...auth, signal: controller.signal }), { code: 'ABORTED' });
  assert.equal(ctx.calls, 0);
  const live = new AbortController();
  const active = setup({ model: { providerId: 'MOCK', modelId: 'MOCK_Gemini', complete: async () => {
    live.abort(); return JSON.stringify(selection);
  } } });
  await assert.rejects(active.service.draftBrief(briefInput(), { ...auth, signal: live.signal }), { code: 'ABORTED' });
});

test('isolates input from caller mutations during asynchronous authorization', async () => {
  const input = base();
  const ctx = setup({ authorize: async () => { input.userNote = 'Changed after consent'; input.sources[0].text = 'changed'; return true; } });
  const result = await ctx.service.draftCheckpoint(input, auth);
  assert.equal(result.ok, true);
  assert.equal(result.data.userNote, 'I have not finished the comparison.');
  assert.equal(result.data.summary.at(-1).text, quote);
});

test('Gemini transport integrates with the grounded draft builder through a mocked HTTP response', async () => {
  const model = createGeminiModel({ apiKey: 'MOCK_KEY', fetchImpl: async () => new Response(JSON.stringify({
    model: DEFAULT_GEMINI_MODEL,
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(selection) } }],
  }), { headers: { 'content-type': 'application/json' } }) });
  const ctx = setup({ model });
  const result = await ctx.service.draftBrief(briefInput(), auth);
  assert.equal(result.ok, true);
  assert.equal(result.data.points[0].text, quote);
  assert.equal(ctx.disclosure.providerId, 'google-gemini');
  assert.equal(ctx.disclosure.modelId, DEFAULT_GEMINI_MODEL);
});
