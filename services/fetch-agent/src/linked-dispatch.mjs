import { createHash, randomUUID } from 'node:crypto';
import { dispatchWorkspaceRequest } from '../../intelligence/src/workspace-router.mjs';

const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const services = {
  find: ['searchSources', ['metadata:read']],
  create_workspace: ['createWorkspace', ['metadata:read', 'desktop:control']],
  focus_workspace: ['planWorkspaceFocus', ['metadata:read', 'desktop:control']],
  save_checkpoint: ['createCheckpoint', ['metadata:read', 'content:read']],
  send_brief: ['sendBrief', ['metadata:read', 'content:read', 'brief:deliver']],
  resume_workspace: ['planWorkspaceResume', ['metadata:read', 'desktop:control']],
};
const selections = ['workspaceId', 'goal', 'selectedResourceIds', 'primaryTabId',
  'primaryWindowId', 'sourceIds', 'userNote', 'recipient'];
const codes = new Set(['UNAUTHORIZED', 'FORBIDDEN', 'EXPIRED', 'DEVICE_OFFLINE',
  'PROVIDER_TIMEOUT', 'IDEMPOTENCY_CONFLICT']);
const fail = (code, message) => ({ schemaVersion: '1.0', requestId: randomUUID(),
  ok: false, error: { code, message, retryable: code === 'PROVIDER_TIMEOUT' } });
const denied = (code) => Object.assign(new Error('Agent request was denied.'), { code });

