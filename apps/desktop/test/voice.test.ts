import { describe, expect, it, vi } from "vitest";
import { CartesiaVoice } from "../electron/voice.mjs";

function recording() {
  const audio = new ArrayBuffer(60), bytes = new Uint8Array(audio);
  bytes.set([82,73,70,70]); bytes.set([87,65,86,69],8); // Synthetic header, no personal audio.
  return { audio, mimeType: "audio/wav" };
}
function setup(response = () => Promise.resolve(Response.json({ type: "transcript", text: "  find notes  " }))) {
  const fetcher = vi.fn(response), voice = new CartesiaVoice(() => "test-key", fetcher);
  const lease = voice.arm();
  return { voice, fetcher, input: { ...recording(), captureId: lease.captureId } };
}
describe("Cartesia adapter (mock provider; not live sponsor evidence)", () => {
  it("requires a key before enabling any recording lease", () => {
    const fetcher = vi.fn(), voice = new CartesiaVoice(() => undefined, fetcher);
    expect(voice.status().configured).toBe(false);
    expect(() => voice.arm()).toThrow("Cartesia API key");
    expect(voice.canRecord()).toBe(false); expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only audio with a private header to the fixed provider and returns text", async () => {
    const ctx = setup();
    expect(await ctx.voice.transcribe(ctx.input)).toEqual({ text: "find notes", provider: "Cartesia", model: "ink-whisper" });
    const [url, request] = ctx.fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cartesia.ai/stt");
    expect(request.headers).toMatchObject({ Authorization: "Bearer test-key", "Cartesia-Version": "2026-08-14" });
    expect(request.redirect).toBe("error");
    const fields: string[] = []; (request.body as FormData).forEach((_value, key) => fields.push(key));
    expect(fields).toEqual(["file", "model", "language"]);
    expect(ctx.voice.canRecord()).toBe(false);
    expect(JSON.stringify(ctx.voice.status())).not.toContain("test-key");
  });
  it("consumes leases once and rejects cancelled, expired or forged recordings", async () => {
    const ctx = setup(); await ctx.voice.transcribe(ctx.input);
    await expect(ctx.voice.transcribe(ctx.input)).rejects.toMatchObject({ code: "EXPIRED" });
    const cancelled = setup(); cancelled.voice.cancel(cancelled.input.captureId);
    await expect(cancelled.voice.transcribe(cancelled.input)).rejects.toMatchObject({ code: "EXPIRED" });
    let now = 0; const expired = new CartesiaVoice(() => "test-key", vi.fn(), () => now), lease = expired.arm(); now = 30_001;
    await expect(expired.transcribe({ ...recording(), captureId: lease.captureId })).rejects.toMatchObject({ code: "EXPIRED" });
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  });
  it("blocks oversized data and mismatched file signatures before any upload", async () => {
    for (const invalid of [{ audio: new ArrayBuffer(1024 * 1024 + 1), mimeType: "audio/wav" }, { audio: new ArrayBuffer(60), mimeType: "audio/webm" }, { ...recording(), mimeType: "text/plain" }]) {
      const ctx = setup();
      await expect(ctx.voice.transcribe({ ...ctx.input, ...invalid })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(ctx.fetcher).not.toHaveBeenCalled();
    }
  });
  it("never includes provider error bodies or key values in user errors", async () => {
    const ctx = setup(() => Promise.resolve(new Response("private upstream body test-key", { status: 401 })));
    await expect(ctx.voice.transcribe(ctx.input)).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Cartesia rejected the API key. Check its speech-to-text access." });
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects empty, invalid and excessive transcripts without a command side effect", async () => {
    for (const text of ["", " ", "x".repeat(2401), 123]) {
      const ctx = setup(() => Promise.resolve(Response.json({ text })));
      await expect(ctx.voice.transcribe(ctx.input)).rejects.toMatchObject({ code: "CONTENT_UNAVAILABLE" });
    }
    const tooLarge = setup(() => Promise.resolve(new Response("x".repeat(70_000))));
    await expect(tooLarge.voice.transcribe(tooLarge.input)).rejects.toMatchObject({ code: "CONTENT_UNAVAILABLE" });
  });
  it("cancels an in-flight upload without delivering a late transcript", async () => {
    let finish!: (response: Response) => void;
    const ctx = setup(() => new Promise<Response>(resolve => { finish = resolve; }));
    const pending = ctx.voice.transcribe(ctx.input);
    ctx.voice.cancel(ctx.input.captureId);
    finish(Response.json({ text: "focus Project notes" }));
    await expect(pending).rejects.toMatchObject({ code: "EXPIRED" });
    expect(ctx.voice.status().lastSuccessfulAt).toBeUndefined();
  });
});
