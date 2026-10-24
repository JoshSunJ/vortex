// Typed Vortex API client for the dashboard, phone, desktop and tests. Every response is
// runtime-validated against the contract; methods return the Result envelope and never throw for
// API errors. Network failures and invalid responses become INTERNAL_ERROR / PROVIDER_TIMEOUT.
import {
  Delivery,
  Operation,
  PlanOrClarification,
  ReadProgress,
  ResultOf,
  SCHEMA_VERSION,
  Snapshot,
  Workspace,
  type ErrorCode,
  type Result,
} from "@vortex/contracts";
import type { z } from "zod";
import * as S from "./schemas";

export type ClientOptions = {
  baseUrl: string;
  /** Bearer token, or a function returning the current one (lets the phone swap tokens after pairing). */
  token: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type VortexClient = ReturnType<typeof createClient>;

export function createClient({ baseUrl, token, fetch: fetchImpl = globalThis.fetch, timeoutMs = 20_000 }: ClientOptions) {
  const root = baseUrl.replace(/\/+$/, "");

  async function call<T extends z.ZodType>(
    schema: T,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Result<z.infer<T>>> {
    const bearer = typeof token === "function" ? await token() : token;
    let response: Response;
    try {
      response = await fetchImpl(`${root}/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      return localError(timedOut ? "PROVIDER_TIMEOUT" : "INTERNAL_ERROR", timedOut ? "API request timed out" : "API unreachable", true);
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return localError("INTERNAL_ERROR", `Non-JSON response (HTTP ${response.status})`, response.status >= 500);
    }
    const parsed = ResultOf(schema).safeParse(json);
    if (!parsed.success) return localError("INTERNAL_ERROR", "Response did not match the contract", false);
    return parsed.data as Result<z.infer<T>>;
  }

  const idem = (key: string = crypto.randomUUID()) => ({ "Idempotency-Key": key });

  return {
    getSnapshot: (deviceId: string) => call(Snapshot, "GET", `/snapshot?deviceId=${encodeURIComponent(deviceId)}`),
    listWorkspaces: (deviceId?: string) =>
      call(S.WorkspaceList, "GET", `/workspaces${deviceId === undefined ? "" : `?deviceId=${encodeURIComponent(deviceId)}`}`),
    createWorkspace: (req: S.WorkspaceCreateRequest, idempotencyKey?: string) =>
      call(Workspace, "POST", "/workspaces", req, idem(idempotencyKey)),
    updateWorkspace: (workspaceId: string, req: S.WorkspaceUpdateRequest) => call(Workspace, "PATCH", `/workspaces/${workspaceId}`, req),
    focusWorkspace: (workspaceId: string, req: S.WorkspacePlanRequest) =>
      call(PlanOrClarification, "POST", `/workspaces/${workspaceId}/focus`, req),
    resumeWorkspace: (workspaceId: string, req: S.WorkspacePlanRequest) =>
      call(PlanOrClarification, "POST", `/workspaces/${workspaceId}/resume`, req),
    createPlan: (req: S.PlanRequest) => call(PlanOrClarification, "POST", "/plans", req),
    approvePlan: (planId: string, req: S.ApproveRequest) => call(S.Approval, "POST", `/plans/${planId}/approve`, req),
    executePlan: (planId: string, req: S.ExecuteRequest) => call(Operation, "POST", `/plans/${planId}/execute`, req),
    getOperation: (operationId: string) => call(Operation, "GET", `/operations/${operationId}`),
    cancelOperation: (operationId: string) => call(Operation, "POST", `/operations/${operationId}/cancel`),
    /** Pass the same idempotencyKey when retrying, so a retry returns the original receipt. */
    createCheckpoint: (req: S.CheckpointRequest, idempotencyKey?: string) =>
      call(Operation, "POST", "/checkpoints", req, idem(idempotencyKey)),
    deleteCheckpoint: (checkpointId: string) => call(S.DeletionReceipt, "DELETE", `/checkpoints/${checkpointId}`),
    resumeCheckpoint: (checkpointId: string, req: S.ResumeRequest) =>
      call(PlanOrClarification, "POST", `/checkpoints/${checkpointId}/resume`, req),
    createBrief: (req: S.BriefRequest, idempotencyKey?: string) => call(Operation, "POST", "/briefs", req, idem(idempotencyKey)),
    getBrief: (briefId: string, version?: number) =>
      call(S.BriefView, "GET", `/briefs/${briefId}${version === undefined ? "" : `?version=${version}`}`),
    createDelivery: (req: S.DeliveryRequest) => call(Delivery, "POST", "/deliveries", req),
    updateReadProgress: (req: S.ReadProgressRequest) => call(ReadProgress, "POST", "/read-progress", req),
    createPairing: (req: S.PairingCreateRequest) => call(S.Pairing, "POST", "/pairings", req),
    claimPairing: (pairingId: string, req: S.PairingClaimRequest) => call(S.PendingPairing, "POST", `/pairings/${pairingId}/claim`, req),
    confirmPairing: (pairingId: string) => call(S.Device, "POST", `/pairings/${pairingId}/confirm`, { approved: true }),
    revokeDevice: (deviceId: string) => call(S.Revoked, "DELETE", `/devices/${deviceId}`),
  };
}

function localError(code: ErrorCode, message: string, retryable: boolean): Result<never> {
  return { schemaVersion: SCHEMA_VERSION, requestId: crypto.randomUUID(), ok: false, error: { code, message, retryable } };
}

export * from "./schemas";
