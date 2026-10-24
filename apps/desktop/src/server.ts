import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Id, Workspace, Plan, SCHEMA_VERSION } from "@vortex/contracts";
import { ControlEngine } from "./control.ts";
import { ControlError, ensure } from "./errors.ts";

export type ServerOptions = { token: string; extensionId?: string };
const Execute = z.strictObject({ operationId: Id, expectedRevision: z.number().int().nonnegative(), approvalId: Id.optional() });
const WorkPlan = z.strictObject({ workspace: Workspace, snapshotRevision: z.number().int().nonnegative() });
const Approve = z.strictObject({ planHash: z.string(), confirmed: z.literal(true) });
function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }

export function createControlServer(engine: ControlEngine, options: ServerOptions) {
  ensure(options.token.length >= 32, "VALIDATION_ERROR", "Control token must be at least 32 characters.");
  ensure(!options.extensionId || /^[a-p]{32}$/.test(options.extensionId), "VALIDATION_ERROR", "Use the exact Chrome/Edge extension ID.");
  const extensionOrigin = options.extensionId ? `chrome-extension://${options.extensionId}` : undefined;
  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Vortex-Control", "live-local-development");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const json = (status: number, data: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 8790;
      ensure(req.headers.host === `127.0.0.1:${port}`, "FORBIDDEN", "Only the exact loopback host is accepted.");
      const origin = req.headers.origin;
      if (origin) {
        ensure(extensionOrigin && origin === extensionOrigin, "FORBIDDEN", "Origin is not the configured extension.");
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        ensure(extensionOrigin && origin === extensionOrigin, "FORBIDDEN", "Preflight origin denied.");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.writeHead(204); res.end(); return;
      }
      ensure(equal(req.headers.authorization ?? "", `Bearer ${options.token}`), "UNAUTHORIZED", "Missing local control token.");
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname.startsWith("/bridge/")) ensure(extensionOrigin && origin === extensionOrigin, "FORBIDDEN", "The browser bridge requires the configured extension origin.");
      if (req.method === "POST") ensure(req.headers["content-type"]?.split(";")[0] === "application/json", "VALIDATION_ERROR", "Expected JSON request.");
      const body = req.method === "POST" ? await readBody(req) : undefined;
      if (req.method === "POST" && url.pathname === "/bridge/snapshot") { engine.browser.acceptSnapshot(body); json(200, { ok: true }); return; }
      if (req.method === "GET" && url.pathname === "/bridge/commands") { json(200, engine.browser.commands()); return; }
      if (req.method === "POST" && url.pathname === "/bridge/results") { engine.browser.result(body); json(200, { ok: true }); return; }
      let result: unknown;
      const match = /^\/control\/plans\/([0-9a-f-]+)\/(approve|execute)$/.exec(url.pathname);
      const op = /^\/control\/operations\/([0-9a-f-]+)(\/cancel)?$/.exec(url.pathname);
      if (req.method === "GET" && url.pathname === "/control/snapshot") result = await engine.getSnapshot();
      else if (req.method === "GET" && url.pathname === "/control/status") result = { browserConnected: Boolean(engine.browser.current()), deviceId: engine.deviceId, supportedActions: ["activate_tab", "group_tabs", "focus_window", "open_saved_url"], voiceConnected: false };
      else if (req.method === "POST" && url.pathname === "/control/plans") result = engine.registerPlan(Plan.parse(body));
      else if (req.method === "POST" && url.pathname === "/control/focus") result = await engine.planResourceFocus(z.strictObject({ resourceId: Id }).parse(body).resourceId);
      else if (req.method === "POST" && ["/control/workspaces/focus", "/control/workspaces/resume"].includes(url.pathname)) {
        const value = WorkPlan.parse(body);
        result = url.pathname.endsWith("/resume") ? await engine.planWorkspaceResume(value.workspace, value.snapshotRevision) : await engine.planWorkspaceFocus(value.workspace, value.snapshotRevision);
      } else if (req.method === "POST" && match) {
        const id = Id.parse(match[1]);
        if (match[2] === "approve") { const value = Approve.parse(body); result = engine.approvePlan(id, value.planHash); }
        else result = await engine.executePlan(id, Execute.parse(body));
      } else if (op) {
        const id = Id.parse(op[1]);
        if (req.method === "POST" && op[2]) result = engine.cancelOperation(id);
        else if (req.method === "GET" && !op[2]) result = engine.getOperation(id);
        else throw new ControlError("NOT_FOUND", "Route not found.");
      } else throw new ControlError("NOT_FOUND", "Route not found.");
      json(200, { schemaVersion: SCHEMA_VERSION, requestId, ok: true, data: result });
    } catch (err) {
      const known = err instanceof ControlError;
      const code = known ? err.code : err instanceof z.ZodError ? "VALIDATION_ERROR" : "INTERNAL_ERROR";
      const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "INTERNAL_ERROR" ? 500 : 400;
      json(status, { schemaVersion: SCHEMA_VERSION, requestId, ok: false, error: { code, message: known ? err.message : code === "VALIDATION_ERROR" ? "Request did not match the control contract." : "Local control operation failed.", retryable: code === "DEVICE_OFFLINE" } });
    }
  });
  server.headersTimeout = 10_000; server.requestTimeout = 20_000;
  return server;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    ensure(length <= 2 * 1024 * 1024, "VALIDATION_ERROR", "Request body is too large.");
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ControlError("VALIDATION_ERROR", "Malformed JSON."); }
}
