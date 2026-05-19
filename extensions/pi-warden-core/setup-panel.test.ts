import type { Component } from "@earendil-works/pi-tui";
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

const plainTheme = {
	fg: (_name: string, text: string) => text,
	bg: (_name: string, text: string) => text,
	bold: (text: string) => text,
};

const taggedTheme = {
	fg: (name: string, text: string) => `[${name}:${text}]`,
	bg: (name: string, text: string) => `[${name}:${text}]`,
	bold: (text: string) => `{${text}}`,
};

type SetupPanelFactory = Parameters<SetupPanelUI["custom"]>[0];

type RenderableComponent = Component & {
	render: (width: number) => string[];
};

function renderText(component: Component, width = 120): string {
	return (component as RenderableComponent).render(width).join("\n");
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

				const ui: SetupPanelUI = {
					custom: mock.fn(async (factory) => {
						return await new Promise((resolve) => {
							const component = factory(
								{ requestRender: mock.fn() },
								plainTheme,
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
					false,
				);

				assert.deepEqual(result, {
					action: "update",
					choices: [
						{ pkg: "npm:pi-caveman", checked: true },
						{ pkg: "npm:context-mode", checked: true },
					],
					suppressMissingWarnings: false,
					useNerdGlyphs: false,
				});
			},
		);
	});

	it("renders tab labels, footer hints, and regular unicode glyphs by default", async () => {
		const ui: SetupPanelUI = {
			custom: async <T>(factory: SetupPanelFactory): Promise<T> => {
				return await new Promise<T>((resolve) => {
					const component = factory(
						{ requestRender: mock.fn() },
						plainTheme,
						undefined,
						resolve as (value: unknown) => void,
					);
					component.handleInput?.("\t");
					const text = renderText(component);
					const narrowText = renderText(component, 40);

					assert.match(text, /^┏━━ Pi Warden configuration ━+┓$/m);
					assert.match(narrowText, /^┏━━ Pi Warden configuration ━+┓$/m);
					assert.match(text, /Packages \| Display \| lorem \| ipsum/);
					assert.match(text, /Tab\/Shift\+Tab tab/);
					assert.match(
						text,
						/┗━+ ↑↓ navigate • Space\/Enter select • Tab\/Shift\+Tab tab • Esc cancel ━+┛$/m,
					);
					assert.doesNotMatch(text, /Update saves changes/);
					assert.doesNotMatch(text, /Update applies changes/);
					assert.match(
						text,
						/> \[ \] Use Nerd Glyphs, requires compatible Nerd font/,
					);
					assert.doesNotMatch(text, /󰄱/);

					resolve({ action: "cancel" } as T);
				});
			},
		};

		assert.deepEqual(await showSetupPanel(ui, [], false, false), {
			action: "cancel",
		});
	});

	it("cycles four tabs forward with Tab and backward with Shift+Tab", async () => {
		const ui: SetupPanelUI = {
			custom: async <T>(factory: SetupPanelFactory): Promise<T> => {
				return await new Promise<T>((resolve) => {
					const component = factory(
						{ requestRender: mock.fn() },
						taggedTheme,
						undefined,
						resolve as (value: unknown) => void,
					);

					assert.match(renderText(component), /^\[text:┏\]\[text:━/m);
					assert.match(renderText(component), /\{\[text:Packages\]\}/);
					component.handleInput?.("\t");
					assert.match(renderText(component), /\{\[text:Display\]\}/);
					component.handleInput?.("\t");
					let text = renderText(component);
					assert.match(text, /\{\[text:lorem\]\}/);
					assert.doesNotMatch(text, /No options in this tab yet/);
					component.handleInput?.("\t");
					text = renderText(component);
					assert.match(text, /\{\[text:ipsum\]\}/);
					assert.doesNotMatch(text, /No options in this tab yet/);
					component.handleInput?.("\t");
					assert.match(renderText(component), /\{\[text:Packages\]\}/);
					component.handleInput?.("\x1b[Z");
					assert.match(renderText(component), /\{\[text:ipsum\]\}/);

					resolve({ action: "cancel" } as T);
				});
			},
		};

		assert.deepEqual(await showSetupPanel(ui, [], false, false), {
			action: "cancel",
		});
	});

	it("saves warning preference instantly without enabling update", async () => {
		await withTestSettings({ packages: [], piWarden: {} }, async () => {
			const ui: SetupPanelUI = {
				custom: async <T>(factory: SetupPanelFactory): Promise<T> => {
					return await new Promise<T>((resolve) => {
						const component = factory(
							{ requestRender: mock.fn() },
							taggedTheme,
							undefined,
							resolve as (value: unknown) => void,
						);

						component.handleInput?.(" ");
						component.handleInput?.("\x1b[B");
						const text = renderText(component);

						assert.match(
							text,
							/\[text:\[x\] Do not warn for missing dependencies\]/,
						);
						assert.match(text, /No changes/);
						assert.match(
							readFileSync(getPiAgentSettingsPath(), "utf-8"),
							/"doNotWarnForMissingDependencies": true/,
						);

						resolve({ action: "cancel" } as T);
					});
				},
			};

			assert.deepEqual(await showSetupPanel(ui, [], false, false), {
				action: "cancel",
			});
		});
	});

	it("switches border and toggle glyphs when nerd glyphs are toggled", async () => {
		await withTestSettings({ packages: [], piWarden: {} }, async () => {
			const ui: SetupPanelUI = {
				custom: async <T>(factory: SetupPanelFactory): Promise<T> => {
					return await new Promise<T>((resolve) => {
						const component = factory(
							{ requestRender: mock.fn() },
							plainTheme,
							undefined,
							resolve as (value: unknown) => void,
						);
						component.handleInput?.("\t");

						let text = renderText(component);
						assert.match(text, /^┏━━ Pi Warden configuration ━+┓$/m);
						assert.match(text, /> \[ \] Use Nerd Glyphs/);

						component.handleInput?.(" ");
						text = renderText(component);
						assert.match(text, /^┏━━ Pi Warden configuration ━+┓$/m);
						assert.match(text, / 󰡖 Use Nerd Glyphs/);
						assert.match(
							readFileSync(getPiAgentSettingsPath(), "utf-8"),
							/"useNerdGlyphs": true/,
						);

						component.handleInput?.(" ");
						text = renderText(component);
						assert.match(text, /^┏━━ Pi Warden configuration ━+┓$/m);
						assert.match(text, /> \[ \] Use Nerd Glyphs/);

						resolve({ action: "cancel" } as T);
					});
				},
			};

			assert.deepEqual(await showSetupPanel(ui, [], false, false), {
				action: "cancel",
			});
		});
	});
});
