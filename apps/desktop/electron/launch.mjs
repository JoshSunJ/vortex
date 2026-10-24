import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, ".."), repo = resolve(here, "../../..");
const helperDir = resolve(repo, "native/windows");
if (process.platform === "win32" && !existsSync(resolve(helperDir, "dist/vortex-window-helper.exe"))) {
  const framework = resolve(process.env.WINDIR ?? "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319");
  mkdirSync(resolve(helperDir, "dist"), { recursive: true });
  execFileSync(resolve(framework, "csc.exe"), ["/nologo", "/target:exe", "/optimize+", `/out:${resolve(helperDir, "dist/vortex-window-helper.exe")}`, `/reference:${resolve(framework, "System.Web.Extensions.dll")}`, resolve(helperDir, "WindowHelper.cs")], { windowsHide: true, stdio: "inherit" });
}
const electron = createRequire(import.meta.url)("electron");
const env = { ...process.env, VORTEX_NODE_PATH: process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [desktop], { cwd: repo, env, stdio: "inherit", windowsHide: false });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 0; });
