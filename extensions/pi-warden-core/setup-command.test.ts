import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, mock } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SETUP_COMMAND } from "./constants.js";
import { getExternalDependencyStatuses } from "./package-checks.js";
import {
	applySetupUpdate,
	buildPackageActions,
	registerSetupCommand,
} from "./setup-command.js";
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
		custom: ReturnType<typeof mock.fn>;
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
	options: { hasUI: boolean; confirm?: boolean; customResult?: unknown } = {
		hasUI: true,
	},
): SetupContext {
	return {
		hasUI: options.hasUI,
		ui: {
			notify: mock.fn(),
			confirm: mock.fn(async () => options.confirm ?? false),
			custom: mock.fn(async () => options.customResult),
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

	it("registers setup command with install and remove package injection", () => {
		const { pi, commands } = createMockPi();
		const installPackage = mock.fn(async () => ({
			code: 0,
			stdout: "",
			stderr: "",
		}));
		const removePackage = mock.fn(async () => ({
			code: 0,
			stdout: "",
			stderr: "",
		}));

		registerSetupCommand(pi as unknown as ExtensionAPI, {
			installPackage,
			removePackage,
		});

		assert.equal(commands.has(SETUP_COMMAND), true);
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
		assert.equal(ctx.ui.custom.mock.calls.length, 0);
	});

	it("reports corrupt settings without panel or install", async () => {
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
			assert.equal(ctx.ui.custom.mock.calls.length, 0);
			assert.equal(installPackage.mock.calls.length, 0);
		});
	});

	it("opens setup panel with all dependency rows instead of using legacy confirm", async () => {
		await withTestSettings(
			{
				packages: ["npm:pi-caveman"],
				piWarden: { doNotWarnForMissingDependencies: true },
			},
			async () => {
				const { pi, commands } = createMockPi();
				registerSetupCommand(pi as unknown as ExtensionAPI);
				const ctx = createCtx({
					hasUI: true,
					customResult: { action: "cancel" },
				});

				await getSetupHandler(commands)("", ctx);

				assert.equal(ctx.ui.confirm.mock.calls.length, 0);
				assert.equal(ctx.ui.custom.mock.calls.length, 1);
				assert.match(
					String(ctx.ui.notify.mock.calls.at(-1)?.arguments[0]),
					/cancelled/,
				);
			},
		);
	});

	it("plans installs and removes only mutable canonical dependency rows", async () => {
		await withTestSettings(
			{
				packages: ["npm:pi-caveman", "git:github.com/mksglu/context-mode"],
			},
			async () => {
				const statusesResult = getExternalDependencyStatuses();
				assert.equal(statusesResult.ok, true);
				assert.deepEqual(
					statusesResult.ok
						? buildPackageActions(statusesResult.statuses, [
								{ pkg: "npm:pi-caveman", checked: false },
								{ pkg: "npm:context-mode", checked: false },
							])
						: [],
					[{ operation: "remove", pkg: "npm:pi-caveman" }],
				);
			},
		);
	});

	it("revalidates, installs checked missing deps, removes unchecked canonical deps, and writes warning preference", async () => {
		await withTestSettings(
			{ packages: ["npm:pi-caveman"], piWarden: {} },
			async () => {
				const installedPackages: string[] = [];
				const removedPackages: string[] = [];
				const installPackage = mock.fn(async (pkg: string) => {
					installedPackages.push(pkg);
					return {
						code: 0,
						stdout: "installed",
						stderr: "",
					};
				});
				const removePackage = mock.fn(async (pkg: string) => {
					removedPackages.push(pkg);
					return {
						code: 0,
						stdout: "removed",
						stderr: "",
					};
				});
				const ctx = createCtx({ hasUI: true });

				const summary = await applySetupUpdate(
					ctx.ui as unknown as Parameters<typeof applySetupUpdate>[0],
					{
						choices: [
							{ pkg: "npm:pi-caveman", checked: false },
							{ pkg: "npm:context-mode", checked: true },
						],
						suppressMissingWarnings: true,
					},
					installPackage,
					removePackage,
				);

				assert.deepEqual(summary, {
					installed: ["npm:context-mode"],
					removed: ["npm:pi-caveman"],
					failed: [],
					preferenceUpdated: true,
				});
				assert.deepEqual(installedPackages, ["npm:context-mode"]);
				assert.deepEqual(removedPackages, ["npm:pi-caveman"]);
				assert.match(
					readFileSync(getPiAgentSettingsPath(), "utf-8"),
					/"doNotWarnForMissingDependencies": true/,
				);
			},
		);
	});

	it("applies setup panel update choices through install, remove, and warning preference", async () => {
		await withTestSettings(
			{ packages: ["npm:pi-caveman"], piWarden: {} },
			async () => {
				const { pi, commands } = createMockPi();
				const installedPackages: string[] = [];
				const removedPackages: string[] = [];
				const installPackage = mock.fn(async (pkg: string) => {
					installedPackages.push(pkg);
					return {
						code: 0,
						stdout: "",
						stderr: "",
					};
				});
				const removePackage = mock.fn(async (pkg: string) => {
					removedPackages.push(pkg);
					return {
						code: 0,
						stdout: "",
						stderr: "",
					};
				});
				registerSetupCommand(pi as unknown as ExtensionAPI, {
					installPackage,
					removePackage,
				});
				const ctx = createCtx({
					hasUI: true,
					customResult: {
						action: "update",
						choices: [
							{ pkg: "npm:pi-caveman", checked: false },
							{ pkg: "npm:context-mode", checked: true },
						],
						suppressMissingWarnings: true,
					},
				});

				await getSetupHandler(commands)("", ctx);

				assert.deepEqual(removedPackages, ["npm:pi-caveman"]);
				assert.deepEqual(installedPackages, ["npm:context-mode"]);
				const report = String(ctx.ui.notify.mock.calls.at(-1)?.arguments[0]);
				assert.match(report, /Installed: npm:context-mode/);
				assert.match(report, /Removed: npm:pi-caveman/);
				assert.match(report, /Saved: do not warn for missing dependencies/);
			},
		);
	});

	it("falls back to exit code when update failure output is blank", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, commands } = createMockPi();
			const installPackage = mock.fn(async () => ({
				code: 7,
				stdout: "  ",
				stderr: "\n",
			}));
			registerSetupCommand(pi as unknown as ExtensionAPI, { installPackage });
			const ctx = createCtx({
				hasUI: true,
				customResult: {
					action: "update",
					choices: [
						{ pkg: "npm:pi-caveman", checked: true },
						{ pkg: "npm:context-mode", checked: false },
					],
					suppressMissingWarnings: false,
				},
			});

			await getSetupHandler(commands)("", ctx);

			assert.match(
				String(ctx.ui.notify.mock.calls.at(-1)?.arguments[0]),
				/exit 7/,
			);
		});
	});
});
