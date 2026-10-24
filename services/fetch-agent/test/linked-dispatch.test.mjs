import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkedAgentDispatcher, formatAgentReply } from '../src/linked-dispatch.mjs';

// MOCK dependencies only: no actual auth, canonical schemas, ACP, or providers.
const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const epoch = Date.parse('2026-10-24T19:00:00.000Z');
const commandNames = ['find', 'create_workspace', 'focus_workspace', 'save_checkpoint', 'send_brief', 'resume_workspace'];
const serviceNames = ['searchSources', 'createWorkspace', 'planWorkspaceFocus', 'createCheckpoint', 'sendBrief', 'planWorkspaceResume'];
const examples = ['find battery research', 'create workspace "Research"', 'focus Group Project',
  'save checkpoint "Group Project"', 'send brief "Group Project"', 'resume Group Project'];

function fixture() {
  const state = { time: epoch, calls: [], loaded: 0, authorized: 0 };
  const message = { sender: 'MOCK-verified-agent-address', sessionId: id(1), messageId: id(2),
    sentAt: new Date(epoch).toISOString(), text: examples[0] };
  const link = { sender: message.sender, sessionId: message.sessionId, userId: id(3), deviceId: id(4),
    expiresAt: new Date(epoch + 600_000).toISOString(), revoked: false,
    scopes: ['metadata:read', 'content:read', 'desktop:control', 'brief:deliver'], allowedCommands: [...commandNames] };
  const context = {
    workspaces: [{ id: id(5), deviceId: id(4), name: 'Group Project', resourceIds: [id(6)] }],
    resources: [{ id: id(6), deviceId: id(4), kind: 'tab' }],
    selection: { goal: 'Compare research', selectedResourceIds: [id(6)], primaryTabId: id(6),
      sourceIds: [id(7)], recipient: { deviceId: id(8) }, userNote: '  Compare costs next.\n' },
  };
  const deps = {
    clock: () => new Date(state.time),
    verifyIngress: async () => message,
    resolveLink: async (binding) => { assert.deepEqual(binding, { sender: message.sender, sessionId: message.sessionId }); return link; },
    loadContext: async (ctx) => { state.loaded++; state.loadContext = ctx; return context; },
    authorizeCommand: async (ctx) => { state.authorized++; state.authorization = ctx; return true; },
    contracts: { workspaceCommand: { parse: (value) => value }, clarification: { parse: (value) => value } },
    services: Object.fromEntries(serviceNames.map((name) => [name, async (command, ctx) => {
      state.calls.push({ name, command, ctx }); return { id: id(9), status: 'queued' };
    }])),
    validateServiceResult: (_kind, result) => result,
  };
  return { state, message, link, context, deps, run: (raw = {}) => createLinkedAgentDispatcher(deps)(raw, { MOCK: true }) };
}

test('routes all six commands through the existing shared dispatcher', async () => {
  for (let i = 0; i < examples.length; i++) {
    const f = fixture(); f.message.text = examples[i];
    const result = await f.run();
    assert.equal(result.ok, true);
    assert.equal(result.schemaVersion, '1.0');
    assert.equal(f.state.calls.length, 1);
    assert.equal(f.state.calls[0].name, serviceNames[i]);
    assert.equal(f.state.calls[0].command.kind, commandNames[i]);
    assert.equal(f.state.calls[0].ctx.auth.userId, f.link.userId);
    assert.equal(f.state.calls[0].ctx.remote.sessionId, f.message.sessionId);
    assert.equal(f.state.authorized, 1);
  }
});

test('requires every trusted dependency and canonical validator before verification', async () => {
  for (const dependencies of [null, [], false]) {
    const result = await createLinkedAgentDispatcher(dependencies)({});
    assert.equal(result.error.code, 'INTERNAL_ERROR');
  }
  for (const field of ['verifyIngress', 'resolveLink', 'loadContext', 'authorizeCommand', 'validateServiceResult', 'contracts', 'services']) {
    const f = fixture(); delete f.deps[field];
    const result = await f.run();
    assert.equal(result.error.code, 'INTERNAL_ERROR');
    assert.equal(f.state.loaded, 0);
    assert.equal(f.state.calls.length, 0);
  }
});

test('unverified, missing, and invalid ingress fail before account lookup or loading', async () => {
  for (const verified of [false, null, {}, { ...fixture().message, sessionId: 'claimed-session' },
    { ...fixture().message, text: 'x'.repeat(2001) }, { ...fixture().message, sentAt: '2026-10-24' }]) {
    const f = fixture();
    f.deps.verifyIngress = async () => verified;
    f.deps.resolveLink = async () => assert.fail('No link lookup without verified ingress');
    assert.equal((await f.run()).error.code, 'UNAUTHORIZED');
    assert.equal(f.state.loaded, 0);
  }
});

