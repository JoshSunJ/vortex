import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ControlEngine } from "./control.ts";
import { BrowserBridge } from "./browser.ts";
import { NativeWindowsAdapter } from "./windows.ts";
import { Journal } from "./journal.ts";
import { createControlServer } from "./server.ts";
import { ensure, ControlError } from "./errors.ts";

const dataDir = fileURLToPath(new URL("../.vortex/", import.meta.url));
const configPath = join(dataDir, "control.json");
const args = process.argv.slice(2);
const command = args.shift();
type Config = { token: string; extensionId?: string };
function config(): Config { try { return JSON.parse(readFileSync(configPath, "utf8")); } catch { throw new ControlError("DEVICE_OFFLINE", "Run npm run dev -w @vortex/desktop first."); } }
async function call(path: string, body?: unknown) {
  const value = config();
  const response = await fetch(`http://127.0.0.1:8790${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${value.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const result: any = await response.json();
  if (!result.ok) throw new ControlError(result.error?.code ?? "INTERNAL_ERROR", result.error?.message ?? "Request failed.");
  return result.data;
}
async function main() {
  if (command === "start") {
    mkdirSync(dataDir, { recursive: true });
    let value: Config;
    try { value = config(); } catch { value = { token: randomBytes(32).toString("hex") }; }
    const extensionId = process.env.VORTEX_EXTENSION_ID;
    if (extensionId) value.extensionId = extensionId;
    writeFileSync(configPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    const journal = new Journal(join(dataDir, "control.sqlite"));
    const engine = new ControlEngine(journal, new BrowserBridge(), new NativeWindowsAdapter());
    const server = createControlServer(engine, { ...value, onExtensionIdChanged: id => {
      value.extensionId = id;
      writeFileSync(configPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    } });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(8790, "127.0.0.1", resolve); });
    console.log("Vortex local control: http://127.0.0.1:8790 (development only)");
    console.log("Run snapshot in a second terminal. Browser bridge requires VORTEX_EXTENSION_ID and explicit extension setup; Cartesia is not connected yet.");
    process.on("SIGINT", () => server.close(() => { journal.close(); process.exit(0); }));
    return;
  }
  if (command === "pair") {
    // Explicit user command only. Never include this value in logs, URLs, screenshots or Git.
    console.log(config().token); return;
  }
  if (command === "snapshot") { console.log(JSON.stringify(await call("/control/snapshot"), null, 2)); return; }
  if (command === "focus") {
    const id = args[0]; ensure(id, "VALIDATION_ERROR", "Usage: npm run focus -w @vortex/desktop -- <resource UUID>");
    const plan = await call("/control/focus", { resourceId: id });
    console.log(JSON.stringify({ explanation: plan.explanation, actions: plan.actions, finalFocusResourceId: plan.finalFocusResourceId }, null, 2));
    const prompt = createInterface({ input: stdin, output: stdout });
    const answer = await prompt.question("Type FOCUS to approve this exact action: "); prompt.close();
    if (answer !== "FOCUS") { console.log("Cancelled before execution."); return; }
    const approval = await call(`/control/plans/${plan.id}/approve`, { planHash: plan.planHash, confirmed: true });
    console.log(JSON.stringify(await call(`/control/plans/${plan.id}/execute`, { operationId: randomUUID(), expectedRevision: plan.snapshotRevision, approvalId: approval.approvalId }), null, 2));
    return;
  }
  throw new ControlError("VALIDATION_ERROR", "Commands: start, snapshot, pair, focus <resource UUID>.");
}
main().catch(err => { console.error(err instanceof ControlError ? `${err.code}: ${err.message}` : "Local control failed. Check service startup and setup instructions."); process.exitCode = 1; });
