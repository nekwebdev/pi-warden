import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SETUP_COMMAND } from "./constants.js";
import piWardenCore from "./index.js";

type SessionHandler = (event: unknown, ctx: unknown) => Promise<void>;
type CommandRegistration = { description: string; handler: unknown };

describe("piWardenCore", () => {
	it("registers session hook and setup command", () => {
		const handlers = new Map<string, SessionHandler>();
		const commands = new Map<string, CommandRegistration>();

		piWardenCore({
			on(name: string, handler: SessionHandler) {
				handlers.set(name, handler);
			},
			registerCommand(name: string, command: CommandRegistration) {
				commands.set(name, command);
			},
		} as unknown as ExtensionAPI);

		assert.equal(handlers.has("session_start"), true);
		assert.equal(commands.has(SETUP_COMMAND), true);
	});
});
