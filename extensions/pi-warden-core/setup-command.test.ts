import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, mock } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SETUP_COMMAND } from "./constants.js";
import { registerSetupCommand } from "./setup-command.js";
import { getPiAgentSettingsPath } from "./utils.js";

type MockCommand = {
	description: string;
	handler: (args: string, ctx: SetupContext) => Promise<void>;
};
type SetupContext = {
	hasUI: boolean;
	ui: {
		notify: ReturnType<typeof mock.fn>;
		confirm: ReturnType<typeof mock.fn>;
	};
};

function createMockPi() {
	const commands = new Map<string, MockCommand>();
	return {
		pi: {
			registerCommand(name: string, command: MockCommand) {
				commands.set(name, command);
			},
		},
		commands,
	};
}

function getSetupHandler(
	commands: Map<string, MockCommand>,
): MockCommand["handler"] {
	const command = commands.get(SETUP_COMMAND);
	assert.ok(command, `expected ${SETUP_COMMAND} to be registered`);
	return command.handler;
}

function createCtx(
	options: { hasUI: boolean; confirm?: boolean } = { hasUI: true },
): SetupContext {
	return {
		hasUI: options.hasUI,
		ui: {
			notify: mock.fn(),
			confirm: mock.fn(async () => options.confirm ?? false),
		},
	};
}

async function withTestSettings(
	contents: unknown,
	test: () => Promise<void>,
): Promise<void> {
	const originalHome = process.env.PI_WARDEN_TEST_HOME;
	const testHome = mkdtempSync(join(tmpdir(), "pi-warden-setup-"));
	process.env.PI_WARDEN_TEST_HOME = testHome;

	try {
		if (contents !== undefined) {
			const settingsPath = getPiAgentSettingsPath();
			mkdirSync(dirname(settingsPath), { recursive: true });
			writeFileSync(settingsPath, JSON.stringify(contents), "utf-8");
		}

		await test();
	} finally {
		if (originalHome === undefined) {
			delete process.env.PI_WARDEN_TEST_HOME;
		} else {
			process.env.PI_WARDEN_TEST_HOME = originalHome;
		}
		rmSync(testHome, { recursive: true, force: true });
	}
}

async function withRawTestSettings(
	contents: string,
	test: () => Promise<void>,
): Promise<void> {
	const originalHome = process.env.PI_WARDEN_TEST_HOME;
	const testHome = mkdtempSync(join(tmpdir(), "pi-warden-setup-"));
	process.env.PI_WARDEN_TEST_HOME = testHome;

	try {
		const settingsPath = getPiAgentSettingsPath();
		mkdirSync(dirname(settingsPath), { recursive: true });
		writeFileSync(settingsPath, contents, "utf-8");
		await test();
	} finally {
		if (originalHome === undefined) {
			delete process.env.PI_WARDEN_TEST_HOME;
		} else {
			process.env.PI_WARDEN_TEST_HOME = originalHome;
		}
		rmSync(testHome, { recursive: true, force: true });
	}
}

