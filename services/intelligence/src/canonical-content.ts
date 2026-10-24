import { Brief, Checkpoint, Resource, Source, Workspace } from '@vortex/contracts';
import { createContentDrafts, type DraftDependencies } from './content-drafts.mjs';

/** Use the team's actual runtime schemas. Consent, model, text normalization
 * and persistence remain the existing service's responsibilities.
 */
export function createCanonicalContentDrafts(dependencies: Omit<DraftDependencies, 'contracts'>) {
  return createContentDrafts({ ...dependencies, contracts: {
    workspace: Workspace, resource: Resource, source: Source, checkpoint: Checkpoint, brief: Brief,
  } });
}
