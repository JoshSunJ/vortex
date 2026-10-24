import { describe, expect, it, vi } from "vitest";
import { CartesiaReplies, REPLY_TEXT } from "../electron/replies.mjs";

function wav() { const b = new Uint8Array(60); b.set([82,73,70,70]); b.set([87,65,86,69],8); return b; }
describe("Cartesia spoken status responses (mock provider)", () => {
  it("sends only a fixed acknowledgement, never caller-provided content", async () => {
    const fetcher = vi.fn(async () => new Response(wav(), { headers: { "Content-Type": "audio/wav" } }));
    const speech = new CartesiaReplies(() => "test-key", fetcher);
    const result = await speech.speak("preview");
    expect(result.text).toBe(REPLY_TEXT.preview);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cartesia.ai/tts/bytes");
    expect(request.redirect).toBe("error");
    expect(JSON.parse(request.body as string)).toMatchObject({ transcript: REPLY_TEXT.preview, model_id: "sonic-3-2026-01-12", save: false, output_format: { container: "wav" } });
    expect(JSON.stringify(result)).not.toContain("test-key");
    await expect(speech.speak("Read my secret window title")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(speech.speak("__proto__")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("caches each static phrase without sharing mutable audio buffers", async () => {
    const fetcher = vi.fn(async () => new Response(wav()));
    const speech = new CartesiaReplies(() => "test-key", fetcher);
    const first = await speech.speak("ready"); new Uint8Array(first.audio)[0] = 0;
    const second = await speech.speak("ready");
    expect(second.cached).toBe(true); expect(new Uint8Array(second.audio)[0]).toBe(82);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("requires a key and sanitizes upstream failures without retrying", async () => {
    const fetcher = vi.fn(async () => new Response("private details test-key", { status: 403 }));
    const missing = new CartesiaReplies(() => undefined, fetcher);
    await expect(missing.speak("ready")).rejects.toMatchObject({ code: "DEVICE_OFFLINE" });
    expect(fetcher).not.toHaveBeenCalled();
    const speech = new CartesiaReplies(() => "test-key", fetcher);
    await expect(speech.speak("ready")).rejects.toMatchObject({ code: "CONTENT_UNAVAILABLE", message: "Cartesia could not create a voice reply. Read the result on screen." });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized or invalid reply audio before it can be played", async () => {
    for (const bytes of [new Uint8Array(1024 * 1024 + 1), new TextEncoder().encode("not a WAV response")]) {
      const speech = new CartesiaReplies(() => "test-key", async () => new Response(bytes));
      await expect(speech.speak("ready")).rejects.toMatchObject({ code: "CONTENT_UNAVAILABLE" });
    }
  });
  it("suppresses a late audio reply after cancellation", async () => {
    let finish!: (response: Response) => void;
    const speech = new CartesiaReplies(() => "test-key", () => new Promise<Response>(resolve => { finish = resolve; }));
    const pending = speech.speak("preview"); speech.cancel(); finish(new Response(wav()));
    await expect(pending).rejects.toMatchObject({ code: "EXPIRED" });
    expect(speech.cache.size).toBe(0);
  });
});
