"use strict";

// This file only captures an explicit short microphone recording. Upload/key handling stays in main.
const voiceUi = { configured: false, phase: "idle", captureId: null, recorder: null, stream: null, timer: null, generation: 0, chunks: [], bytes: 0, handingOff: false };
function voiceFeedback(message) { $("voice-feedback").textContent = message; }
function voiceButtons() {
  const busy = voiceUi.phase !== "idle";
  $("voice-record").hidden = busy;
  $("voice-record").disabled = !voiceUi.configured || !$("voice-consent").checked;
  $("voice-stop").hidden = voiceUi.phase !== "recording";
  $("voice-cancel").hidden = !busy;
  $("voice-use").disabled = busy || !$("voice-transcript").value.trim();
  $("voice-consent").disabled = busy;
}
function releaseMic() {
  clearInterval(voiceUi.timer); voiceUi.timer = null;
  voiceUi.stream?.getTracks().forEach(track => track.stop()); voiceUi.stream = null;
}
async function cancelRecording() {
  voiceUi.generation++;
  const id = voiceUi.captureId; voiceUi.captureId = null;
  const recorder = voiceUi.recorder; voiceUi.recorder = null;
  if (recorder && recorder.state !== "inactive") { recorder.onstop = null; recorder.stop(); }
  releaseMic(); voiceUi.chunks = []; voiceUi.bytes = 0; voiceUi.phase = "idle";
  $("voice-timer").textContent = ""; voiceFeedback("Recording discarded or transcription cancelled. No command was executed."); voiceButtons();
  if (id) { try { await call("cancelVoice", id); } catch {} }
}
async function checkVoice() {
  try {
    const setup = await call("voiceStatus"); voiceUi.configured = setup.configured;
    $("voice-provider-status").textContent = setup.configured ? (setup.lastSuccessfulAt ? "Cartesia · transcription succeeded this session" : "Cartesia key configured · awaiting first transcription") : "Cartesia key needed · typed commands are ready";
    $("voice-setup").hidden = setup.configured;
  } catch (error) { voiceUi.configured = false; $("voice-provider-status").textContent = errorMessage(error); $("voice-setup").hidden = false; }
  voiceButtons();
}
async function startRecording() {
  if (voiceUi.phase !== "idle" || !$("voice-consent").checked) return;
  stopSpokenReply();
  voiceUi.phase = "starting"; const generation = ++voiceUi.generation;
  $("voice-transcript").value = ""; voiceButtons();
  try {
    const lease = await call("beginVoiceCapture", { consent: true });
    if (generation !== voiceUi.generation) { await call("cancelVoice", lease.captureId); return; }
    voiceUi.captureId = lease.captureId;
    voiceFeedback("Requesting your microphone. Camera and screen capture are disabled.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (generation !== voiceUi.generation) { stream.getTracks().forEach(track => track.stop()); return; }
    voiceUi.stream = stream;
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw { message: "Audio recording is not supported here. Use a typed command." };
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
    voiceUi.recorder = recorder; voiceUi.chunks = []; voiceUi.bytes = 0;
    recorder.ondataavailable = event => {
      if (generation !== voiceUi.generation || !event.data.size) return;
      voiceUi.bytes += event.data.size;
      if (voiceUi.bytes > 1024 * 1024) { void cancelRecording(); voiceFeedback("The recording was too large and was discarded. Use a shorter command."); return; }
      voiceUi.chunks.push(event.data);
    };
    recorder.onerror = () => { void cancelRecording(); voiceFeedback("Microphone recording failed. Try a typed command."); };
    recorder.onstop = async () => {
      releaseMic(); voiceUi.recorder = null;
      if (generation !== voiceUi.generation) return;
      voiceUi.phase = "transcribing"; voiceButtons(); voiceFeedback("Microphone off. Sending this recording to Cartesia…");
      try {
        const audio = await new Blob(voiceUi.chunks, { type: mimeType }).arrayBuffer(); voiceUi.chunks = [];
        const result = await call("transcribeVoice", { captureId: lease.captureId, audio, mimeType });
        if (generation !== voiceUi.generation) return;
        voiceUi.captureId = null;
        $("voice-transcript").value = result.text;
        $("command-text").value = result.text;
        if ($("voice-review-first").checked) voiceFeedback("Transcribed by Cartesia. Review or edit your words, then prepare the command.");
        else {
          voiceUi.phase = "preparing"; voiceButtons(); voiceFeedback("Preparing the result. Switching or saving still requires your confirmation.");
          await reviewCommand(result.text, {
            canApply: () => generation === voiceUi.generation && $("voice-dialog").open,
            beforeApply: () => { voiceUi.phase = "idle"; voiceUi.handingOff = true; $("voice-dialog").close(); },
          });
        }
      } catch (error) {
        if (generation === voiceUi.generation) {
          const message = error?.message || "Transcription or command preview failed. Edit your transcript or type the command instead.";
          voiceFeedback(message); if (!$("voice-dialog").open) notice(message, true);
        }
      }
      finally { if (generation === voiceUi.generation) { voiceUi.captureId = null; voiceUi.phase = "idle"; voiceButtons(); } }
    };
    recorder.start(250); voiceUi.phase = "recording"; voiceButtons();
    voiceFeedback("Recording your command. Choose Stop & transcribe when finished, or Discard / cancel.");
    const started = performance.now();
    voiceUi.timer = setInterval(() => {
      const elapsed = Math.floor((performance.now() - started) / 1000);
      $("voice-timer").textContent = `${elapsed} / ${lease.maxSeconds} sec`;
      if (elapsed >= lease.maxSeconds && recorder.state === "recording") recorder.stop();
    }, 200);
  } catch (error) {
    if (generation !== voiceUi.generation) return;
    await cancelRecording();
    voiceFeedback(error.name === "NotAllowedError" ? "Microphone access was denied. Check Windows microphone permissions or type the command." : error?.message || "The microphone could not start. Try a typed command.");
  }
}
$("voice-open").addEventListener("click", () => { $("voice-dialog").showModal(); void checkVoice(); });
$("voice-check").addEventListener("click", checkVoice);
$("voice-record").addEventListener("click", startRecording);
$("voice-stop").addEventListener("click", () => { if (voiceUi.recorder?.state === "recording") voiceUi.recorder.stop(); });
$("voice-cancel").addEventListener("click", cancelRecording);
$("voice-consent").addEventListener("change", voiceButtons);
$("voice-transcript").addEventListener("input", voiceButtons);
$("voice-close").addEventListener("click", () => $("voice-dialog").close());
$("voice-dialog").addEventListener("close", () => {
  if (voiceUi.handingOff) voiceUi.handingOff = false;
  else void cancelRecording();
  $("voice-consent").checked = false;
});
$("voice-use").addEventListener("click", () => {
  const text = $("voice-transcript").value.trim(); if (!text || voiceUi.phase !== "idle") return;
  $("command-text").value = text; voiceUi.handingOff = true; $("voice-dialog").close();
  void action($("command-submit"), () => reviewCommand(text));
});
window.addEventListener("blur", () => { if (["starting", "recording"].includes(voiceUi.phase)) void cancelRecording(); });
window.addEventListener("pagehide", () => { void cancelRecording(); });
