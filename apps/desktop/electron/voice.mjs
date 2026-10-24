import { randomUUID } from "node:crypto";

export const MAX_AUDIO_BYTES = 1024 * 1024;
export const CAPTURE_SECONDS = 15;
export class VoiceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (condition, code, message) => { if (!condition) throw new VoiceError(code, message); };

function validateAudio(audio, mimeType) {
  fail(audio instanceof ArrayBuffer, "VALIDATION_ERROR", "The recording must contain audio bytes.");
  const bytes = new Uint8Array(audio);
  fail(bytes.length >= 44 && bytes.length <= MAX_AUDIO_BYTES, "VALIDATION_ERROR", "Record a short command, up to 15 seconds and 1 MB.");
  const type = String(mimeType).split(";")[0];
  const magic = Array.from(bytes.slice(0,4));
  const valid = type === "audio/webm" ? magic.join() === "26,69,223,163" : type === "audio/ogg" ? magic.join() === "79,103,103,83" : type === "audio/wav" ? magic.join() === "82,73,70,70" && String.fromCharCode(...bytes.slice(8,12)) === "WAVE" : false;
  fail(valid, "VALIDATION_ERROR", "The recording format is not supported. Try recording again.");
  return { bytes, type, extension: type === "audio/webm" ? "webm" : type === "audio/ogg" ? "ogg" : "wav" };
}

/** One explicit recording lease, one upload, no retry or audio persistence. */
export class CartesiaVoice {
  constructor(getKey, fetcher = fetch, now = Date.now) { this.getKey = getKey; this.fetcher = fetcher; this.now = now; this.capture = null; this.inflight = null; }
  status() { return { configured: Boolean(this.getKey()), provider: "Cartesia", model: "ink-whisper", maxSeconds: CAPTURE_SECONDS, lastSuccessfulAt: this.lastSuccessfulAt }; }
  arm() {
    fail(this.getKey(), "DEVICE_OFFLINE", "Add your Cartesia API key to apps/desktop/.env.local, then check voice setup again.");
    fail(!this.inflight, "VALIDATION_ERROR", "Wait for the current transcription or cancel it first.");
    const id = randomUUID(), expiresAt = this.now() + 30_000;
    this.capture = { id, expiresAt };
    return { captureId: id, expiresAt, maxSeconds: CAPTURE_SECONDS };
  }
  canRecord() { return Boolean(this.capture && this.now() < this.capture.expiresAt); }
  cancel(id) {
    if (this.capture?.id === id) this.capture = null;
    if (this.inflight?.id === id) this.inflight.controller.abort();
    return { cancelled: true };
  }
  async transcribe(input) {
    const { captureId, audio, mimeType } = input ?? {};
    fail(this.capture?.id === captureId && this.canRecord(), "EXPIRED", "This recording expired or was already submitted. Record a new command.");
    this.capture = null; // Consume before validation/network; never repeat a billed request automatically.
    const { bytes, type, extension } = validateAudio(audio, mimeType);
    const key = this.getKey();
    fail(key, "DEVICE_OFFLINE", "The Cartesia key is missing. Typed commands still work.");
    const body = new FormData();
    body.set("file", new Blob([bytes], { type }), `command.${extension}`);
    body.set("model", "ink-whisper"); body.set("language", "en");
    const controller = new AbortController();
    this.inflight = { id: captureId, controller };
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetcher("https://api.cartesia.ai/stt", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Cartesia-Version": "2026-08-14" },
        body, redirect: "error", signal: controller.signal,
      });
      // Provider response bodies may contain private transcript/key details. Never echo errors.
      fail(response.status !== 401 && response.status !== 403, "UNAUTHORIZED", "Cartesia rejected the API key. Check its speech-to-text access.");
      fail(response.status !== 429, "PROVIDER_TIMEOUT", "Cartesia is busy or out of available credits. Try typed commands.");
      fail(response.ok, "CONTENT_UNAVAILABLE", "Cartesia could not transcribe this recording. Try again or type your command.");
      const length = Number(response.headers.get("content-length") ?? 0);
      fail(length <= 64 * 1024, "CONTENT_UNAVAILABLE", "The transcription response was too large.");
      const reader = response.body?.getReader();
      fail(reader, "CONTENT_UNAVAILABLE", "Cartesia returned no transcription.");
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          fail(size <= 64 * 1024, "CONTENT_UNAVAILABLE", "The transcription response was too large.");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      fail(!controller.signal.aborted, "EXPIRED", "The transcription was cancelled. Your command was not executed.");
      fail(typeof value.text === "string" && value.text.trim().length > 0 && value.text.length <= 2400, "CONTENT_UNAVAILABLE", "No short spoken command was recognized. Try again or type it.");
      this.lastSuccessfulAt = new Date(this.now()).toISOString();
      return { text: value.text.trim(), provider: "Cartesia", model: "ink-whisper" };
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      throw new VoiceError(controller.signal.aborted ? "PROVIDER_TIMEOUT" : "CONTENT_UNAVAILABLE", controller.signal.aborted ? "Transcription stopped or timed out. Your command was not executed." : "Cartesia could not be reached or returned an invalid transcription. Try typing the command.");
    } finally { clearTimeout(timeout); this.inflight = null; }
  }
}
