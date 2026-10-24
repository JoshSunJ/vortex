import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Plan } from '@vortex/contracts';
import { BrowserBridge } from '../../../apps/desktop/src/browser.ts';
import { ControlEngine, hashPlan } from '../../../apps/desktop/src/control.ts';
import { Journal } from '../../../apps/desktop/src/journal.ts';
import { LocalWorkspaces } from '../../../apps/desktop/src/workspaces.ts';
import { createControlServer } from '../../../apps/desktop/src/server.ts';

// Real local HTTP auth, SQLite journal, workspace service, B resolver and A
// planner. Only platform adapters are mocked; no STT/TTS/provider calls or OS effects.
const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function setup(title = 'MOCK Project notes') {
  const journal = new Journal(':memory:'); cleanup.push(() => journal.close());
  const focus = vi.fn(async () => {});
  const windows = { list: async () => [{ handle: '42', processId: 100,
    processStartedAt: '2026-10-24T18:00:00.000Z', title, appName: 'MOCK Editor', active: true }], focus };
  const engine = new ControlEngine(journal, new BrowserBridge(), windows);
  const store = new LocalWorkspaces(engine);
  const snapshot = await engine.getSnapshot();
  const native = snapshot.resources[0];
  const create = (name) => store.create({ name, goal: 'Compare selected sources',
    selectedResourceIds: [native.id], primaryWindowId: native.id, expectedSnapshotRevision: snapshot.revision });
  const token = 'MOCK-local-control-token-not-a-real-credential-12345';
  const server = createControlServer(engine, { token });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, input, authenticated = true) => {
    const response = await fetch(`${base}${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(input) });
    return { response, result: await response.json() };
  };
  const preview = (text) => post('/control/commands/preview', { text });
  return { engine, journal, store, focus, native, create, post, preview };
}

describe('default desktop command endpoint uses shared B workspace resolution', () => {
  it('resolves transcript-style requests to exact stored previews without executing', async () => {
    const h = await setup(); const workspace = await h.create('Research'); await h.create('Research papers');
    for (const text of ['Please resume workspace "Research".', "resume 'Research'", 'switch to Research', 'continue research']) {
      const { result } = await h.preview(text);
      expect(result.ok).toBe(true);
      const plan = Plan.parse(result.data.plan);
      expect(plan.workspaceId).toBe(workspace.id);
      expect(plan.finalFocusResourceId).toBe(h.native.id);
      expect(plan.approvalRequired).toBe(true);
      expect(plan.planHash).toBe(hashPlan(plan));
      expect(h.journal.get(`plan:${plan.id}`)).toEqual(plan);
    }
    expect(h.focus).not.toHaveBeenCalled();
    expect(h.store.operations().operations).toEqual([]);
  });

  it('requires a choice for duplicate or partial workspace names', async () => {
    const h = await setup(); const first = await h.create('Research'); const second = await h.create('Research');
    const duplicate = (await h.preview('resume Research')).result;
    expect(duplicate.data).toMatchObject({ kind: 'clarification', intent: 'resume' });
    expect(duplicate.data.choices.map((choice) => choice.id).sort()).toEqual([first.id, second.id].sort());
    expect((await h.preview('focus rese')).result.data.kind).toBe('clarification');
    expect(h.focus).not.toHaveBeenCalled();
  });

  it('preserves direct native-title focus for titles longer than workspace names', async () => {
    const title = `MOCK ${'long document title '.repeat(8)}`.trim();
    const h = await setup(title);
    const result = (await h.preview(`focus ${title}`)).result;
    expect(result).toMatchObject({ ok: true, data: { kind: 'plan', plan: { finalFocusResourceId: h.native.id } } });
    expect(h.focus).not.toHaveBeenCalled();
  });

  it('rejects missing auth and injected records before creating any plan', async () => {
    const h = await setup(); await h.create('Research');
    const missing = await h.post('/control/commands/preview', { text: 'resume Research' }, false);
    expect(missing.response.status).toBe(401);
    const injected = await h.post('/control/commands/preview', { text: 'resume Research',
      deviceId: randomUUID(), workspaces: [], approved: true });
    expect(injected.result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(h.journal.list('plan:')).toEqual([]);
    expect(h.focus).not.toHaveBeenCalled();
  });

  it('keeps execution behind the existing exact-hash approval flow', async () => {
    const h = await setup(); await h.create('Research');
    const plan = Plan.parse((await h.preview('resume Research')).result.data.plan);
    expect(h.focus).not.toHaveBeenCalled();
    const approval = (await h.post(`/control/plans/${plan.id}/approve`, { planHash: plan.planHash, confirmed: true })).result;
    expect(approval.ok).toBe(true); expect(h.focus).not.toHaveBeenCalled();
    const executed = (await h.post(`/control/plans/${plan.id}/execute`, {
      operationId: randomUUID(), expectedRevision: plan.snapshotRevision, approvalId: approval.data.approvalId,
    })).result;
    expect(executed).toMatchObject({ ok: true, data: { status: 'succeeded' } });
    expect(h.focus).toHaveBeenCalledOnce(); // MOCK adapter only, never an actual desktop focus.
  });

  it('keeps create/checkpoint forms and unavailable phone actions separate from focus', async () => {
    const h = await setup(); await h.create('Research');
    expect((await h.preview('create workspace Biology')).result.data).toEqual({ kind: 'create_workspace', name: 'Biology' });
    expect((await h.preview('save checkpoint for Research saying Compare costs next.')).result.data).toMatchObject({
      kind: 'checkpoint', userNote: 'Compare costs next.',
    });
    expect((await h.preview('send this to my phone')).result.data).toMatchObject({ kind: 'clarification' });
    expect(h.store.list().workspaces).toHaveLength(1);
    expect(h.store.list().workspaces[0].latestCheckpoint).toBeUndefined();
    expect(h.focus).not.toHaveBeenCalled();
  });
});
