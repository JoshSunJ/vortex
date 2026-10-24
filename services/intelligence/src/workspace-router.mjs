import { randomUUID } from 'node:crypto';

const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const ids = (value, max = 100) => Array.isArray(value) && value.length <= max && value.every(uuid) && new Set(value).size === value.length;
const normalized = (value) => value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/gu, ' ').trim();
const failure = (code, message) => ({ kind: 'error', code, message });

// Deterministic grammar only. The captured phrase is a name/query, never code.
const grammar = [
  ['find', /^(?:find|search for)\s+(.+?)[.!?]?$/iu],
  ['create_workspace', /^create workspace\s+"([^"]+)"[.!?]?$/iu],
  ['focus_workspace', /^(?:focus|switch to)\s+(?:workspace\s+)?(.+?)[.!?]?$/iu],
  ['save_checkpoint', /^save checkpoint\s+"([^"]+)"[.!?]?$/iu],
  ['send_brief', /^send brief\s+"([^"]+)"[.!?]?$/iu],
  ['resume_workspace', /^(?:resume|continue)\s+(?:workspace\s+)?(.+?)[.!?]?$/iu],
];

/**
 * Internal resolver, not a replacement shared schema or authorization layer.
 * `workspaces` and `resources` must already be scoped by the trusted API.
 * Returned commands follow the documented v1.3 WorkspaceCommand vocabulary;
 * dispatchWorkspaceRequest additionally requires the canonical runtime schema.
 */
export function resolveWorkspaceRequest(input) {
  if (!object(input) || !text(input.text, 2000) || !uuid(input.deviceId)) {
    return failure('VALIDATION_ERROR', 'Provide a valid request and device ID.');
  }
  const { workspaces = [] } = input;
  if (!Array.isArray(workspaces) || workspaces.length > 1000 ||
      workspaces.some((item) => !object(item) || !uuid(item.id) || !uuid(item.deviceId) ||
        !text(item.name, 100) || !ids(item.resourceIds)) ||
      new Set(workspaces.map((item) => item.id)).size !== workspaces.length) {
    return failure('VALIDATION_ERROR', 'The workspace list is invalid.');
  }
  if (input.workspaceId !== undefined && !uuid(input.workspaceId)) {
    return failure('VALIDATION_ERROR', 'The workspace ID is invalid.');
  }
  const commandText = input.text.normalize('NFKC').trim().replace(/^please\s+/iu, '');
  let kind;
  let phrase;
  for (const [candidateKind, pattern] of grammar) {
    const match = commandText.match(pattern);
    if (match) {
      kind = candidateKind;
      phrase = match[1].trim();
      break;
    }
  }
  if (!phrase) {
    return failure('NEEDS_CLARIFICATION', 'Please use a supported workspace command.');
  }
  if (kind === 'focus_workspace' || kind === 'resume_workspace') {
    const closingQuote = { '"': '"', "'": "'", '\u201c': '\u201d' }[phrase[0]];
    if (closingQuote && phrase.endsWith(closingQuote)) phrase = phrase.slice(1, -1).trim();
    if (!phrase) return failure('NEEDS_CLARIFICATION', 'Provide a saved workspace name.');
  }
  if (kind === 'find') {
    const command = { kind, query: phrase };
    if (input.workspaceId !== undefined) {
      if (!workspaces.some((item) => item.id === input.workspaceId && item.deviceId === input.deviceId)) {
        return failure('NOT_FOUND', 'The workspace to search was not found.');
      }
      command.workspaceId = input.workspaceId;
    }
    return { kind: 'command', command };
  }
  if (phrase.length > 100) return failure('VALIDATION_ERROR', 'Workspace names must not exceed 100 characters.');

  if (kind === 'create_workspace') {
    if (!text(input.goal, 2000) || !ids(input.selectedResourceIds) || input.selectedResourceIds.length === 0) {
      return failure('VALIDATION_ERROR', 'Provide a goal and 1 to 100 explicitly selected resources.');
    }
    const resources = input.resources;
    if (!Array.isArray(resources) || resources.length > 1000 ||
        resources.some((resource) => !object(resource) || !uuid(resource.id) || !uuid(resource.deviceId) ||
          !['tab', 'window'].includes(resource.kind)) ||
        new Set(resources.map((resource) => resource.id)).size !== resources.length) {
      return failure('VALIDATION_ERROR', 'The current resource inventory is invalid.');
    }
    const selected = input.selectedResourceIds.map((id) => resources.find((resource) => resource.id === id));
    if (selected.some((resource) => !resource || resource.deviceId !== input.deviceId)) {
      return failure('FORBIDDEN', 'Select only authorized resources from the current device.');
    }
    for (const [field, resourceKind] of [['primaryTabId', 'tab'], ['primaryWindowId', 'window']]) {
      if (input[field] !== undefined && (!uuid(input[field]) ||
          !selected.some((resource) => resource.id === input[field] && resource.kind === resourceKind))) {
        return failure('VALIDATION_ERROR', 'Primary targets must be selected members of the correct resource kind.');
      }
    }
    const command = { kind, name: phrase, goal: input.goal, deviceId: input.deviceId,
      selectedResourceIds: [...input.selectedResourceIds] };
    for (const field of ['primaryTabId', 'primaryWindowId']) {
      if (input[field] !== undefined) command[field] = input[field];
    }
    return { kind: 'command', command };
  }

  // Match names deterministically; no title guesses, fuzzy winner, or inferred membership.
  const matches = workspaces.filter((item) => item.deviceId === input.deviceId &&
    normalized(item.name) === normalized(phrase) &&
    (input.workspaceId === undefined || item.id === input.workspaceId));
  if (matches.length === 0) return failure('NOT_FOUND', 'No matching workspace was found on this device.');
  if (matches.length > 1) {
    return { kind: 'ambiguous', question: 'Which workspace with this name did you mean?',
      candidates: matches.map((item) => ({ workspaceId: item.id, name: item.name, resourceIds: [...item.resourceIds] })) };
  }
  const workspace = matches[0];
  const command = { kind, workspaceId: workspace.id };
  if (kind === 'save_checkpoint' || kind === 'send_brief') {
    if (!ids(input.sourceIds, kind === 'send_brief' ? 5 : 100)) {
      return failure('VALIDATION_ERROR', 'Provide a valid list of selected source IDs.');
    }
    command.sourceIds = [...input.sourceIds];
  }
  if (kind === 'save_checkpoint' && input.userNote !== undefined) {
    if (typeof input.userNote !== 'string' || input.userNote.length > 2000) {
      return failure('VALIDATION_ERROR', 'User notes must not exceed 2,000 characters.');
    }
    command.userNote = input.userNote;
  }
  if (kind === 'send_brief') {
    const recipient = input.recipient;
    if (command.sourceIds.length === 0) return failure('CONTENT_UNAVAILABLE', 'Select at least one source to summarize.');
    if (!object(recipient) || Object.keys(recipient).length !== 1 ||
        !((uuid(recipient.deviceId) && recipient.userId === undefined) ||
          (uuid(recipient.userId) && recipient.deviceId === undefined))) {
      return failure('VALIDATION_ERROR', 'Specify exactly one recipient device or user.');
    }
    command.recipient = { ...recipient };
  }
  return { kind: 'command', command };
}

