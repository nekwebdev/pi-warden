import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSessionHooks } from "./session-hooks.js";
import { registerSetupCommand } from "./setup-command.js";

export default function piWardenCore(pi: ExtensionAPI): void {
  registerSessionHooks(pi);
  registerSetupCommand(pi);
}