describe("/warden-setup", () => {
	it("registers setup command", () => {
		const { pi, commands } = createMockPi();

		registerSetupCommand(pi as unknown as ExtensionAPI);

		assert.equal(commands.has(SETUP_COMMAND), true);
		assert.match(
			commands.get(SETUP_COMMAND)?.description ?? "",
			/external dependencies/i,
		);
	});

	it("requires interactive UI before reading/installing", async () => {
		const { pi, commands } = createMockPi();
		registerSetupCommand(pi as unknown as ExtensionAPI);
		const ctx = createCtx({ hasUI: false });

		await getSetupHandler(commands)("", ctx);

		assert.match(
			String(ctx.ui.notify.mock.calls[0].arguments[0]),
			/interactive/,
		);
		assert.equal(ctx.ui.confirm.mock.calls.length, 0);
	});

	it("notifies no-op when external dependencies are already configured", async () => {
		await withTestSettings(
			{ packages: ["npm:pi-caveman", "npm:context-mode"] },
			async () => {
				const { pi, commands } = createMockPi();
				registerSetupCommand(pi as unknown as ExtensionAPI);
				const ctx = createCtx({ hasUI: true });

				await getSetupHandler(commands)("", ctx);

				assert.match(
					String(ctx.ui.notify.mock.calls[0].arguments[0]),
					/already installed/,
				);
				assert.equal(ctx.ui.confirm.mock.calls.length, 0);
			},
		);
	});

	it("previews installs and cancels without spawning installs", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, commands } = createMockPi();
			const installPackage = mock.fn(async () => ({
				code: 0,
				stdout: "",
				stderr: "",
			}));
			registerSetupCommand(pi as unknown as ExtensionAPI, { installPackage });
			const ctx = createCtx({ hasUI: true, confirm: false });

			await getSetupHandler(commands)("", ctx);

			const confirmBody = String(ctx.ui.confirm.mock.calls[0].arguments[1]);
			assert.match(confirmBody, /npm:pi-caveman/);
			assert.match(confirmBody, /npm:context-mode/);
			assert.match(
				String(ctx.ui.notify.mock.calls.at(-1)?.arguments[0]),
				/cancelled/,
			);
			assert.equal(installPackage.mock.calls.length, 0);
		});
	});

	it("reports successful installs with restart guidance", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, commands } = createMockPi();
			const installedPackages: string[] = [];
			const installPackage = mock.fn(async (pkg: string) => {
				installedPackages.push(pkg);
				return {
					code: 0,
					stdout: "installed",
					stderr: "",
				};
			});
			registerSetupCommand(pi as unknown as ExtensionAPI, { installPackage });
			const ctx = createCtx({ hasUI: true, confirm: true });

			await getSetupHandler(commands)("", ctx);

			assert.equal(installPackage.mock.calls.length, 2);
			assert.deepEqual(installedPackages, [
				"npm:pi-caveman",
				"npm:context-mode",
			]);
			const report = String(ctx.ui.notify.mock.calls.at(-1)?.arguments[0]);
			assert.match(report, /Installed: npm:pi-caveman, npm:context-mode/);
			assert.match(report, /Restart your Pi session/);
		});
	});

	it("omits restart guidance when every install fails", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, commands } = createMockPi();
			const installPackage = mock.fn(async () => ({
				code: 1,
				stdout: "",
				stderr: "boom",
			}));
			registerSetupCommand(pi as unknown as ExtensionAPI, { installPackage });
			const ctx = createCtx({ hasUI: true, confirm: true });

			await getSetupHandler(commands)("", ctx);

			assert.equal(installPackage.mock.calls.length, 2);
			const report = String(ctx.ui.notify.mock.calls.at(-1)?.arguments[0]);
			assert.match(report, /Failed:/);
			assert.match(report, /npm:pi-caveman: boom/);
			assert.match(report, /npm:context-mode: boom/);
			assert.doesNotMatch(report, /Restart your Pi session/);
		});
	});

	it("reports corrupt settings without confirmation or install", async () => {
		await withRawTestSettings("{not json", async () => {
			const { pi, commands } = createMockPi();
			const installPackage = mock.fn(async () => ({
				code: 0,
				stdout: "",
				stderr: "",
			}));
			registerSetupCommand(pi as unknown as ExtensionAPI, { installPackage });
			const ctx = createCtx({ hasUI: true });

			await getSetupHandler(commands)("", ctx);

			assert.match(
				String(ctx.ui.notify.mock.calls[0].arguments[0]),
				/cannot read Pi settings/i,
			);
			assert.equal(ctx.ui.confirm.mock.calls.length, 0);
			assert.equal(installPackage.mock.calls.length, 0);
		});
	});

	it("revalidates missing dependencies after confirmation", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, commands } = createMockPi();
			const installPackage = mock.fn(async () => ({
				code: 0,
				stdout: "",
				stderr: "",
			}));
			registerSetupCommand(pi as unknown as ExtensionAPI, { installPackage });
			const ctx = createCtx({ hasUI: true, confirm: true });
			ctx.ui.confirm = mock.fn(async () => {
				writeFileSync(
					getPiAgentSettingsPath(),
					JSON.stringify({ packages: ["npm:pi-caveman", "npm:context-mode"] }),
					"utf-8",
				);
				return true;
			});

			await getSetupHandler(commands)("", ctx);

			assert.equal(installPackage.mock.calls.length, 0);
			assert.match(
				String(ctx.ui.notify.mock.calls.at(-1)?.arguments[0]),
				/changed during confirmation/i,
			);
		});
	});

	it("falls back to exit code when failure output is blank", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, commands } = createMockPi();
			const installPackage = mock.fn(async () => ({
				code: 7,
				stdout: "  ",
				stderr: "\n",
			}));
			registerSetupCommand(pi as unknown as ExtensionAPI, { installPackage });
			const ctx = createCtx({ hasUI: true, confirm: true });

			await getSetupHandler(commands)("", ctx);

			assert.match(
				String(ctx.ui.notify.mock.calls.at(-1)?.arguments[0]),
				/exit 7/,
			);
		});
	});
});
