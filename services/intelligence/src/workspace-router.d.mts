import type { ErrorCode, WorkspaceCommand } from '@vortex/contracts';

/** Private resolver result; canonical commands are imported rather than copied. */
export type WorkspaceResolution =
  | { kind: 'command'; command: WorkspaceCommand }
  | { kind: 'error'; code: ErrorCode; message: string }
  | { kind: 'ambiguous'; question: string;
      candidates: { workspaceId: string; name: string; resourceIds: string[] }[] };

export function resolveWorkspaceRequest(input: unknown): WorkspaceResolution;
export function dispatchWorkspaceRequest(input: unknown, dependencies?: unknown): Promise<unknown>;
