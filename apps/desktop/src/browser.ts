import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ErrorCode, HttpUrl } from "@vortex/contracts";
import { ControlError, ensure } from "./errors.ts";

export const BrowserTab = z.strictObject({
  tabId: z.number().int().nonnegative(), windowId: z.number().int().nonnegative(),
  title: z.string().max(500), url: HttpUrl.optional(), pendingUrl: z.string().max(2048).optional(),
  active: z.boolean(), pinned: z.boolean(), audible: z.boolean(), lastAccessed: z.number().nonnegative().optional(),
});
export type BrowserTab = z.infer<typeof BrowserTab>;
export const BrowserSnapshot = z.strictObject({ sessionId: z.uuid(), sequence: z.number().int().nonnegative(), tabs: z.array(BrowserTab).max(500) });
export type BrowserSnapshot = z.infer<typeof BrowserSnapshot>;
export const BrowserResult = z.strictObject({ id: z.uuid(), ok: z.boolean(), code: ErrorCode.optional(), message: z.string().max(2000).optional(), tabId: z.number().int().optional() });
export type BrowserResult = z.infer<typeof BrowserResult>;
export type BrowserCommand =
  | { id: string; kind: "activate_tab"; tabId: number; windowId: number; expectedUrl: string }
  | { id: string; kind: "group_tabs"; tabs: { tabId: number; windowId: number; expectedUrl: string }[]; label: string }
  | { id: string; kind: "open_saved_url"; url: string };

/** Explicitly enabled local development bridge, not a production native-messaging host. */
export class BrowserBridge {
  private snapshot?: BrowserSnapshot;
  private updatedAt = 0;
  private readonly pending = new Map<string, { command: BrowserCommand; resolve: (r: BrowserResult) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly timeoutMs = 12_000) {}
  acceptSnapshot(input: unknown) {
    const next = BrowserSnapshot.parse(input);
    ensure(!this.snapshot || this.snapshot.sessionId !== next.sessionId || next.sequence > this.snapshot.sequence, "STALE_STATE", "Out-of-order browser snapshot.");
    this.snapshot = next; this.updatedAt = Date.now();
  }
  current(): BrowserSnapshot | undefined {
    return Date.now() - this.updatedAt <= 35_000 ? this.snapshot : undefined;
  }
  commands() { return { commands: [...this.pending.values()].map(x => x.command) }; }
  result(input: unknown) {
    const result = BrowserResult.parse(input);
    const entry = this.pending.get(result.id);
    if (!entry) return;
    clearTimeout(entry.timer); this.pending.delete(result.id); entry.resolve(result);
  }
  async send(command: Omit<Extract<BrowserCommand, { kind: "activate_tab" }>, "id"> | Omit<Extract<BrowserCommand, { kind: "group_tabs" }>, "id"> | Omit<Extract<BrowserCommand, { kind: "open_saved_url" }>, "id">) {
    ensure(this.current(), "DEVICE_OFFLINE", "Browser bridge is not connected. Open the extension options and enable its development bridge.");
    const id = randomUUID();
    const result = await new Promise<BrowserResult>((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ id, ok: false, code: "PROVIDER_TIMEOUT", message: "Browser result is unknown; refresh before retrying with a new operation." }); }, this.timeoutMs);
      this.pending.set(id, { command: { ...command, id } as BrowserCommand, resolve, timer });
    });
    if (!result.ok) throw new ControlError(result.code ?? "INTERNAL_ERROR", result.message ?? "Browser command failed.");
    return result;
  }
}