// A stable private service key, not an ACP message ID or a new wire field.
function commandIdFor(message) {
  const bytes = createHash('sha256').update(JSON.stringify([
    'vortex-acp-command-v1', message.sender, message.sessionId, message.messageId,
  ])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  return Date.parse(value);
}

/**
 * Internal Fetch ingress boundary; not a public HTTP route or ACP host.
 * Verification, linked identity, scoped records, consent, persistence and
 * canonical validators are supplied by the authenticated shared service.
 * No SDK, provider, network listener, executor, or duplicate store is created.
 */
export function createLinkedAgentDispatcher(dependencies = {}) {
  if (!object(dependencies)) dependencies = {};
  const clock = dependencies.clock ?? (() => new Date());
  const now = () => {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw Error('Invalid clock.');
    return value.getTime();
  };
  return async function handleAgentMessage(rawMessage, ingressContext) {
    const required = ['verifyIngress', 'resolveLink', 'loadContext', 'authorizeCommand', 'validateServiceResult'];
    if (!object(dependencies) || required.some((name) => typeof dependencies[name] !== 'function') ||
        typeof dependencies.contracts?.workspaceCommand?.parse !== 'function' ||
        typeof dependencies.contracts?.clarification?.parse !== 'function' ||
        !object(dependencies.services)) {
      return fail('INTERNAL_ERROR', 'Connect trusted agent dependencies before accepting requests.');
    }
    try {
      // The verifier must authenticate the signed transport and return verified
      // content. Nothing in rawMessage can self-assert a user, device, or scope.
      const verified = await dependencies.verifyIngress(rawMessage, ingressContext);
      if (!object(verified) || !text(verified.sender, 256) || !uuid(verified.sessionId) ||
          !uuid(verified.messageId) || !text(verified.text, 2000) ||
          !Number.isFinite(timestamp(verified.sentAt))) {
        return fail('UNAUTHORIZED', 'A verified sender, session, and text message are required.');
      }
      const message = { sender: verified.sender, sessionId: verified.sessionId,
        messageId: verified.messageId, text: verified.text, sentAt: verified.sentAt };
      const assertFresh = () => {
        const age = now() - timestamp(message.sentAt);
        if (age >= 120_000 || age < -5_000) throw denied('EXPIRED');
      };
      assertFresh();
      const link = await dependencies.resolveLink({ sender: message.sender, sessionId: message.sessionId });
      if (!object(link) || link.revoked !== false || link.sender !== message.sender ||
          link.sessionId !== message.sessionId || !uuid(link.userId) || !uuid(link.deviceId) ||
          !Number.isFinite(timestamp(link.expiresAt)) ||
          !Array.isArray(link.scopes) || link.scopes.some((scope) => typeof scope !== 'string') ||
          !Array.isArray(link.allowedCommands) || link.allowedCommands.length === 0 ||
          link.allowedCommands.some((kind) => !Object.hasOwn(services, kind))) {
        return fail('UNAUTHORIZED', 'Link this agent conversation to an authorized Vortex device first.');
      }
      const assertLink = () => {
        assertFresh();
        if (now() >= timestamp(link.expiresAt)) throw denied('EXPIRED');
        if (!link.scopes.includes('metadata:read')) throw denied('FORBIDDEN');
      };
      assertLink();
      const auth = Object.freeze({ userId: link.userId, deviceId: link.deviceId });
      const remote = Object.freeze({ sender: message.sender, sessionId: message.sessionId,
        messageId: message.messageId, sentAt: message.sentAt });
      const commandId = commandIdFor(message);
      // Only the linked service supplies selection/recipient and scoped records.
      // Chat metadata cannot inject inventory, a different device, or approval.
      const context = await dependencies.loadContext({ auth, remote, commandId });
      assertLink();
      if (!object(context) || !Array.isArray(context.workspaces) || !Array.isArray(context.resources) ||
          !object(context.selection)) {
        return fail('INTERNAL_ERROR', 'The linked workspace context is unavailable.');
      }
      const input = { text: message.text, deviceId: auth.deviceId, commandId };
      for (const key of selections) {
        if (Object.hasOwn(context.selection, key)) input[key] = context.selection[key];
      }
      const guardedServices = {};
      for (const [kind, [serviceName, scopes]] of Object.entries(services)) {
        guardedServices[serviceName] = async (command, serviceContext) => {
          assertLink();
          if (!link.allowedCommands.includes(kind) || scopes.some((scope) => !link.scopes.includes(scope))) {
            throw denied('FORBIDDEN');
          }
          if (typeof dependencies.services[serviceName] !== 'function') throw Error('Missing shared service.');
          // Revalidate current link revocation, source/recipient consent, and
          // command-specific policy immediately before every shared service.
          if (await dependencies.authorizeCommand({ command, auth, remote, commandId }) !== true) {
            throw denied('FORBIDDEN');
          }
          assertLink();
          return dependencies.services[serviceName](command, { ...serviceContext, remote });
        };
      }
      return await dispatchWorkspaceRequest(input, { auth, contracts: dependencies.contracts,
        workspaces: context.workspaces, resources: context.resources, services: guardedServices,
        validateServiceResult: dependencies.validateServiceResult });
    } catch (error) {
      const code = codes.has(error?.code) ? error.code : 'INTERNAL_ERROR';
      return fail(code, 'The linked agent request could not be completed.');
    }
  };
}

/** ACP replies intentionally omit source text, titles, URLs, IDs and tokens.
 * A future reviewed bridge can expose selected result fields after disclosure
 * consent. Never serialize the full service Result into a public chat reply.
 */
export function formatAgentReply(result) {
  if (result?.ok === false) {
    const messages = {
      UNAUTHORIZED: 'Link this conversation to your Vortex account and device first.',
      FORBIDDEN: 'This conversation is not authorized for that request.',
      EXPIRED: 'This request or device link expired. Reconnect and send a new request.',
      DEVICE_OFFLINE: 'The desktop device is unavailable. No completed desktop action is confirmed.',
      NEEDS_CLARIFICATION: 'Choose a workspace or use a supported command in Vortex, then retry.',
      APPROVAL_REQUIRED: 'Review the request and grant the required approval in Vortex.',
      PROVIDER_TIMEOUT: 'The shared service timed out. Check the operation status before retrying.',
      IDEMPOTENCY_CONFLICT: 'This message ID was already used for another request. Send a new message.',
    };
    return messages[result.error?.code] ?? 'Vortex could not complete this request. Check Vortex for details.';
  }
  if (result?.ok !== true || !object(result.data)) return 'No validated Vortex result is available.';
  if (result.data.kind === 'clarification') return 'More than one workspace matches. Choose one in Vortex, then retry.';
  if (result.data.kind === 'plan') return 'A preview plan is ready in Vortex. No desktop action has been executed by this adapter.';
  return 'The shared service returned a result. Check its status in Vortex; this message does not confirm execution or delivery.';
}
