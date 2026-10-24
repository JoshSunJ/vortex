// MOCK integration demonstration. No server listener, credentials or provider calls.
import { createHash, randomUUID } from 'node:crypto';
import { PlanOrClarification, ResultOf } from '@vortex/contracts';
import * as F from '@vortex/fixtures';
import { createApp } from '../api/src/app.ts';
import { createSigner } from '../api/src/auth.ts';
import { createFixtureServices } from '../api/src/fixtureServices.ts';
import { withApiPlanner } from './src/api-planner.ts';
import { createCanonicalContentDrafts } from './src/canonical-content.ts';

const shared = createFixtureServices();
const signer = await createSigner('MOCK-offline-demo-secret-not-for-production-12345');
const auth = { userId: F.users.sam.id, deviceId: F.devices.samDesktop.id, deviceKind: 'desktop' };
const token = await signer.sign(auth);
const app = createApp({ signer, services: withApiPlanner(shared) });
const text = 'resume Group Project';
const response = await app.request('/v1/plans', { method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ commandId: randomUUID(), text, deviceId: auth.deviceId,
    snapshotRevision: F.snapshot.revision, selectedResourceIds: [] }),
});
const result = ResultOf(PlanOrClarification).parse(await response.json());
if (!result.ok || result.data.kind !== 'plan') throw Error('MOCK API planning did not return a canonical plan.');
console.log('MOCK integration: actual API authentication + B intent routing + shared fixture planner');
console.log(`Input: ${text}`);
console.log(`HTTP ${response.status}; services label: ${response.headers.get('X-Vortex-Services')}`);
console.log(`Canonical preview: ${result.data.actions.length} actions; plan hash preserved.`);

const article = 'MOCK ARTICLE. Shade trees can reduce local temperatures.';
const quote = 'Shade trees can reduce local temperatures.';
const hashText = (value) => createHash('sha256').update(value).digest('hex');
const drafts = createCanonicalContentDrafts({ hashText,
  authorize: async () => true, // MOCK consent: never copy this policy into production.
  model: { providerId: 'MOCK_PROVIDER', modelId: 'MOCK_MODEL', complete: async () => JSON.stringify({
    quotes: [{ sourceId: F.sources.heatArticle.id, quote }], nextStep: 'Compare costs from a second selected source.',
  }) },
});
const workspace = F.workspaces.groupProject;
const checkpoint = await drafts.draftCheckpoint({ workspace,
  resources: F.snapshot.resources.filter((resource) => workspace.resourceIds.includes(resource.id)),
  sources: [{ ...F.sources.heatArticle, extraction: 'extension', apifyRunId: undefined,
    text: article, contentHash: hashText(article) }],
  sourceIds: [F.sources.heatArticle.id], userNote: 'Compare costs next.',
}, auth);
if (!checkpoint.ok) throw Error(`MOCK checkpoint failed: ${checkpoint.error.code}`);
console.log('Canonical checkpoint: exact selected quote, preserved user note, labeled inferred next step.');
console.log('No provider request, OS action, approval, persistence or phone delivery ran.');
