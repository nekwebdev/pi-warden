import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, mock } from "node:test";
import { getExternalDependencyStatuses } from "./package-checks.js";
import { showSetupPanel, type SetupPanelUI } from "./setup-panel.js";
import { getPiAgentSettingsPath } from "./utils.js";

async function withTestSettings(
	contents: unknown,
	test: () => Promise<void>,
): Promise<void> {
	const originalHome = process.env.PI_WARDEN_TEST_HOME;
	const testHome = mkdtempSync(join(tmpdir(), "pi-warden-setup-panel-"));
	process.env.PI_WARDEN_TEST_HOME = testHome;

	try {
		const settingsPath = getPiAgentSettingsPath();
		mkdirSync(dirname(settingsPath), { recursive: true });
		writeFileSync(settingsPath, JSON.stringify(contents), "utf-8");
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

describe("setup panel", () => {
	it("leaves accepted-source rows disabled but toggles mutable rows", async () => {
		await withTestSettings(
			{ packages: ["git:github.com/jonjonrankin/pi-caveman"] },
			async () => {
				const statusesResult = getExternalDependencyStatuses();
				assert.equal(statusesResult.ok, true);
				assert.equal(
					statusesResult.ok ? statusesResult.statuses[0].kind : undefined,
					"accepted",
				);

				const theme = {
					fg: (_name: string, text: string) => text,
					bg: (_name: string, text: string) => text,
					bold: (text: string) => text,
				};
				const ui: SetupPanelUI = {
					custom: mock.fn(async (factory) => {
						return await new Promise((resolve) => {
							const component = factory(
								{ requestRender: mock.fn() },
								theme,
								undefined,
								resolve,
							);
							component.handleInput?.(" ");
							component.handleInput?.("\x1b[B");
							component.handleInput?.(" ");
							component.handleInput?.("\x1b[B");
							component.handleInput?.("\x1b[B");
							component.handleInput?.("\r");
						});
					}),
				};

				const result = await showSetupPanel(
					ui,
					statusesResult.ok ? statusesResult.statuses : [],
					false,
				);

				assert.deepEqual(result, {
					action: "update",
					choices: [
						{ pkg: "npm:pi-caveman", checked: true },
						{ pkg: "npm:context-mode", checked: true },
					],
					suppressMissingWarnings: false,
				});
			},
		);
	});
});
