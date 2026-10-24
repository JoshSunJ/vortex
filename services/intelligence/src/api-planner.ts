import { Clarification, ENABLED_ACTION_KINDS, Id, PlanOrClarification, Snapshot, WorkspaceCommand } from '@vortex/contracts';
import { requireScopes } from '../../api/src/auth';
import { ApiError } from '../../api/src/envelope';
import { PlanRequest, WorkspaceList } from '../../api/src/schemas';
import type { Services } from '../../api/src/services';
import { resolveWorkspaceRequest } from './workspace-router.mjs';

/** Enable B planning on an existing Services object while preserving its label
 * and method bindings. No other service implementation is replaced.
 */
export function withApiPlanner(services: Services): Services {
  const planner = createApiPlanner(services);
  return new Proxy(services, {
    get(target, key) {
      if (key === 'createPlan') return planner;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Implement Services.createPlan without adding an API route, store or executor.
 * The caller supplies existing authenticated shared services, not a fixture
 * implementation selected silently by this module. The services' label stays
 * unchanged. Focus/resume return the exact stored plan; never rewrite its hash.
 */
export function createApiPlanner(services: Pick<Services,
  'getSnapshot' | 'listWorkspaces' | 'planWorkspaceFocus' | 'planWorkspaceResume'>): Services['createPlan'] {
  return async (auth, request) => {
    if (!Id.safeParse(auth?.userId).success || !Id.safeParse(auth?.deviceId).success || !Array.isArray(auth?.scopes)) {
      throw new ApiError('UNAUTHORIZED', 'A backend-verified identity is required.');
    }
    requireScopes(auth, ['metadata:read', 'desktop:control']);
    const parsed = PlanRequest.safeParse(request);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'Invalid planning request.');
    const req = parsed.data;
    if (auth.deviceId !== req.deviceId) throw new ApiError('FORBIDDEN', 'The request must use the authenticated device.');

    const clarify = (question: string, options: { id: string; label: string; resourceIds: string[] }[] = []) =>
      Clarification.parse({ kind: 'clarification', commandId: req.commandId, question, options });
    try {
      // Backend-scoped data only. Request JSON cannot provide inventory or
      // ownership. Shared services enforce ownership/revocation on every call.
      const snapshot = Snapshot.parse(await services.getSnapshot(auth, auth.deviceId));
      if (snapshot.deviceId !== auth.deviceId || snapshot.resources.some((resource) => resource.deviceId !== auth.deviceId)) {
        throw new ApiError('FORBIDDEN', 'Snapshot device mismatch.');
      }
      if (snapshot.revision !== req.snapshotRevision) throw new ApiError('STALE_STATE', 'Refresh the inventory before planning.');
      if (new Set(req.selectedResourceIds).size !== req.selectedResourceIds.length ||
          req.selectedResourceIds.some((id) => !snapshot.resources.some((resource) =>
            resource.id === id && resource.deviceId === auth.deviceId))) {
        throw new ApiError('FORBIDDEN', 'Select only current resources on this device.');
      }
      const list = WorkspaceList.parse(await services.listWorkspaces(auth, auth.deviceId));
      const workspaces = list.workspaces.map((card) => card.workspace);
      if (workspaces.some((workspace) => workspace.deviceId !== auth.deviceId)) {
        throw new ApiError('FORBIDDEN', 'Workspace device mismatch.');
      }
      const resolution = resolveWorkspaceRequest({ text: req.text, deviceId: auth.deviceId,
        workspaces, resources: snapshot.resources });
      if (resolution.kind === 'ambiguous') {
        return clarify(resolution.question, resolution.candidates.map((candidate) => ({
          id: candidate.workspaceId, label: candidate.name, resourceIds: candidate.resourceIds,
        })));
      }
      if (resolution.kind === 'error') {
        if (resolution.code === 'NEEDS_CLARIFICATION' || resolution.code === 'VALIDATION_ERROR') {
          return clarify('Use focus or resume followed by a saved workspace name. Create workspaces and save notes with their dedicated forms.');
        }
        throw new ApiError(resolution.code, 'No authorized matching workspace is available.');
      }
      const command = WorkspaceCommand.parse(resolution.command);
      if (command.kind !== 'focus_workspace' && command.kind !== 'resume_workspace') {
        return clarify('This endpoint prepares focus/resume plans only. Use search, workspace, checkpoint, or brief services for other commands.');
      }
      const method = command.kind === 'focus_workspace' ? services.planWorkspaceFocus : services.planWorkspaceResume;
      const result = PlanOrClarification.parse(await method.call(services, auth, command.workspaceId, {
        deviceId: auth.deviceId, snapshotRevision: req.snapshotRevision,
      }));
      const allowedActions = new Set(['activate_tab', 'group_tabs', 'focus_window',
        ...(command.kind === 'resume_workspace' ? ['open_saved_url'] : [])]);
      if (result.kind === 'plan' && (result.deviceId !== auth.deviceId ||
          result.workspaceId !== command.workspaceId || result.snapshotRevision !== req.snapshotRevision ||
          result.actions.some(({ action }) => !allowedActions.has(action.kind) ||
            !(ENABLED_ACTION_KINDS as readonly string[]).includes(action.kind)))) {
        throw new ApiError('INTERNAL_ERROR', 'The shared service returned an invalid workspace plan.');
      }
      return result;
    } catch (error) {
      // Recreate even known ApiErrors so private service messages cannot reach
      // the API error handler's response/logging path through this adapter.
      if (error instanceof ApiError) throw new ApiError(error.code, 'Workspace planning could not complete.', error.retryable);
      throw new ApiError('INTERNAL_ERROR', 'Could not validate the shared planning result.');
    }
  };
}
