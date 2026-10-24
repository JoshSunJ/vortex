import type { ErrorCode } from "@vortex/contracts";

export class ControlError extends Error {
  constructor(public readonly code: ErrorCode, message: string) { super(message); }
}
export function ensure(value: unknown, code: ErrorCode, message: string): asserts value {
  if (!value) throw new ControlError(code, message);
}
