import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkspaceRequest, dispatchWorkspaceRequest } from '../src/workspace-router.mjs';

const id = (number) => `${String(number).padStart(8, '0')}-1111-4111-8111-111111111111`;
const deviceId = id(1), workspaceId = id(2), tabId = id(3), windowId = id(4), sourceId = id(5);
const workspace = { id: workspaceId, name: 'Group Project', deviceId, resourceIds: [tabId, windowId] };
const base = {
  deviceId, commandId: id(6), workspaces: [workspace],
  resources: [{ id: tabId, deviceId, kind: 'tab' }, { id: windowId, deviceId, kind: 'window' }],
  selectedResourceIds: [tabId, windowId], goal: 'Research sources for the team',
  primaryTabId: tabId, primaryWindowId: windowId, sourceIds: [sourceId], recipient: { deviceId: id(7) },
};
const resolve = (text, changes = {}) => resolveWorkspaceRequest({ ...base, text, ...changes });
const examples = [
  ['find project research', 'find'], ['create workspace "New Workspace"', 'create_workspace'],
  ['focus Group Project', 'focus_workspace'],
  ['save checkpoint "Group Project"', 'save_checkpoint'],
  ['send brief "Group Project"', 'send_brief'], ['resume Group Project', 'resume_workspace'],
];

test('resolves the six documented commands and rejects unsupported requests', () => {
  for (const [text, kind] of examples) assert.equal(resolve(text).command.kind, kind);
  for (const text of ['close all windows', 'powershell Remove-Item', 'click the screen', 'resume Group Project and make a payment']) {
    assert.equal(resolve(text).kind, 'error');
  }
});

test('normalizes English whitespace and case while matching full workspace names', () => {
  const workspaces = [{ ...workspace, name: 'Project Notes' }];
  assert.equal(resolve('CONTINUE project   notes', { workspaces }).command.workspaceId, workspaceId);
  assert.equal(resolve('resume Project', { workspaces }).code, 'NOT_FOUND');
});

test('clarifies duplicate workspace names and resolves an explicit ID selection', () => {
  const workspaces = [workspace, { ...workspace, id: id(8) }];
  const ambiguous = resolve('resume Group Project', { workspaces });
  assert.equal(ambiguous.kind, 'ambiguous');
  assert.equal(ambiguous.candidates.length, 2);
  assert.equal(resolve('resume Group Project', { workspaces, workspaceId: id(8) }).command.workspaceId, id(8));
});

test('does not select a workspace from another device by name', () => {
  assert.equal(resolve('resume Group Project', { workspaces: [{ ...workspace, deviceId: id(9) }] }).code, 'NOT_FOUND');
});

test('includes only explicitly selected members without mutating the input', () => {
  const result = resolve('create workspace "New Workspace"');
  assert.deepEqual(result.command.selectedResourceIds, base.selectedResourceIds);
  assert.notEqual(result.command.selectedResourceIds, base.selectedResourceIds);
  assert.equal('resourceIds' in result.command, false);
  assert.equal(result.command.primaryWindowId, windowId);
});

test('rejects primary targets of the wrong kind, nonmembers, and resources from another device', () => {
  const command = 'create workspace "New Workspace"';
  assert.equal(resolve(command, { primaryWindowId: tabId }).code, 'VALIDATION_ERROR');
  assert.equal(resolve(command, { primaryTabId: id(9) }).code, 'VALIDATION_ERROR');
  assert.equal(resolve(command, { resources: [{ id: tabId, kind: 'tab', deviceId: id(9) }, base.resources[1]] }).code, 'FORBIDDEN');
});

test('requires an explicit goal and selection without adding suggested members', () => {
  const command = 'create workspace "New Workspace"';
  assert.equal(resolve(command, { goal: undefined }).code, 'VALIDATION_ERROR');
  assert.equal(resolve(command, { selectedResourceIds: [] }).code, 'VALIDATION_ERROR');
  assert.equal(resolve(command, { selectedResourceIds: [tabId, tabId] }).code, 'VALIDATION_ERROR');
});

test('preserves the exact user note without inventing native document contents', () => {
  const userNote = '  I have not read the document yet.\nCompare it later  ';
  const result = resolve('save checkpoint "Group Project"', { userNote, sourceIds: [] });
  assert.equal(result.command.userNote, userNote);
  assert.equal(result.command.workspaceId, workspaceId);
  assert.equal('summary' in result.command, false);
});

