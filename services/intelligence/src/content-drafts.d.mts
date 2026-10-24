import type { Brief, Checkpoint, Resource, Result, Source, Workspace } from '@vortex/contracts';

export type DraftContext = { userId: string; deviceId: string; signal?: AbortSignal };
export type DraftInput = {
  workspace: Workspace; resources: Resource[]; sources: Source[]; sourceIds: string[];
  userNote?: string; metadataOnly?: boolean;
};
export type BriefInput = DraftInput & {
  format: Brief['format']; audience: Brief['audience']; title?: string;
};
export type DraftDependencies = {
  contracts: Record<'workspace' | 'resource' | 'source' | 'checkpoint' | 'brief', { parse(value: unknown): unknown }>;
  hashText(text: string): string | Promise<string>;
  authorize(context: DraftContext, disclosure: Readonly<Record<string, unknown>>): boolean | Promise<boolean>;
  model?: { providerId: string; modelId: string;
    complete(request: { messages: { role: string; content: string }[]; signal?: AbortSignal }): Promise<string> };
  clock?(): Date;
};
export function createContentDrafts(dependencies: DraftDependencies): {
  draftCheckpoint(input: DraftInput, context: DraftContext): Promise<Result<Checkpoint>>;
  draftBrief(input: BriefInput, context: DraftContext): Promise<Result<Brief>>;
};
