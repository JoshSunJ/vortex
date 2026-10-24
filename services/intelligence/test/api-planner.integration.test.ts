import { describe, expect, it, vi } from 'vitest';
import { PlanOrClarification, ResultOf } from '@vortex/contracts';
import * as F from '@vortex/fixtures';
import { createApp } from '../../api/src/app';
import { createSigner } from '../../api/src/auth';
import { ApiError } from '../../api/src/envelope';
import { createFixtureServices } from '../../api/src/fixtureServices';
import { withApiPlanner } from '../src/api-planner';

// Real Hono routes, HMAC verification, Zod contracts and B resolver.
// Shared records/plans/effects are Andrew's labeled FIXTURE services.
async function harness() {
  const base = createFixtureServices();
  const focus = vi.spyOn(base, 'planWorkspaceFocus');
  const resume = vi.spyOn(base, 'planWorkspaceResume');
  const execute = vi.spyOn(base, 'executePlan');
  const checkpoint = vi.spyOn(base, 'createCheckpoint');
  const createWorkspace = vi.spyOn(base, 'createWorkspace');
  const services = withApiPlanner(base);
  const signer = await createSigner('MOCK-integration-secret-not-for-production-12345');
  const token = await signer.sign({ userId: F.users.sam.id, deviceId: F.devices.samDesktop.id, deviceKind: 'desktop' });
  const app = createApp({ services, signer });
  const request = { commandId: crypto.randomUUID(), text: 'resume Group Project',
    deviceId: F.devices.samDesktop.id, snapshotRevision: F.snapshot.revision, selectedResourceIds: [] as string[] };
  const post = (body = request, bearer: string | undefined = token) => app.request('/v1/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  return { base, services, focus, resume, execute, checkpoint, createWorkspace, signer, token, post, request, app };
}

describe('Owner B planning through the actual authenticated API (fixture data)', () => {
  it('preserves other service methods and their original receiver when enabled', async () => {
    const h = await harness(); const snapshot = vi.spyOn(h.base, 'getSnapshot');
    const response = await h.app.request(`/v1/snapshot?deviceId=${F.devices.samDesktop.id}`, {
      headers: { Authorization: `Bearer ${h.token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Vortex-Services')).toBe('fixture');
    expect(snapshot.mock.contexts[0]).toBe(h.base);
  });
  it('routes focus/resume/continue/switch through shared stored plans without executing effects', async () => {
    for (const text of ['focus Group Project', 'switch to Group Project', 'resume Group Project', 'continue Group Project',
      'Please resume workspace "Group Project".', 'focus \u201cGroup Project\u201d']) {
      const h = await harness();
      const response = await h.post({ ...h.request, text });
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Vortex-Services')).toBe('fixture');
      const result = ResultOf(PlanOrClarification).parse(await response.json());
      expect(result.ok).toBe(true);
      if (!result.ok || result.data.kind !== 'plan') throw Error('Expected a validated plan.');
      expect(result.data.workspaceId).toBe(F.workspaces.groupProject.id);
      expect(result.data.finalFocusResourceId).toBe(F.resources.notesWindow.id);
      const method = /resume|continue/.test(text) ? h.resume : h.focus;
      expect(method).toHaveBeenCalledOnce();
      const stored = await method.mock.results[0]!.value;
      expect(result.data).toEqual(stored); // Includes the untouched hash, ID and shared commandId.
      expect(h.execute).not.toHaveBeenCalled();
      expect(h.checkpoint).not.toHaveBeenCalled();
      expect(h.createWorkspace).not.toHaveBeenCalled();
    }
  });

  it('rejects missing/forged/phone credentials before invoking planning services', async () => {
    const h = await harness();
    const phone = await h.signer.sign({ userId: F.users.sam.id, deviceId: F.devices.samPhone.id, deviceKind: 'phone' });
    for (const [token, status] of [[undefined, 401], ['forged', 401], [phone, 403]] as const) {
      // Pass directly because post's default intentionally uses the desktop token.
      const response = await h.app.request('/v1/plans', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(h.request) });
      expect(response.status).toBe(status);
    }
    expect(h.focus).not.toHaveBeenCalled(); expect(h.resume).not.toHaveBeenCalled();
  });

  it('rejects another user, another device and stale inventory', async () => {
    const h = await harness();
    const other = await h.signer.sign({ userId: F.users.mallory.id, deviceId: F.devices.samDesktop.id, deviceKind: 'desktop' });
    expect((await h.post(h.request, other)).status).toBe(403);
    expect((await h.post({ ...h.request, deviceId: F.devices.samPhone.id })).status).toBe(403);
    const stale = await h.post({ ...h.request, snapshotRevision: F.snapshot.revision - 1 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ ok: false, error: { code: 'STALE_STATE' } });
    expect(h.resume).not.toHaveBeenCalled();
  });

  it('ignores injected inventory/owner and rejects unknown/duplicate selected resources', async () => {
    const h = await harness();
    const injected = { ...h.request, userId: F.users.mallory.id, workspaces: [], resources: [], auth: { scopes: ['*'] } };
    expect((await h.post(injected)).status).toBe(200);
    for (const selectedResourceIds of [[crypto.randomUUID()], [F.resources.heatArticle.id, F.resources.heatArticle.id]]) {
      expect((await h.post({ ...h.request, selectedResourceIds })).status).toBe(403);
    }
    expect(h.resume).toHaveBeenCalledTimes(1);
  });

  it('clarifies duplicate saved names instead of choosing an arbitrary workspace', async () => {
    const h = await harness();
    await h.base.createWorkspace({ userId: F.users.sam.id, deviceId: F.devices.samDesktop.id,
      deviceKind: 'desktop', scopes: ['metadata:read', 'desktop:control'] }, {
      name: 'Group Project', goal: 'MOCK second workspace', deviceId: F.devices.samDesktop.id,
      selectedResourceIds: [F.resources.projectDoc.id], expectedSnapshotRevision: F.snapshot.revision,
    });
    const result = ResultOf(PlanOrClarification).parse(await (await h.post()).json());
    if (!result.ok || result.data.kind !== 'clarification') throw Error('Expected clarification.');
    expect(result.data.options).toHaveLength(2);
    expect(result.data.commandId).toBe(h.request.commandId);
    expect(h.resume).not.toHaveBeenCalled();
  });

  it('does not turn create/save/send/unsupported text into a canned focus plan', async () => {
    const h = await harness();
    for (const text of ['create workspace "Research"', 'save checkpoint "Group Project"',
      'send brief "Group Project"', 'find heat', 'execute shell command', 'close all windows']) {
      const response = await h.post({ ...h.request, text });
      const result = ResultOf(PlanOrClarification).parse(await response.json());
      expect(result.ok).toBe(true);
      if (!result.ok) throw Error('Expected clarification.');
      expect(result.data.kind).toBe('clarification');
    }
    expect(h.focus).not.toHaveBeenCalled(); expect(h.resume).not.toHaveBeenCalled();
    expect(h.checkpoint).not.toHaveBeenCalled(); expect(h.execute).not.toHaveBeenCalled();
  });

  it('blocks plans bound to another device/workspace/revision or unrelated/deferred actions', async () => {
    for (const change of [{ deviceId: F.devices.samPhone.id }, { workspaceId: F.workspaces.budget.id },
      { snapshotRevision: 999 }, { actions: [{ actionId: crypto.randomUUID(), action: { kind: 'set_window_state',
        target: { resourceId: F.resources.notesWindow.id, expectedRevision: 1 }, state: 'minimized' } }], finalFocusResourceId: undefined },
      { actions: [{ actionId: crypto.randomUUID(), action: { kind: 'create_brief', sourceIds: [F.sources.heatArticle.id],
        format: 'reading', audience: 'self' } }], finalFocusResourceId: undefined }]) {
      const h = await harness(); const original = h.resume.getMockImplementation()!;
      h.resume.mockImplementation(async (...args) => {
        const result = await original(...args);
        if (result.kind !== 'plan') throw Error('Expected the underlying fixture plan.');
        return { ...result, ...change } as PlanOrClarification;
      });
      expect((await h.post()).status).toBe(500);
      expect(h.execute).not.toHaveBeenCalled();
    }
  });

  it('sanitizes typed and unexpected shared-service errors before API responses/logs', async () => {
    for (const error of [new ApiError('DEVICE_OFFLINE', 'PRIVATE_KEY_AND_TITLE'), Error('PRIVATE_KEY_AND_TITLE')]) {
      const h = await harness(); h.resume.mockRejectedValue(error);
      const response = await h.post(); const result = await response.json();
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('PRIVATE_KEY_AND_TITLE');
      expect(result.error.code).toBe(error instanceof ApiError ? 'DEVICE_OFFLINE' : 'INTERNAL_ERROR');
    }
  });

  it('keeps a shared plan usable by the existing approval path', async () => {
    const h = await harness();
    const result = ResultOf(PlanOrClarification).parse(await (await h.post()).json());
    if (!result.ok || result.data.kind !== 'plan') throw Error('Expected plan.');
    const response = await h.app.request(`/v1/plans/${result.data.id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.token}` },
      body: JSON.stringify({ planHash: result.data.planHash, confirmed: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { approvalId: expect.any(String) } });
    expect(h.execute).not.toHaveBeenCalled();
  });
});
