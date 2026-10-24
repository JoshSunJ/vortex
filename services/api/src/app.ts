// Vortex API v1 (contracts/ANDREW.md section 08 + Appendix D). Every route: verified bearer token ->
// scope check -> runtime-validated body -> Services call -> Result envelope. Runtime-agnostic (Web
// APIs only) so tests and the fixture client run it in-process; src/server.ts binds it to Node.
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Scope } from "@vortex/contracts";
import { requireScopes, type AuthContext, type Signer } from "./auth";
import { ApiError, HTTP_STATUS, fail, ok } from "./envelope";
import * as S from "./schemas";
import type { Services } from "./services";

type Env = { Variables: { requestId: string; auth: AuthContext } };

const MAX_BODY_BYTES = 256 * 1024;

export type AppOptions = { services: Services; signer: Signer };

export function createApp({ services, signer }: AppOptions) {
  const app = new Hono<Env>().basePath("/v1");
  const idempotency = createIdempotencyStore();

  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    c.header("X-Vortex-Services", services.label);
    await next();
  });

  app.use("*", async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(header);
    if (!match) throw new ApiError("UNAUTHORIZED", "Missing bearer token");
    c.set("auth", await signer.verify(match[1]!));
    await next();
  });

  app.onError((err, c) => {
    const apiError = err instanceof ApiError ? err : new ApiError("INTERNAL_ERROR", "Internal error", true);
    if (!(err instanceof ApiError)) console.error(`[${c.get("requestId")}]`, err);
    return send(c, HTTP_STATUS[apiError.code], fail(c.get("requestId"), apiError));
  });

  app.notFound((c) => send(c, 404, fail(c.get("requestId"), new ApiError("NOT_FOUND", "Route not found"))));

  const respond = <T>(c: Context<Env>, data: T, status = 200) => send(c, status, ok(c.get("requestId"), data));

  /** Validated, scope-checked mutation that replays its saved receipt for a repeated idempotency key. */
  async function mutation<T extends z.ZodType, R>(
    c: Context<Env>,
    scopes: readonly Scope[],
    schema: T,
    key: (body: z.infer<T>) => string | undefined,
    run: (auth: AuthContext, body: z.infer<T>) => Promise<R>,
    status = 200,
  ) {
    const auth = c.get("auth");
    requireScopes(auth, scopes);
    const body = await readBody(c, schema);
    const idemKey = key(body);
    if (idemKey === undefined) return respond(c, await run(auth, body), status);
    const scoped = `${auth.userId}|${c.req.method} ${c.req.routePath}|${c.req.path}|${idemKey}`;
    const saved = await idempotency.lookup(scoped, body);
    if (saved) return respond(c, saved.data as R, saved.status);
    const data = await run(auth, body);
    await idempotency.save(scoped, body, { data, status });
    return respond(c, data, status);
  }

  const headerKey = (c: Context<Env>) => () => {
    const value = c.req.header("Idempotency-Key");
    if (!value || value.length > 200) throw new ApiError("VALIDATION_ERROR", "Idempotency-Key header is required");
    return value;
  };
  const none = () => undefined;

  app.get("/snapshot", async (c) => {
    const auth = c.get("auth");
    requireScopes(auth, ["metadata:read"]);
    const deviceId = parse(z.object({ deviceId: z.uuid() }), c.req.query()).deviceId;
    assertCallingDevice(auth, deviceId);
    return respond(c, await services.getSnapshot(auth, deviceId));
  });

  // Workspaces (revision 1.3). Focus/resume return plans that run through approve/execute below.
  app.get("/workspaces", async (c) => {
    const auth = c.get("auth");
    requireScopes(auth, ["metadata:read"]);
    const { deviceId } = parse(z.object({ deviceId: z.uuid().optional() }), c.req.query());
    return respond(c, await services.listWorkspaces(auth, deviceId));
  });

  app.post("/workspaces", (c) =>
    mutation(c, ["metadata:read", "desktop:control"], S.WorkspaceCreateRequest, headerKey(c), (auth, body) => {
      assertCallingDevice(auth, body.deviceId);
      return services.createWorkspace(auth, body);
    }, 201),
  );

  app.patch("/workspaces/:id", (c) =>
    mutation(c, ["metadata:read", "desktop:control"], S.WorkspaceUpdateRequest, none, (auth, body) =>
      services.updateWorkspace(auth, uuidParam(c), body),
    ),
  );

  app.post("/workspaces/:id/focus", (c) =>
    mutation(c, ["desktop:control"], S.WorkspacePlanRequest, none, (auth, body) => {
      assertCallingDevice(auth, body.deviceId);
      return services.planWorkspaceFocus(auth, uuidParam(c), body);
    }),
  );

  app.post("/workspaces/:id/resume", (c) =>
    mutation(c, ["desktop:control"], S.WorkspacePlanRequest, none, (auth, body) => {
      assertCallingDevice(auth, body.deviceId);
      return services.planWorkspaceResume(auth, uuidParam(c), body);
    }),
  );

  app.post("/plans", (c) =>
    mutation(c, ["metadata:read", "desktop:control"], S.PlanRequest, none, (auth, body) => {
      assertCallingDevice(auth, body.deviceId);
      return services.createPlan(auth, body);
    }),
  );

  app.post("/plans/:id/approve", (c) =>
    mutation(c, ["desktop:control"], S.ApproveRequest, none, (auth, body) => services.approvePlan(auth, uuidParam(c), body)),
  );

  app.post("/plans/:id/execute", (c) =>
    mutation(c, ["desktop:control"], S.ExecuteRequest, (b) => b.operationId, (auth, body) => services.executePlan(auth, uuidParam(c), body), 202),
  );

  app.get("/operations/:id", async (c) => {
    const auth = c.get("auth");
    requireScopes(auth, ["metadata:read"]);
    return respond(c, await services.getOperation(auth, uuidParam(c)));
  });

  app.post("/operations/:id/cancel", (c) =>
    mutation(c, ["desktop:control"], z.object({}).optional(), none, (auth) => services.cancelOperation(auth, uuidParam(c))),
  );

  app.post("/checkpoints", (c) =>
    mutation(c, ["content:read"], S.CheckpointRequest, headerKey(c), (auth, body) => services.createCheckpoint(auth, body), 202),
  );

  app.delete("/checkpoints/:id", async (c) => {
    const auth = c.get("auth");
    requireScopes(auth, ["desktop:control"]);
    return respond(c, await services.deleteCheckpoint(auth, uuidParam(c)));
  });

  app.post("/checkpoints/:id/resume", (c) =>
    mutation(c, ["desktop:control"], S.ResumeRequest, none, (auth, body) => {
      assertCallingDevice(auth, body.deviceId);
      return services.resumeCheckpoint(auth, uuidParam(c), body);
    }),
  );

  app.post("/briefs", (c) =>
    mutation(c, ["content:read"], S.BriefRequest, headerKey(c), (auth, body) => services.createBrief(auth, body), 202),
  );

  app.get("/briefs/:id", async (c) => {
    const auth = c.get("auth");
    requireScopes(auth, ["brief:read"]);
    const { version } = parse(z.object({ version: z.coerce.number().int().positive().optional() }), c.req.query());
    return respond(c, await services.getBrief(auth, uuidParam(c), version));
  });

  app.post("/deliveries", (c) =>
    mutation(c, ["brief:deliver"], S.DeliveryRequest, (b) => b.operationId, (auth, body) => services.createDelivery(auth, body)),
  );

  app.post("/read-progress", (c) =>
    mutation(c, ["progress:write"], S.ReadProgressRequest, none, (auth, body) => services.updateReadProgress(auth, body)),
  );

  app.post("/pairings", (c) =>
    mutation(c, ["desktop:control"], S.PairingCreateRequest, none, (auth, body) => services.createPairing(auth, body.desktopDeviceId)),
  );

  // Claim needs only an authenticated user identity: the phone has no device scopes until confirmed.
  app.post("/pairings/:id/claim", (c) =>
    mutation(c, [], S.PairingClaimRequest, none, (auth, body) => services.claimPairing(auth, uuidParam(c), body)),
  );

  app.post("/pairings/:id/confirm", (c) =>
    mutation(c, ["desktop:control"], S.PairingConfirmRequest, none, (auth) => services.confirmPairing(auth, uuidParam(c))),
  );

  app.delete("/devices/:id", async (c) => {
    const auth = c.get("auth");
    requireScopes(auth, ["desktop:control"]);
    return respond(c, await services.revokeDevice(auth, uuidParam(c)));
  });

  return app;
}

