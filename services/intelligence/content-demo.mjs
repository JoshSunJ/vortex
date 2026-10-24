import { createHash } from 'node:crypto';
import { createContentDrafts } from './src/content-drafts.mjs';

// MOCK ONLY: records, consent callback, validators, and model response are fixtures.
// Real provider calls, canonical schema validation, persistence, and delivery are absent.
const id = (number) => `${String(number).padStart(8, '0')}-1111-4111-8111-111111111111`;
const hashText = (text) => createHash('sha256').update(text).digest('hex');
const now = '2026-10-24T19:00:00.000Z';
const context = { userId: id(1), deviceId: id(2) };
const resources = [{
  id: id(3), deviceId: context.deviceId, sessionId: id(4), revision: 1,
  kind: 'tab', title: 'Mock Energy Article', url: 'https://example.com/mock-article',
  firstObservedAt: now, active: true, protectedByUser: false, capabilities: ['activate_tab'],
}];
const text = 'Batteries store energy for later use. Solar panels generate electricity from sunlight.';
const source = {
  id: id(5), resourceId: resources[0].id, title: resources[0].title,
  url: resources[0].url, retrievedAt: now, contentHash: hashText(text),
  extraction: 'extension', availability: 'ready', text,
};
const input = {
  workspace: { id: id(6), name: 'Group Project', goal: 'Compare energy storage options',
    deviceId: context.deviceId, resourceIds: resources.map((resource) => resource.id),
    primaryTabId: resources[0].id, revision: 1, createdAt: now, updatedAt: now },
  resources, sources: [source], sourceIds: [source.id],
  userNote: 'I still need a second source before making a comparison.',
};
const service = createContentDrafts({
  contracts: Object.fromEntries(['workspace', 'resource', 'source', 'checkpoint', 'brief']
    .map((name) => [name, { parse: (value) => structuredClone(value) }])),
  authorize: async () => true, hashText, clock: () => new Date(now),
  model: { providerId: 'MOCK_PROVIDER', modelId: 'MOCK_Gemini_Flash_Lite',
    complete: async () => JSON.stringify({ quotes: [
      { sourceId: source.id, quote: 'Batteries store energy for later use.' },
      { sourceId: source.id, quote: 'Solar panels generate electricity from sunlight.' },
    ], nextStep: 'Find a second source and compare its evidence.' }) },
});

console.log('=== MOCK CONTENT DRAFT DEMO ===');
console.log('Mock records, model, consent, and validators. No live provider, save, or delivery.');
for (const [label, result] of [
  ['Checkpoint draft', await service.draftCheckpoint(input, context)],
  ['Reading brief draft', await service.draftBrief({ ...input, format: 'reading', audience: 'self' }, context)],
]) {
  console.log(`\n${label}:`);
  if (!result.ok) {
    console.error(`${result.error.code}: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(result.data, null, 2));
  }
}