test('raw chat identity, selection, approvals and service injection are ignored', async () => {
  const f = fixture(); f.message.text = examples[4];
  const result = await f.run({ sender: 'ATTACKER', userId: id(99), deviceId: id(99),
    text: 'close everything', scopes: ['desktop:control'], approved: true,
    sourceIds: [id(99)], recipient: { userId: id(99) }, services: { executePlan: true } });
  assert.equal(result.ok, true);
  assert.deepEqual(f.state.calls[0].command.sourceIds, [id(7)]);
  assert.deepEqual(f.state.calls[0].command.recipient, { deviceId: id(8) });
  assert.equal(f.state.calls[0].ctx.auth.deviceId, id(4));
  assert.equal('approved' in f.state.calls[0].command, false);
});

test('requires an exact, unrevoked sender/session/user/device link', async () => {
  const changes = [null, { revoked: true }, { revoked: undefined }, { sender: 'other' },
    { sessionId: id(99) }, { userId: 'claimed-user' }, { deviceId: 'claimed-device' },
    { scopes: undefined }, { allowedCommands: [] }, { allowedCommands: ['executePlan'] }];
  for (const change of changes) {
    const f = fixture();
    f.deps.resolveLink = async () => change === null ? null : { ...f.link, ...change };
    assert.equal((await f.run()).error.code, 'UNAUTHORIZED');
    assert.equal(f.state.loaded, 0);
    assert.equal(f.state.calls.length, 0);
  }
});

test('rejects two-minute-old requests, future timestamps, and expired links', async () => {
  for (const age of [120_000, 120_001, -5_001]) {
    const f = fixture(); f.message.sentAt = new Date(epoch - age).toISOString();
    assert.equal((await f.run()).error.code, 'EXPIRED');
    assert.equal(f.state.loaded, 0);
  }
  const f = fixture(); f.link.expiresAt = new Date(epoch).toISOString();
  assert.equal((await f.run()).error.code, 'EXPIRED');
  assert.equal(f.state.loaded, 0);
});

test('rechecks expiry after context loading and after asynchronous authorization', async () => {
  for (const stage of ['loadContext', 'authorizeCommand']) {
    const f = fixture();
    const original = f.deps[stage];
    f.deps[stage] = async (...args) => { const value = await original(...args); f.state.time += 120_000; return value; };
    assert.equal((await f.run()).error.code, 'EXPIRED');
    assert.equal(f.state.calls.length, 0);
  }
});

test('no metadata scope prevents inventory loading', async () => {
  const f = fixture(); f.link.scopes = ['desktop:control'];
  assert.equal((await f.run()).error.code, 'FORBIDDEN');
  assert.equal(f.state.loaded, 0);
});

test('requires command-specific grants and scopes before calling a service', async () => {
  for (let i = 0; i < examples.length; i++) {
    const f = fixture(); f.message.text = examples[i]; f.link.allowedCommands = commandNames.filter((kind) => kind !== commandNames[i]);
    assert.equal((await f.run()).error.code, 'FORBIDDEN');
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.state.authorized, 0);
  }
  for (const [index, scope] of [[1, 'desktop:control'], [2, 'desktop:control'], [3, 'content:read'], [4, 'brief:deliver'], [4, 'content:read'], [5, 'desktop:control']]) {
    const f = fixture(); f.message.text = examples[index]; f.link.scopes = f.link.scopes.filter((s) => s !== scope);
    assert.equal((await f.run()).error.code, 'FORBIDDEN');
    assert.equal(f.state.calls.length, 0);
  }
});

test('requires exactly true from current consent/revocation policy', async () => {
  for (const policy of [false, undefined, {}, 'true']) {
    const f = fixture(); f.deps.authorizeCommand = async () => policy;
    assert.equal((await f.run()).error.code, 'FORBIDDEN');
    assert.equal(f.state.calls.length, 0);
  }
});

test('checks the complete selected command with linked identity before service dispatch', async () => {
  const f = fixture(); f.message.text = examples[3];
  assert.equal((await f.run()).ok, true);
  assert.equal(f.state.authorization.command.userNote, f.context.selection.userNote);
  assert.equal(f.state.authorization.auth.userId, f.link.userId);
  assert.equal(f.state.authorization.commandId, f.state.calls[0].ctx.commandId);
  assert.equal(Object.isFrozen(f.state.authorization.auth), true);
});