const serviceFor = {
  find: 'searchSources', create_workspace: 'createWorkspace', focus_workspace: 'planWorkspaceFocus',
  save_checkpoint: 'createCheckpoint', send_brief: 'sendBrief', resume_workspace: 'planWorkspaceResume',
};
const errorCodes = new Set(['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'STALE_STATE',
  'PROTECTED', 'NEEDS_CLARIFICATION', 'APPROVAL_REQUIRED', 'EXPIRED', 'DEVICE_OFFLINE', 'FOCUS_DENIED',
  'STORAGE_FAILED', 'PROVIDER_TIMEOUT', 'CONTENT_UNAVAILABLE', 'IDEMPOTENCY_CONFLICT', 'INTERNAL_ERROR']);

/** Adapter bindings are internal, not new HTTP routes or canonical signatures.
 * Each service receives one canonical WorkspaceCommand and a trusted context.
 * The trusted service must authorize every referenced ID, validate source
 * membership/consent/idempotency, and validate its output before returning it.
 * No executePlan service exists here. Focus/resume return a preview Plan only.
 */
export async function dispatchWorkspaceRequest(input, dependencies = {}) {
  const requestId = randomUUID();
  const envelope = (value) => ({ schemaVersion: '1.0', requestId, ...value });
  const fail = (code, message, retryable = false) => envelope({ ok: false, error: { code, message, retryable } });
  if (!object(dependencies) || !object(dependencies.auth) ||
      !uuid(dependencies.auth.userId) || !uuid(dependencies.auth.deviceId)) {
    return fail('UNAUTHORIZED', 'An authenticated user and device context is required.');
  }
  if (!object(input) || input.deviceId !== dependencies.auth.deviceId) {
    return fail('FORBIDDEN', 'The requested device does not match the authenticated device.');
  }
  if (!uuid(input.commandId)) return fail('VALIDATION_ERROR', 'A valid command ID is required.');
  const { contracts, services } = dependencies;
  if (typeof contracts?.workspaceCommand?.parse !== 'function' ||
      typeof contracts?.clarification?.parse !== 'function' ||
      typeof dependencies.validateServiceResult !== 'function' || !object(services)) {
    return fail('INTERNAL_ERROR', 'Connect the canonical validators and shared services first.');
  }
  // Only server-supplied authorized records are used, never request-provided records.
  const resolution = resolveWorkspaceRequest({ ...input,
    workspaces: dependencies.workspaces, resources: dependencies.resources });
  if (resolution.kind === 'error') return fail(resolution.code, resolution.message);
  if (resolution.kind === 'ambiguous') {
    try {
      return envelope({ ok: true, data: contracts.clarification.parse({
        kind: 'clarification', commandId: input.commandId, question: resolution.question,
        options: resolution.candidates.map((candidate) => ({
          id: candidate.workspaceId, label: `${candidate.name} (${candidate.workspaceId.slice(0, 8)})`,
          resourceIds: candidate.resourceIds,
        })),
      }) });
    } catch { return fail('INTERNAL_ERROR', 'Could not validate the clarification response.'); }
  }
  let command;
  try { command = contracts.workspaceCommand.parse(resolution.command); }
  catch { return fail('VALIDATION_ERROR', 'Canonical command validation failed.'); }
  const handler = services[serviceFor[command.kind]];
  if (typeof handler !== 'function') return fail('INTERNAL_ERROR', 'The shared service for this command is not connected.');
  try {
    const result = await handler(command, { auth: dependencies.auth, commandId: input.commandId });
    return envelope({ ok: true, data: dependencies.validateServiceResult(command.kind, result) });
  } catch (error) {
    const code = errorCodes.has(error?.code) ? error.code : 'INTERNAL_ERROR';
    // Never return raw provider messages, payloads, keys, or source content.
    return fail(code, 'The shared service could not complete the request.', code === 'PROVIDER_TIMEOUT');
  }
}
