"use strict";
const replyUi = { generation: 0, audio: null, url: null, last: null };
function displayReplyText(text) {
  $("reply-text").textContent = text;
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    let widget = dialog.querySelector(".dialog-reply");
    if (!widget) {
      widget = node("div", "dialog-reply"); const copy = node("p"); copy.setAttribute("role", "status");
      const stop = node("button", "text-button", "Stop voice"); stop.type = "button"; stop.addEventListener("click", stopSpokenReply);
      widget.append(copy, stop); dialog.append(widget);
    }
    widget.querySelector("p").textContent = text;
  }
}
function spokenRepliesEnabled() { return $("spoken-replies").checked; }
function stopSpokenReply() {
  replyUi.generation++;
  if (replyUi.audio) { replyUi.audio.pause(); replyUi.audio.src = ""; replyUi.audio = null; }
  if (replyUi.url) { URL.revokeObjectURL(replyUi.url); replyUi.url = null; }
  $("reply-stop").hidden = true;
  void call("cancelSpeech").catch(() => {});
}
async function speakReply(code) {
  if (!spokenRepliesEnabled()) return;
  stopSpokenReply();
  const generation = replyUi.generation;
  $("reply-strip").hidden = false; displayReplyText("Preparing voice reply…");
  $("reply-replay").disabled = true; $("reply-stop").hidden = false;
  try {
    const result = await call("speakStatus", code);
    if (generation !== replyUi.generation || !spokenRepliesEnabled()) return;
    replyUi.last = code; displayReplyText(result.text);
    replyUi.url = URL.createObjectURL(new Blob([result.audio], { type: result.mimeType }));
    const audio = new Audio(replyUi.url); replyUi.audio = audio;
    audio.onended = () => { if (generation === replyUi.generation) { $("reply-stop").hidden = true; $("reply-replay").disabled = false; } };
    audio.onerror = () => { if (generation === replyUi.generation) { $("reply-stop").hidden = true; $("reply-replay").disabled = false; } };
    $("reply-replay").disabled = false;
    await audio.play();
  } catch (error) {
    if (generation !== replyUi.generation) return;
    $("reply-stop").hidden = true; $("reply-replay").disabled = !replyUi.last;
    displayReplyText(error?.message || "Voice playback unavailable. The command result is on screen.");
  }
}
try { $("spoken-replies").checked = localStorage.getItem("vortex:spoken-replies") !== "off"; } catch {}
$("spoken-replies").addEventListener("change", () => {
  try { localStorage.setItem("vortex:spoken-replies", spokenRepliesEnabled() ? "on" : "off"); } catch {}
  if (!spokenRepliesEnabled()) stopSpokenReply();
});
$("reply-stop").addEventListener("click", stopSpokenReply);
$("reply-replay").addEventListener("click", () => { if (replyUi.last) void speakReply(replyUi.last); });
$("test-reply").addEventListener("click", () => { void speakReply("ready"); });
document.addEventListener("vortex:reply", event => { void speakReply(event.detail.code); });
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("cancel", stopSpokenReply);
  dialog.addEventListener("close", () => dialog.querySelector(".dialog-reply")?.remove());
}
window.addEventListener("pagehide", stopSpokenReply);
