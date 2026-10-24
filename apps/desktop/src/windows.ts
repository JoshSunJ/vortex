import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ErrorCode } from "@vortex/contracts";
import { ControlError } from "./errors.ts";

const exec = promisify(execFile);
export const NativeWindow = z.strictObject({
  handle: z.string().regex(/^\d+$/), processId: z.number().int().positive(),
  processStartedAt: z.iso.datetime(), title: z.string().max(500), appName: z.string().max(500), active: z.boolean(),
});
export type NativeWindow = z.infer<typeof NativeWindow>;
export interface WindowsAdapter {
  list(): Promise<NativeWindow[]>;
  focus(binding: NativeWindow): Promise<void>;
}

/** Only invokes our fixed helper with typed positional arguments; never a shell or script. */
export class NativeWindowsAdapter implements WindowsAdapter {
  constructor(private readonly executable = fileURLToPath(new URL("../../../native/windows/dist/vortex-window-helper.exe", import.meta.url))) {}
  private async call(args: string[]) {
    let stdout: string;
    try { ({ stdout } = await exec(this.executable, args, { windowsHide: true, timeout: 5_000, maxBuffer: 2 * 1024 * 1024 })); }
    catch (err) {
      const e = err as { stdout?: string };
      if (e.stdout) stdout = e.stdout;
      else throw new ControlError("DEVICE_OFFLINE", "Build the Windows helper first, then run the control service in your Windows session.");
    }
    let value: any;
    try { value = JSON.parse(stdout.replace(/^\uFEFF/, "")); }
    catch { throw new ControlError("INTERNAL_ERROR", "Windows helper returned an invalid response."); }
    if (!value.ok) throw new ControlError(ErrorCode.safeParse(value.code).success ? value.code : "INTERNAL_ERROR", String(value.message ?? "Windows operation failed."));
    return value;
  }
  async list() { return z.array(NativeWindow).parse((await this.call(["list"])).windows); }
  async focus(binding: NativeWindow) { await this.call(["focus", binding.handle, String(binding.processId), binding.processStartedAt]); }
}
