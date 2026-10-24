import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { Workspace, type Checkpoint, type Resource, type Source, type Operation } from "@vortex/contracts";
import { ControlEngine, canonical } from "./control.ts";
import { ensure } from "./errors.ts";

export const CreateWorkspace = z.strictObject({
  name: z.string().trim().min(1).max(100), goal: z.string().trim().max(2000),
  selectedResourceIds: z.array(z.uuid()).min(1).max(100),
  primaryTabId: z.uuid().optional(), primaryWindowId: z.uuid().optional(),
  expectedSnapshotRevision: z.number().int().nonnegative(),
});
export const SaveCheckpoint = z.strictObject({ workspaceId: z.uuid(), userNote: z.string().trim().max(2000) });

/** Single local Workspace entity, same IDs as the API's Task projection. Cloud sync is not implied. */
export class LocalWorkspaces {
  constructor(private readonly engine: ControlEngine) {}
  private get(id: string): Workspace {
    const value = this.engine.journal.get<Workspace>(`workspace:${id}`);
    ensure(value && value.deviceId === this.engine.deviceId, "NOT_FOUND", "Workspace was not found on this computer.");
    return Workspace.parse(value);
  }
  list() {
    const workspaces = this.engine.journal.list<Workspace>("workspace:")
      .filter(w => w.deviceId === this.engine.deviceId)
      .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(workspace => {
        const saved = workspace.latestCheckpointId ? this.engine.journal.get<{ checkpoint: Checkpoint }>(`checkpoint:${workspace.latestCheckpointId}`) : undefined;
        return { workspace, ...(saved ? { latestCheckpoint: saved.checkpoint } : {}) };
      });
    return { workspaces };
  }
  async create(input: unknown) {
    const req = CreateWorkspace.parse(input);
    const snapshot = await this.engine.getSnapshot();
    ensure(snapshot.revision === req.expectedSnapshotRevision, "STALE_STATE", "Your open windows changed. Refresh before saving this selection.");
    const selected = new Set(req.selectedResourceIds);
    ensure(selected.size === req.selectedResourceIds.length, "VALIDATION_ERROR", "Select each resource once.");
    const members = snapshot.resources.filter(r => selected.has(r.id));
    ensure(members.length === selected.size, "STALE_STATE", "A selected window or tab is no longer available.");
    for (const [id, kind] of [[req.primaryTabId, "tab"], [req.primaryWindowId, "window"]] as const) {
      if (id) ensure(members.some(r => r.id === id && r.kind === kind), "VALIDATION_ERROR", "Primary targets must be selected members of the matching kind.");
    }
    ensure(req.primaryTabId || req.primaryWindowId, "VALIDATION_ERROR", "Choose at least one primary tab or application window.");
    const now = new Date().toISOString();
    const workspace = Workspace.parse({ id: randomUUID(), name: req.name, goal: req.goal, resourceIds: [...selected], deviceId: this.engine.deviceId, revision: 0, primaryTabId: req.primaryTabId, primaryWindowId: req.primaryWindowId, createdAt: now, updatedAt: now });
    this.engine.journal.set(`workspace:${workspace.id}`, workspace);
    return workspace;
  }
  async preview(id: string, mode: "focus" | "resume") {
    const workspace = this.get(id);
    const snapshot = await this.engine.getSnapshot();
    return mode === "resume" ? this.engine.planWorkspaceResume(workspace, snapshot.revision) : this.engine.planWorkspaceFocus(workspace, snapshot.revision);
  }
  async save(input: unknown): Promise<Checkpoint> {
    const req = SaveCheckpoint.parse(input), workspace = this.get(req.workspaceId);
    const snapshot = await this.engine.getSnapshot();
    const selected = snapshot.resources.filter(r => workspace.resourceIds.includes(r.id));
    const createdAt = new Date().toISOString();
    // Metadata only: no article/body text or native application contents are read.
    const sources: Source[] = selected.filter(r => r.kind === "tab" && r.url).slice(0,5).map(r => ({
      id: randomUUID(), resourceId: r.id, url: r.url!, title: r.title, retrievedAt: createdAt,
      contentHash: createHash("sha256").update(canonical({ url: r.url, title: r.title })).digest("hex"),
      extraction: "metadata", availability: "ready",
    }));
    const checkpoint: Checkpoint = {
      id: randomUUID(), taskId: workspace.id, userNote: req.userNote, createdAt, version: 1,
      resourceSnapshots: selected, sourceIds: sources.map(s => s.id),
      summary: req.userNote ? [{ text: req.userNote, sourceIds: [], basis: "user_stated" }] : [],
    };
    this.engine.registerCheckpointSources(checkpoint, sources);
    this.engine.journal.set(`workspace:${workspace.id}`, { ...workspace, revision: workspace.revision + 1, latestCheckpointId: checkpoint.id, updatedAt: createdAt });
    return checkpoint;
  }
  operations() {
    return { operations: this.engine.journal.list<{ operation: Operation }>("operation:").map(x => x.operation).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,30) };
  }
}