function send(c: Context<Env>, status: number, body: unknown) {
  return c.json(body, status as 200);
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError("VALIDATION_ERROR", z.prettifyError(result.error));
  return result.data;
}

async function readBody<T extends z.ZodType>(c: Context<Env>, schema: T): Promise<z.infer<T>> {
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError("VALIDATION_ERROR", "Request body too large");
  if (text.trim() === "") return parse(schema, undefined);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Body must be JSON");
  }
  return parse(schema, json);
}

function uuidParam(c: Context<Env>): string {
  return parse(z.uuid(), c.req.param("id"));
}

/** A device may only act as itself; request JSON never chooses the acting identity. */
function assertCallingDevice(auth: AuthContext, deviceId: string) {
  if (deviceId !== auth.deviceId) throw new ApiError("FORBIDDEN", "deviceId does not match the authenticated device");
}

// Idempotency (Appendix D): same key + same body replays the saved receipt; same key + changed body
// is IDEMPOTENCY_CONFLICT. In-memory for the skeleton; durable storage moves with persistence.
function createIdempotencyStore() {
  const entries = new Map<string, { bodyHash: string; result: { data: unknown; status: number } }>();
  const hash = async (body: unknown) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(body)));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  };
  return {
    async lookup(key: string, body: unknown) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.bodyHash !== (await hash(body))) {
        throw new ApiError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used with a different request");
      }
      return entry.result;
    },
    async save(key: string, body: unknown, result: { data: unknown; status: number }) {
      entries.set(key, { bodyHash: await hash(body), result });
    },
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
