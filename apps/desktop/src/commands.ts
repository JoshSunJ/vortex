import { z } from "zod";
import { WorkspaceCommand, type Plan, type Resource } from "@vortex/contracts";
import { ControlEngine } from "./control.ts";
import { LocalWorkspaces } from "./workspaces.ts";
import { resolveWorkspaceRequest } from "../../../services/intelligence/src/workspace-router.mjs";

export const CommandRequest = z.strictObject({ text: z.string().trim().min(1).max(2400) });
type Choice = { id: string; label: string; kind: "workspace" | "resource" };
export type CommandResult =
  | { kind: "plan"; plan: Plan }
  | { kind: "find"; query: string; resources: Resource[] }
  | { kind: "create_workspace"; name: string }
  | { kind: "checkpoint"; workspaceId: string; workspaceName: string; userNote: string }
  | { kind: "clarification"; message: string; choices: Choice[]; intent?: "focus" | "resume" | "checkpoint"; userNote?: string };

const clean = (value: string) => value.trim().replace(/[.!?]+$/, "").trim().replace(/^["“]|["”]$/g, "");
const normalized = (value: string) => clean(value).normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const help = "Try ‘find notes’, ‘focus Research’, ‘resume Research’, ‘create workspace Research’, or ‘save checkpoint for Research saying compare the costs’.";

/** Bounded local command grammar. No model, shell, arbitrary app action or automatic mutation. */
export class LocalCommands {
  private readonly workspaces: LocalWorkspaces;
  constructor(private readonly engine: ControlEngine) { this.workspaces = new LocalWorkspaces(engine); }
  async resolve(input: unknown): Promise<CommandResult> {
    const { text } = CommandRequest.parse(input);
    const command = text.replace(/^please\s+/i, "").trim();
    const clarify = (message: string): CommandResult => ({ kind: "clarification", message, choices: [] });
    let match = /^(?:find|search for)\s+(.+)$/i.exec(command);
    if (match) {
      const query = clean(match[1]!);
      if (!query) return clarify(help);
      const snapshot = await this.engine.getSnapshot();
      const words = normalized(query).split(" ");
      const resources = snapshot.resources.filter(r => words.every(word => normalized(`${r.title} ${r.appName ?? ""} ${r.url ?? ""}`).includes(word)));
      return { kind: "find", query, resources };
    }
    match = /^create\s+(?:a\s+)?workspace\s+(?:(?:called|named)\s+)?(.+)$/i.exec(command);
    if (match) {
      const name = clean(match[1]!);
      return name && name.length <= 100 ? { kind: "create_workspace", name } : clarify("Use a workspace name between 1 and 100 characters.");
    }
    const checkpoint = /^save\s+(?:a\s+)?checkpoint\s+(?:for\s+)?(.+?)(?::\s*|\s+saying\s+)([\s\S]+)$/i.exec(command);
    match = /^(focus|resume|continue|switch to)\s+(?:workspace\s+)?(.+)$/i.exec(command);
    if (!checkpoint && !match) return clarify(/^send\b/i.test(command) ? "Phone delivery is not connected yet. Your workspace and checkpoint can still be saved locally." : help);
    const intent = checkpoint ? "checkpoint" : /^(resume|continue)$/i.test(match![1]!) ? "resume" : "focus";
    const name = clean(checkpoint ? checkpoint[1]! : match![2]!);
    const userNote = checkpoint?.[2]?.trim();
    if (userNote && userNote.length > 2000) return clarify("Keep the checkpoint note under 2,000 characters.");
    const entries = this.workspaces.list().workspaces;
    if (intent !== "checkpoint") {
      // Voice and typed input share B's exact workspace resolution with the API.
      // Only A's existing workspace service creates the stored approval plan.
      const resolution = resolveWorkspaceRequest({ text: `${intent} ${name}`, deviceId: this.engine.deviceId,
        workspaces: entries.map(entry => entry.workspace) });
      if (resolution.kind === "command") {
        const value = WorkspaceCommand.parse(resolution.command);
        if (value.kind === "focus_workspace" || value.kind === "resume_workspace") {
          return { kind: "plan", plan: await this.workspaces.preview(value.workspaceId, intent) };
        }
      } else if (resolution.kind === "ambiguous") {
        return { kind: "clarification", intent, message: resolution.question,
          choices: resolution.candidates.slice(0, 20).map(candidate => ({
            id: candidate.workspaceId, label: candidate.name, kind: "workspace",
          })) };
      } else if (resolution.code !== "NOT_FOUND" && !(intent === "focus" && name.length > 100)) {
        return clarify("The saved workspace request could not be resolved. Check its name and refresh the app.");
      }
    }
    const exact = entries.filter(x => normalized(x.workspace.name) === normalized(name));
    // Never guess from a partial workspace name; a user chooses a concrete saved ID.
    const candidates = exact.length ? exact : entries.filter(x => normalized(x.workspace.name).includes(normalized(name)));
    if (intent === "checkpoint" && exact.length === 1) {
      const workspace = exact[0]!.workspace;
      return { kind: "checkpoint", workspaceId: workspace.id, workspaceName: workspace.name, userNote: userNote! };
    }
    if (candidates.length) return { kind: "clarification", intent, userNote, message: "Choose the saved workspace you mean.", choices: candidates.slice(0,20).map(x => ({ id: x.workspace.id, label: x.workspace.name, kind: "workspace" })) };
    if (intent === "focus") {
      const snapshot = await this.engine.getSnapshot();
      const matching = snapshot.resources.filter(r => normalized(r.title) === normalized(name));
      if (matching.length === 1) return { kind: "plan", plan: await this.engine.planResourceFocus(matching[0]!.id) };
      const possible = matching.length ? matching : snapshot.resources.filter(r => normalized(`${r.title} ${r.appName ?? ""}`).includes(normalized(name)));
      if (possible.length) return { kind: "clarification", intent, message: "Choose the live window or tab you mean.", choices: possible.slice(0,20).map(r => ({ id: r.id, label: r.title, kind: "resource" })) };
    }
    return clarify(`No matching saved workspace${intent === "focus" ? " or live target" : ""} was found. ${help}`);
  }
}
