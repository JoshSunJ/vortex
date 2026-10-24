import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/gu, ' ').trim();
const fail = (code, message) => ({ kind: 'error', code, message });

// These are internal routing decisions, not a second Plan/Snapshot wire schema.
// No execution, provider calls, approval decisions, or plan hashing happen here.
export function resolveTabRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('VALIDATION_ERROR', 'The request must be an object.');
  }
  const { text, resources, selectedResourceIds = [] } = input;
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
    return fail('VALIDATION_ERROR', 'The request must contain 1 to 2,000 characters.');
  }
  if (!Array.isArray(resources) || resources.length > 1000 ||
      !Array.isArray(selectedResourceIds) || selectedResourceIds.length > 100 ||
      selectedResourceIds.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
      new Set(selectedResourceIds).size !== selectedResourceIds.length) {
    return fail('VALIDATION_ERROR', 'The resource list or selected resource IDs are invalid.');
  }
  const seen = new Set();
  for (const resource of resources) {
    if (!resource || typeof resource !== 'object' ||
        typeof resource.id !== 'string' || !UUID.test(resource.id) || seen.has(resource.id) ||
        !['tab', 'window'].includes(resource.kind) ||
        typeof resource.title !== 'string' || !resource.title.trim() || resource.title.length > 500 ||
        !Number.isSafeInteger(resource.revision) || resource.revision < 0 ||
        !Array.isArray(resource.capabilities) || resource.capabilities.some((item) => typeof item !== 'string')) {
      return fail('VALIDATION_ERROR', 'A resource has an invalid ID, title, kind, or revision.');
    }
    seen.add(resource.id);
  }
  if (selectedResourceIds.some((id) => !seen.has(id))) {
    return fail('VALIDATION_ERROR', 'A selected resource is missing from the current inventory.');
  }

  // Deliberately narrow grammar: an entire request must match one supported
  // command. Unknown or compound instructions never become a focus action.
  const command = normalize(text);
  const patterns = [
    { intent: 'search', pattern: /^(?:find|search for)\s+(.+?)[.!?]?$/u },
    { intent: 'activate', pattern: /^(?:switch to|activate|focus)\s+(.+?)[.!?]?$/u },
  ];
  let intent;
  let query;
  for (const entry of patterns) {
    const match = command.match(entry.pattern);
    if (match) {
      intent = entry.intent;
      query = match[1].trim();
      break;
    }
  }
  if (!query) {
    return fail('NEEDS_CLARIFICATION', 'Use a supported request such as "find project notes" or "switch to project notes".');
  }

  const tokens = query.split(' ');
  const matches = resources.filter((resource) =>
    resource.kind === 'tab' &&
    (selectedResourceIds.length === 0 || selectedResourceIds.includes(resource.id)) &&
    tokens.every((token) => normalize(resource.title).includes(token)));
  if (matches.length === 0) {
    return fail('NOT_FOUND', 'No tab matches the requested name.');
  }
  // Never prefer an exact match over another plausible title silently.
  if (matches.length > 1) {
    return {
      kind: 'ambiguous',
      question: 'Which tab did you mean?',
      candidates: matches.map(({ id, title }) => ({ resourceId: id, title })),
    };
  }
  const target = matches[0];
  if (intent === 'activate' && !target.capabilities.includes('activate_tab')) {
    return fail('FORBIDDEN', 'This tab cannot currently be activated.');
  }
  return {
    kind: 'resolved',
    intent,
    resourceId: target.id,
    title: target.title,
    expectedRevision: target.revision,
  };
}

/**
 * Integration seam for A/C. `contracts` must be their canonical runtime schemas
 * (objects exposing parse). `issuePlan` is the trusted plan service, responsible
 * for authenticated identity, hash, expiry, approval policy, and persistence.
 * This module must not provide substitute implementations for those services.
 * Read-only search stays outside the mutation-plan API; use resolveTabRequest.
 */
export async function planCommand(input, { snapshot, contracts, issuePlan } = {}) {
  const requestId = randomUUID();
  const envelope = (value) => ({ schemaVersion: '1.0', requestId, ...value });
  if (!contracts || !['snapshot', 'plan', 'clarification'].every((key) =>
    typeof contracts[key]?.parse === 'function') || typeof issuePlan !== 'function') {
    return envelope({ ok: false, error: {
      code: 'INTERNAL_ERROR', message: 'Connect the canonical validators and trusted plan issuer first.', retryable: false,
    } });
  }
  let checked;
  try {
    if (!input || !UUID.test(input.commandId ?? '') || !UUID.test(input.deviceId ?? '') ||
        !Number.isSafeInteger(input.snapshotRevision) || input.snapshotRevision < 0 ||
        !Array.isArray(input.selectedResourceIds)) throw new Error('invalid input');
    checked = contracts.snapshot.parse(snapshot);
  } catch {
    return envelope({ ok: false, error: {
      code: 'VALIDATION_ERROR', message: 'The request or current inventory is invalid.', retryable: false,
    } });
  }
  if (input.deviceId !== checked.deviceId || input.snapshotRevision !== checked.revision) {
    return envelope({ ok: false, error: {
      code: 'STALE_STATE', message: 'Refresh the device inventory before trying again.', retryable: false,
    } });
  }
  const decision = resolveTabRequest({
    text: input.text, resources: checked.resources, selectedResourceIds: input.selectedResourceIds,
  });
  if (decision.kind === 'error') {
    return envelope({ ok: false, error: {
      code: decision.code, message: decision.message, retryable: false,
    } });
  }
  try {
    if (decision.kind === 'ambiguous') {
      const data = contracts.clarification.parse({
        kind: 'clarification', commandId: input.commandId, question: decision.question,
        options: decision.candidates.map((candidate) => ({
          id: randomUUID(), label: candidate.title, resourceIds: [candidate.resourceId],
        })),
      });
      return envelope({ ok: true, data });
    }
    if (decision.intent === 'search') {
      return envelope({ ok: false, error: {
        code: 'NEEDS_CLARIFICATION', message: 'Review the search result, then request an explicit switch.', retryable: false,
      } });
    }
    if (!checked.capabilities.includes('activate_tab')) {
      return envelope({ ok: false, error: {
        code: 'FORBIDDEN', message: 'This device does not currently support tab activation.', retryable: false,
      } });
    }
    const action = {
      kind: 'activate_tab',
      target: { resourceId: decision.resourceId, expectedRevision: decision.expectedRevision },
    };
    const data = contracts.plan.parse(await issuePlan({
      commandId: input.commandId, deviceId: input.deviceId,
      snapshotRevision: checked.revision, actions: [action],
    }));
    // Even a valid Plan must correspond exactly to this request and selection.
    if (data.commandId !== input.commandId || data.deviceId !== input.deviceId ||
        data.snapshotRevision !== checked.revision || data.actions.length !== 1 ||
        data.actions[0].action.kind !== 'activate_tab' ||
        data.actions[0].action.target.resourceId !== decision.resourceId ||
        data.actions[0].action.target.expectedRevision !== decision.expectedRevision) {
      throw new Error('plan mismatch');
    }
    return envelope({ ok: true, data });
  } catch {
    return envelope({ ok: false, error: {
      code: 'INTERNAL_ERROR', message: 'Could not produce a validated plan.', retryable: false,
    } });
  }
}