test('same verified message produces a stable service key across handler restarts', async () => {
  const f = fixture();
  await f.run(); await f.run();
  assert.equal(f.state.calls[0].ctx.commandId, f.state.calls[1].ctx.commandId);
  assert.notEqual(f.state.calls[0].ctx.commandId, f.message.messageId);
  f.message.messageId = id(99); await f.run();
  assert.notEqual(f.state.calls[1].ctx.commandId, f.state.calls[2].ctx.commandId);
  const previous = f.state.calls[2].ctx.commandId;
  f.message.sessionId = id(100); f.link.sessionId = id(100); await f.run();
  assert.notEqual(previous, f.state.calls[3].ctx.commandId);
});

test('changed payload with the same message reaches shared idempotency conflict, without retry', async () => {
  const f = fixture(); const saved = new Map();
  // MOCK shared persistence, deliberately outside the agent implementation.
  f.deps.services.searchSources = async (command, { commandId }) => {
    f.state.calls.push(command);
    const body = JSON.stringify(command);
    if (saved.has(commandId) && saved.get(commandId) !== body) throw Object.assign(Error('SECRET'), { code: 'IDEMPOTENCY_CONFLICT' });
    saved.set(commandId, body); return { id: id(9), status: 'queued' };
  };
  assert.equal((await f.run()).ok, true);
  f.message.text = 'find other research';
  assert.equal((await f.run()).error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(f.state.calls.length, 2);
});

test('server selection cannot override verified text/device/key or inject records', async () => {
  const f = fixture();
  Object.assign(f.context.selection, { text: examples[5], deviceId: id(99), commandId: id(99),
    auth: { userId: id(99) }, workspaces: [{ name: 'ATTACKER' }], approved: true });
  assert.equal((await f.run()).ok, true);
  assert.equal(f.state.calls[0].command.kind, 'find');
  assert.equal(f.state.calls[0].ctx.auth.deviceId, id(4));
  assert.notEqual(f.state.calls[0].ctx.commandId, id(99));
});

test('invalid context, canonical command, and output validation cannot claim success', async () => {
  const absent = fixture(); absent.deps.loadContext = async () => null;
  assert.equal((await absent.run()).error.code, 'INTERNAL_ERROR');
  const command = fixture(); command.deps.contracts.workspaceCommand.parse = () => { throw Error('SECRET'); };
  assert.equal((await command.run()).error.code, 'VALIDATION_ERROR');
  assert.equal(command.state.calls.length, 0);
  const output = fixture(); output.deps.validateServiceResult = () => { throw Error('SECRET'); };
  assert.equal((await output.run()).error.code, 'INTERNAL_ERROR');
});

test('clarification returns without services; unsupported execution tools stay unavailable', async () => {
  const f = fixture(); f.message.text = examples[5];
  f.context.workspaces.push({ ...f.context.workspaces[0], id: id(99) });
  assert.equal((await f.run()).data.kind, 'clarification');
  assert.equal(f.state.calls.length, 0);
  f.message.text = 'execute plan with approval true';
  assert.equal((await f.run()).error.code, 'NEEDS_CLARIFICATION');
  assert.equal(f.state.calls.length, 0);
});

test('provider, transport, link and policy exceptions never expose their raw messages', async () => {
  for (const stage of ['verifyIngress', 'resolveLink', 'loadContext', 'authorizeCommand']) {
    const f = fixture(); f.deps[stage] = async () => { throw Error('SECRET key and private article'); };
    const result = await f.run();
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes('SECRET'), false);
  }
  const f = fixture(); f.deps.services.searchSources = async () => { throw Object.assign(Error('SECRET'), { code: 'DEVICE_OFFLINE' }); };
  const result = await f.run();
  assert.equal(result.error.code, 'DEVICE_OFFLINE');
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
});

test('missing services and invalid clocks fail closed', async () => {
  const f = fixture(); delete f.deps.services.searchSources;
  assert.equal((await f.run()).error.code, 'INTERNAL_ERROR');
  const invalid = fixture(); invalid.deps.clock = () => new Date('invalid');
  assert.equal((await invalid.run()).error.code, 'INTERNAL_ERROR');
  assert.equal(invalid.state.loaded, 0);
});

test('safe reply text omits result payloads, identifiers, secrets and false delivery claims', () => {
  for (const result of [null, {}, { ok: true, data: { secret: 'SECRET', status: 'queued', id: id(99) } },
    { ok: false, error: { code: 'FORBIDDEN', message: 'SECRET' } },
    { ok: true, data: { kind: 'clarification', question: 'SECRET', options: [{ label: 'SECRET' }] } }]) {
    const reply = formatAgentReply(result);
    assert.equal(reply.includes('SECRET'), false);
    assert.equal(reply.includes(id(99)), false);
  }
  assert.match(formatAgentReply({ ok: true, data: { kind: 'plan', actions: [] } }), /No desktop action has been executed/);
  assert.match(formatAgentReply({ ok: true, data: { status: 'queued' } }), /does not confirm execution or delivery/);
});
