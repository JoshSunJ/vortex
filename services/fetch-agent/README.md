# Owner B: linked Fetch agent boundary

This is the first internal authentication/dispatch slice for Fetch/ASI:One.
It reuses `../intelligence/src/workspace-router.mjs` and the same six shared
services as the dashboard. It is **not a running ACP agent**, registered
Agentverse identity, completed ASI:One integration, or sponsor evidence.

No packages, accounts, hosting, network listeners, paid calls, public desktop
ports, or credentials are needed for the offline tests:

```powershell
node --test services/fetch-agent/test/linked-dispatch.test.mjs
```

## Trusted integration dependencies

Import `createLinkedAgentDispatcher` and `formatAgentReply` from
`src/linked-dispatch.mjs`. The factory returns `handleAgentMessage(raw, ingress)`.
It returns the existing wire-1.0 Result envelope to the **trusted backend**.
These dependency interfaces are private adapter seams, not shared wire schema
changes or new HTTP routes. Canonical schemas remain owned by Josh/Andrew.

| Dependency | Required behavior |
| --- | --- |
| `verifyIngress(raw, ingress)` | Authenticate the real ACP transport; return verified `{sender, sessionId, messageId, sentAt, text}` or reject. A boolean flag or claimed sender in request JSON is insufficient. UUID session/message IDs, UTC timestamp, one text request up to 2,000 characters. |
| `resolveLink({sender, sessionId})` | Load a server-owned, currently valid conversation link: `{sender, sessionId, userId, deviceId, scopes, allowedCommands, expiresAt, revoked:false}`. Linking must require Vortex user confirmation; never link based on chat claims. |
| `loadContext({auth, remote, commandId})` | Return authorized `workspaces`, `resources`, and `selection`. Selection can contain workspace ID, goal, explicit resource/source IDs, primary IDs, exact user note, and one recipient. Only server-confirmed selection is used. |
| `authorizeCommand({command, auth, remote, commandId})` | Return exactly `true` only after rechecking current link revocation/grants, ownership, source membership, provider-disclosure consent, recipient approval and command-specific policy. No side effects. |
| `contracts`, `services`, `validateServiceResult` | The canonical validators, shared service adapters and output validator already required by `dispatchWorkspaceRequest`. No test doubles in production. |
| `clock()` | Optional test clock returning a Date; defaults to current time. |

An unlinked conversation fails before workspace loading. Requests expire after
two minutes; future timestamps beyond five seconds are rejected. Scope and link
expiry are rechecked before service dispatch. Revocation during a request must
be checked by `authorizeCommand` and by the authoritative shared service itself.

`allowedCommands` is an explicit list of the six existing command kinds.
Every request needs `metadata:read`. Additionally:

- Create/focus/resume require `desktop:control` (creation uses a conservative
  command grant even though it does not mutate the OS).
- Save checkpoint requires `content:read`.
- Send brief requires `content:read` and `brief:deliver`.

These checks supplement shared authorization. They do not confer consent,
prove desktop availability, or bypass plan approval. Focus/resume only return
preview plans. There is no execute/approve/cancel/operation-poll tool in this slice.

The command ID is deterministic for the verified sender, session and message ID.
Same-message retries reach the same shared idempotency key. Changed content must
be rejected by shared persistence as `IDEMPOTENCY_CONFLICT`; this adapter adds no
cache or second receipt store. Idempotency must compare the effective payload,
including server-selected IDs/recipient. There are no automatic retries here.

## ACP bridge still required

The intended Python uAgent must import the official `ChatMessage`,
`ChatAcknowledgement` and protocol specification, acknowledge each received
message, verify the transport/session binding, and invoke this boundary through
an authenticated backend integration agreed with Andrew. Do not open an ad hoc
desktop control port or invent a new unauthenticated endpoint.

Official documentation checked October 24, 2026:

- [Agent Chat Protocol](https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol)
- [ASI:One-compatible uAgent](https://innovationlab.fetch.ai/resources/docs/examples/chat-protocol/asi-compatible-uagents)

The documentation describes AgentChatProtocol 0.3.0 and Python uAgents. No SDK
version is installed or claimed tested by this feature. Pin dependencies only
after a real SDK smoke test. Registration, hosting and any account/payment choices
remain separate from these offline tests.

Use `formatAgentReply(result)` for conservative chat text. It does not echo
source content, titles, workspace names, URLs, recipient IDs, backend error
messages or tokens. Do not send `JSON.stringify(result)` into ACP or logs. Current
replies direct the user to Vortex for details/approval; full ASI:One conversation
parity, source previews and remote execution are explicitly incomplete.

## Remaining integration gates

Andrew must supply authenticated linking, scoped inventory/selection, canonical
runtime validators, shared persistence/idempotency and response-disclosure policy.
Josh must supply the executor's actual availability/unlocked/revision/approval
checks before remote effects can be enabled. Nathan's providers feed the same
shared services. None of these dependencies are implemented by this adapter.

Offline tests use explicitly labeled doubles. They prove dispatch and denial
behavior, not real authentication, live phone delivery, or Fetch eligibility.
