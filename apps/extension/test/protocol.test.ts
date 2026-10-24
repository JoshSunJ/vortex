import { describe, expect, it } from "vitest";
// Plain module is used directly by Chrome; its pure validation helpers need no browser mock.
// @ts-expect-error JavaScript extension module intentionally has no build dependency.
import { assertCurrentTarget, interruptedReceipt, isHttpUrl, tabMetadata, validateCommand } from "../src/protocol.js";

const id = "11111111-1111-4111-8111-111111111111";
const target = { tabId: 12, windowId: 3, expectedUrl: "https://example.org/research" };
describe("local bridge boundary", () => {
  it("rejects privileged schemes and embedded credentials", () => {
    for (const url of ["chrome://settings", "edge://extensions", "file:///secret", "javascript:alert(1)", "https://u:p@example.org/"]) expect(isHttpUrl(url)).toBe(false);
    expect(isHttpUrl("https://example.org/research")).toBe(true);
  });
  it("rejects arbitrary action kinds and extra executable fields", () => {
    expect(() => validateCommand({ id, kind: "shell", command: "anything" })).toThrow();
    expect(() => validateCommand({ id, kind: "activate_tab", ...target, script: "anything" })).toThrow();
  });
  it("prevents cross-window grouping and duplicate tab targets", () => {
    expect(() => validateCommand({ id, kind: "group_tabs", label: "Research", tabs: [target, { ...target, tabId: 13, windowId: 4 }] })).toThrow();
    expect(() => validateCommand({ id, kind: "group_tabs", label: "Research", tabs: [target, target] })).toThrow();
  });
  it("rejects navigation, recycled targets and incognito before a mutation", () => {
    const live = { id: 12, windowId: 3, url: target.expectedUrl, incognito: false };
    expect(() => assertCurrentTarget(live, target)).not.toThrow();
    for (const changed of [{ ...live, url: "https://example.org/new" }, { ...live, windowId: 4 }, { ...live, pendingUrl: target.expectedUrl }, { ...live, incognito: true }]) expect(() => assertCurrentTarget(changed, target)).toThrow();
  });
  it("publishes an explicit metadata allowlist and excludes protected contexts", () => {
    const tab = { id: 12, windowId: 3, url: target.expectedUrl, title: "Research", cookies: "never-send", text: "never-send", incognito: false, active: true };
    expect(tabMetadata(tab)).toEqual({ tabId: 12, windowId: 3, url: target.expectedUrl, title: "Research", active: true, pinned: false, audible: false });
    expect(tabMetadata({ ...tab, incognito: true })).toBeNull();
    expect(tabMetadata({ ...tab, url: "chrome://settings" })).toBeNull();
  });
  it("does not interpret an interrupted mutation as safe to repeat", () => {
    expect(interruptedReceipt(id)).toMatchObject({ id, ok: false, code: "STALE_STATE" });
  });
});
