import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** Execute the real capture UI script against simulated media/IPC, without accessing a microphone. */
function setup(reviewFirst = false, delayedTranscript = false) {
  const elements = new Map<string, any>();
  const el = (id: string): any => {
    if (!elements.has(id)) elements.set(id, { id, value: "", textContent: "", hidden: false, disabled: false, checked: false, open: id === "voice-dialog", handlers: new Map<string, Function>(), addEventListener(event: string, fn: Function) { this.handlers.set(event,fn); }, close() { this.open = false; queueMicrotask(() => this.handlers.get("close")?.()); } });
    return elements.get(id);
  };
  el("voice-consent").checked = true; el("voice-review-first").checked = reviewFirst;
  const trackStop = vi.fn(), stopReply = vi.fn();
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] }));
  let finishTranscript!: (data: { text: string }) => void;
  const deferred = new Promise<{text:string}>(resolve => { finishTranscript = resolve; });
  const call = vi.fn(async (name: string) => {
    if (name === "beginVoiceCapture") return { captureId: "test-capture", maxSeconds: 15 };
    if (name === "transcribeVoice") return delayedTranscript ? deferred : { text: "focus Notes" };
    if (name === "cancelVoice") return { cancelled: true };
    throw Error("Unexpected call: " + name);
  });
  const review = vi.fn(async (_text: string, options: any) => { if (options.canApply()) options.beforeApply(); });
  let recorder: any;
  class Recorder {
    static isTypeSupported() { return true; }
    state = "inactive"; onstop: any; ondataavailable: any; onerror: any;
    constructor() { recorder = this; }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob([new Uint8Array(60)]) }); return this.onstop?.(); }
  }
  const context = createContext({ $: el, call, stopSpokenReply: stopReply, reviewCommand: review, action: vi.fn(), notice: vi.fn(), errorMessage: (e: any) => e.message, navigator: { mediaDevices: { getUserMedia } }, MediaRecorder: Recorder, Blob, performance: { now: () => 0 }, setInterval: () => 1, clearInterval: vi.fn(), window: { addEventListener: vi.fn() } });
  runInContext(readFileSync(new URL("../ui/voice.js", import.meta.url), "utf8"), context);
  runInContext("voiceUi.configured = true", context);
  return { el, call, review, trackStop, stopReply, getUserMedia, finishTranscript, start: () => runInContext("startRecording()", context) as Promise<void>, stop: () => recorder.stop() as Promise<void>, cancel: () => runInContext("cancelRecording()", context) as Promise<void> };
}
describe("voice transcript to preview flow", () => {
  it("automatically prepares the preview after transcription, without executing it", async () => {
    const ctx = setup(); expect(ctx.call).not.toHaveBeenCalled();
    await ctx.start(); await ctx.stop();
    expect(ctx.getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    expect(ctx.stopReply).toHaveBeenCalledTimes(1);
    expect(ctx.trackStop).toHaveBeenCalled();
    expect(ctx.review).toHaveBeenCalledWith("focus Notes", expect.objectContaining({ canApply: expect.any(Function), beforeApply: expect.any(Function) }));
    expect(ctx.el("voice-dialog").open).toBe(false);
    expect(ctx.el("command-text").value).toBe("focus Notes");
    expect(ctx.call.mock.calls.map(c => c[0])).toEqual(["beginVoiceCapture", "transcribeVoice"]);
  });
  it("retains transcript-first mode when explicitly selected", async () => {
    const ctx = setup(true); await ctx.start(); await ctx.stop();
    expect(ctx.el("voice-dialog").open).toBe(true);
    expect(ctx.el("voice-transcript").value).toBe("focus Notes");
    expect(ctx.review).not.toHaveBeenCalled();
  });
  it("discards a late transcript after the user cancels", async () => {
    const ctx = setup(false,true); await ctx.start(); const pending = ctx.stop();
    await ctx.cancel(); ctx.finishTranscript({ text: "focus Notes" }); await pending;
    expect(ctx.review).not.toHaveBeenCalled();
    expect(ctx.el("voice-transcript").value).toBe("");
    expect(ctx.trackStop).toHaveBeenCalled();
  });
  it("does not open a late preview after cancellation during planning", async () => {
    const ctx = setup(); let finish!: () => void;
    ctx.review.mockImplementation(async (_text, options) => { await new Promise<void>(resolve => { finish = resolve; }); if (options.canApply()) options.beforeApply(); });
    await ctx.start(); const pending = ctx.stop();
    await vi.waitFor(() => expect(ctx.review).toHaveBeenCalled());
    await ctx.cancel(); finish(); await pending;
    expect(ctx.el("voice-dialog").open).toBe(true);
    expect(ctx.call.mock.calls.some(c => c[0] === "executeApproved")).toBe(false);
  });
});
