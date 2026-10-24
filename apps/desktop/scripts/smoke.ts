// Read-only live adapter/server check. Never focuses a window or prints private window titles.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ControlEngine, BrowserBridge, NativeWindowsAdapter, Journal } from "../src/index.ts";
import { createControlServer } from "../src/server.ts";

const journal = new Journal(":memory:");
const engine = new ControlEngine(journal, new BrowserBridge(), new NativeWindowsAdapter());
const token = randomBytes(32).toString("hex");
const server = createControlServer(engine, { token });
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address() as { port: number };
  const result: any = await (await fetch(`http://127.0.0.1:${address.port}/control/snapshot`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.equal(result.ok, true);
  assert.equal(result.data.schemaVersion, "1.0");
  assert(result.data.resources.every((r: any) => r.kind === "window" && !('handle' in r) && !('processId' in r)));
  console.log(JSON.stringify({ nativeHelper: "live", localServer: "live", nativeWindows: result.data.resources.length, browserConnected: false, changedWindowFocus: false }));
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  journal.close();
}
