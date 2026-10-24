// Result envelope and typed API errors (contracts/ANDREW.md section 08 and Appendix D).
import { SCHEMA_VERSION, type ErrorCode, type Result } from "@vortex/contracts";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** HTTP status for each error code. Clients must still read the envelope, not the status. */
export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STALE_STATE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  FOCUS_DENIED: 409,
  EXPIRED: 410,
  NEEDS_CLARIFICATION: 422,
  PROTECTED: 423,
  APPROVAL_REQUIRED: 428,
  CONTENT_UNAVAILABLE: 502,
  DEVICE_OFFLINE: 503,
  PROVIDER_TIMEOUT: 504,
  STORAGE_FAILED: 500,
  INTERNAL_ERROR: 500,
};

export function ok<T>(requestId: string, data: T): Result<T> {
  return { schemaVersion: SCHEMA_VERSION, requestId, ok: true, data };
}

export function fail(requestId: string, error: ApiError): Result<never> {
  return {
    schemaVersion: SCHEMA_VERSION,
    requestId,
    ok: false,
    error: { code: error.code, message: error.message, retryable: error.retryable },
  };
}
