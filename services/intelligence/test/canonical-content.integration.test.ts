import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Brief, Checkpoint, ResultOf, type Source } from '@vortex/contracts';
import * as F from '@vortex/fixtures';
import { createCanonicalContentDrafts } from '../src/canonical-content';

// Actual canonical Zod schemas with synthetic article/model/consent doubles.
// No API keys, external model calls, persistence, delivery, or browsing content.
const article = 'MOCK ARTICLE. Shade trees can reduce local temperatures.';
const quote = 'Shade trees can reduce local temperatures.';
const hashText = (text: string) => createHash('sha256').update(text).digest('hex');
const auth = { userId: F.users.sam.id, deviceId: F.devices.samDesktop.id };
const input = () => ({ workspace: F.workspaces.groupProject,
  resources: F.snapshot.resources.filter((resource) => F.workspaces.groupProject.resourceIds.includes(resource.id)),
  sources: [{ ...F.sources.heatArticle, extraction: 'extension' as const, apifyRunId: undefined,
    text: article, contentHash: hashText(article) }] as Source[],
  sourceIds: [F.sources.heatArticle.id], userNote: '  Compare costs next.\n' });
function setup(allowed = true) {
  const authorize = vi.fn(async () => allowed);
  const complete = vi.fn(async () => JSON.stringify({ quotes: [{ sourceId: F.sources.heatArticle.id, quote }],
    nextStep: 'Compare a second selected source.' }));
  return { authorize, complete, drafts: createCanonicalContentDrafts({ hashText, authorize,
    model: { providerId: 'MOCK_PROVIDER', modelId: 'MOCK_MODEL', complete } }) };
}

describe('content drafts against actual shared runtime schemas', () => {
  it('produces a canonical Checkpoint with exact note, citations and inferred next step', async () => {
    const h = setup(); const value = input();
    const result = ResultOf(Checkpoint).parse(await h.drafts.draftCheckpoint(value, auth));
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error.code);
    expect(result.data.userNote).toBe(value.userNote);
    expect(result.data.taskId).toBe(F.workspaces.groupProject.id);
    expect(result.data.summary).toContainEqual({ text: quote, sourceIds: value.sourceIds, basis: 'observed' });
    expect(result.data.proposedNextStep?.basis).toBe('inferred');
    expect(h.complete).toHaveBeenCalledOnce();
  });

  it('produces a canonical Brief without delivering it or adding uncited claims', async () => {
    const h = setup();
    const result = ResultOf(Brief).parse(await h.drafts.draftBrief({ ...input(), format: 'reading', audience: 'self' }, auth));
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error.code);
    expect(result.data.points).toEqual([{ text: quote, sourceIds: input().sourceIds, basis: 'observed' }]);
    expect(result.data.originalUrls).toEqual([F.sources.heatArticle.url]);
    expect('deliveryId' in result.data).toBe(false);
  });

  it('denies consent, stale hashes and another device before model disclosure', async () => {
    const h = setup(false);
    expect(await h.drafts.draftCheckpoint(input(), auth)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(h.complete).not.toHaveBeenCalled();
    const stale = setup(); const value = input(); value.sources[0]!.contentHash = 'b'.repeat(64);
    expect(await stale.drafts.draftCheckpoint(value, auth)).toMatchObject({ ok: false, error: { code: 'STALE_STATE' } });
    expect(await stale.drafts.draftCheckpoint(input(), { ...auth, deviceId: F.devices.samPhone.id })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(stale.complete).not.toHaveBeenCalled();
  });

  it('rejects invalid canonical records and keeps native identity out of model messages', async () => {
    const h = setup(); const value = input(); value.sources[0]!.contentHash = 'not-a-sha256';
    expect(await h.drafts.draftCheckpoint(value, auth)).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(h.complete).not.toHaveBeenCalled();
    await h.drafts.draftCheckpoint(input(), auth);
    const messages = JSON.stringify(h.complete.mock.calls);
    expect(messages).not.toContain(F.resources.notesWindow.title);
    expect(messages).not.toContain('nativeHandle');
  });
});
