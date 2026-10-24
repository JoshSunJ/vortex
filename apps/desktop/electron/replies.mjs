import { VoiceError } from "./voice.mjs";

// Fixed acknowledgements only. Titles, notes, URLs and transcripts never enter TTS requests.
export const REPLY_TEXT = Object.freeze({
  preview: "Review the proposed switch. Confirm when you are ready.",
  found: "I found matching open resources. Choose the one you want.",
  empty: "I could not find a matching open resource.",
  choose: "I need you to choose which item you mean.",
  create: "Review the selected resources, then save your workspace.",
  select: "Select the resources for your workspace first.",
  checkpoint: "Review your checkpoint note, then save it.",
  succeeded: "The approved actions completed.",
  failed: "That action did not complete. Check the result on screen.",
  help: "Check the command guidance on screen, then try again.",
  ready: "Voice replies are ready. Try find notes, or focus a saved workspace.",
});
export const REPLY_VOICE_ID = "e07c00bc-4134-4eae-9ea4-1a55fb45746b";
export class CartesiaReplies {
  constructor(getKey, fetcher = fetch) { this.getKey = getKey; this.fetcher = fetcher; this.pending = null; this.cache = new Map(); }
  cancel() { this.pending?.abort(); this.pending = null; return { cancelled: true }; }
  async speak(code) {
    if (typeof code !== "string" || !Object.hasOwn(REPLY_TEXT, code)) throw new VoiceError("VALIDATION_ERROR", "Unknown voice response.");
    this.cancel();
    const text = REPLY_TEXT[code];
    const key = this.getKey();
    if (!key) throw new VoiceError("DEVICE_OFFLINE", "Voice replies need a Cartesia key. The action preview is still available.");
    const cached = this.cache.get(code);
    if (cached) return { text, audio: cached.slice(0), mimeType: "audio/wav", cached: true };
    const controller = new AbortController(); this.pending = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetcher("https://api.cartesia.ai/tts/bytes", {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, "Cartesia-Version": "2026-08-14", "Content-Type": "application/json", Accept: "audio/wav" },
        body: JSON.stringify({ model_id: "sonic-3-2026-01-12", transcript: text, voice: REPLY_VOICE_ID, language: "en", output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 24000 }, save: false }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new VoiceError("CONTENT_UNAVAILABLE", "Cartesia could not create a voice reply. Read the result on screen."); }
      const reader = response.body?.getReader();
      if (!reader) throw new VoiceError("CONTENT_UNAVAILABLE", "Cartesia returned no reply audio.");
      let size = 0; const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024) throw new VoiceError("CONTENT_UNAVAILABLE", "The voice reply was too large.");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (controller.signal.aborted) throw new VoiceError("EXPIRED", "Voice reply cancelled.");
      const wav = Buffer.concat(chunks);
      if (wav.length < 44 || wav.toString("ascii",0,4) !== "RIFF" || wav.toString("ascii",8,12) !== "WAVE") throw new VoiceError("CONTENT_UNAVAILABLE", "The reply audio format was invalid.");
      const audio = Uint8Array.from(wav).buffer;
      this.cache.set(code, audio);
      return { text, audio: audio.slice(0), mimeType: "audio/wav", cached: false };
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      throw new VoiceError("CONTENT_UNAVAILABLE", controller.signal.aborted ? "Voice reply stopped or timed out." : "Voice reply unavailable. Read the result on screen.");
    } finally { clearTimeout(timeout); if (this.pending === controller) this.pending = null; }
  }
}