test('requires one explicit recipient and at most five sources for brief delivery', () => {
  const command = 'send brief "Group Project"';
  assert.equal(resolve(command, { recipient: undefined }).code, 'VALIDATION_ERROR');
  assert.equal(resolve(command, { recipient: { deviceId, userId: id(9) } }).code, 'VALIDATION_ERROR');
  assert.equal(resolve(command, { sourceIds: [] }).code, 'CONTENT_UNAVAILABLE');
  assert.equal(resolve(command, { sourceIds: [1, 2, 3, 4, 5, 6].map(id) }).code, 'VALIDATION_ERROR');
});

test('rejects long notes, invalid IDs, and duplicate workspace IDs', () => {
  assert.equal(resolveWorkspaceRequest(null).code, 'VALIDATION_ERROR');
  assert.equal(resolve('x'.repeat(2001)).code, 'VALIDATION_ERROR');
  assert.equal(resolve('find notes', { deviceId: 'not-a-uuid' }).code, 'VALIDATION_ERROR');
  assert.equal(resolve('find notes', { workspaces: [workspace, workspace] }).code, 'VALIDATION_ERROR');
  assert.equal(resolve('save checkpoint "Group Project"', { userNote: 'x'.repeat(2001) }).code, 'VALIDATION_ERROR');
});

// Only orchestration test doubles: not production schemas/services or auth proof.
const context = (overrides = {}) => ({
  auth: { userId: id(10), deviceId }, workspaces: base.workspaces, resources: base.resources,
  contracts: { workspaceCommand: { parse: (value) => value }, clarification: { parse: (value) => value } },
  services: {}, validateServiceResult: (_kind, result) => result, ...overrides,
});

test('requires authentication, canonical validators, and output validation before service dispatch', async () => {
  const input = { ...base, text: 'continue Group Project' };
  assert.equal((await dispatchWorkspaceRequest(input)).error.code, 'UNAUTHORIZED');
  assert.equal((await dispatchWorkspaceRequest({ ...input, deviceId: id(9) }, context())).error.code, 'FORBIDDEN');
  assert.equal((await dispatchWorkspaceRequest(input, context({ contracts: {} }))).error.code, 'INTERNAL_ERROR');
  assert.equal((await dispatchWorkspaceRequest(input, context({ validateServiceResult: undefined }))).error.code, 'INTERNAL_ERROR');
});

test('dispatches each command to one shared service without exposing an executor', async () => {
  const serviceNames = ['searchSources', 'createWorkspace', 'planWorkspaceFocus', 'createCheckpoint', 'sendBrief', 'planWorkspaceResume'];
  for (let index = 0; index < examples.length; index++) {
    const calls = [];
    const services = Object.fromEntries(serviceNames.map((name) => [name, async (command, ctx) => {
      calls.push({ name, command, ctx }); return { operationId: id(20) };
    }]));
    const result = await dispatchWorkspaceRequest({ ...base, text: examples[index][0] }, context({ services }));
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, serviceNames[index]);
    assert.equal(calls[0].ctx.auth.userId, id(10));
  }
});

test('ignores request-supplied workspace records', async () => {
  const input = { ...base, text: 'continue Group Project' };
  const result = await dispatchWorkspaceRequest(input, context({ workspaces: [] }));
  assert.equal(result.error.code, 'NOT_FOUND');
});

test('returns Clarification for duplicate names without calling a service', async () => {
  const ctx = context({ workspaces: [workspace, { ...workspace, id: id(8) }] });
  const result = await dispatchWorkspaceRequest({ ...base, text: 'continue Group Project' }, ctx);
  assert.equal(result.data.kind, 'clarification');
  assert.equal(result.data.options.length, 2);
  assert.notEqual(result.data.options[0].label, result.data.options[1].label);
});

test('does not claim success when canonical command or service output validation fails', async () => {
  const input = { ...base, text: 'continue Group Project' };
  const ctx = context();
  ctx.contracts.workspaceCommand.parse = () => { throw Error('bad'); };
  assert.equal((await dispatchWorkspaceRequest(input, ctx)).error.code, 'VALIDATION_ERROR');
  const result = await dispatchWorkspaceRequest(input, context({
    services: { planWorkspaceResume: async () => ({}) },
    validateServiceResult: () => { throw Error('invalid output'); },
  }));
  assert.equal(result.error.code, 'INTERNAL_ERROR');
});

test('returns typed timeout failures without exposing provider errors or secrets', async () => {
  const input = { ...base, text: 'continue Group Project' };
  const result = await dispatchWorkspaceRequest(input, context({ services: {
    planWorkspaceResume: async () => { throw Object.assign(Error('SECRET provider payload'), { code: 'PROVIDER_TIMEOUT' }); },
  } }));
  assert.equal(result.error.code, 'PROVIDER_TIMEOUT');
  assert.equal(result.error.retryable, true);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
});
