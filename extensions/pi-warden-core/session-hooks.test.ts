import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, mock } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSessionHooks } from "./session-hooks.js";
import { getPiAgentSettingsPath } from "./utils.js";

type SessionHandler = (
	event: unknown,
	ctx: { hasUI: boolean; ui: { notify: ReturnType<typeof mock.fn> } },
) => Promise<void>;

function createMockPi() {
	const handlers = new Map<string, SessionHandler>();
	return {
		pi: {
			on(name: string, handler: SessionHandler) {
				handlers.set(name, handler);
			},
		},
		handlers,
	};
}

function getSessionStartHandler(
	handlers: Map<string, SessionHandler>,
): SessionHandler {
	const handler = handlers.get("session_start");
	assert.ok(handler, "expected session_start handler to be registered");
	return handler;
}

async function withTestSettings(
	contents: unknown,
	test: () => Promise<void>,
): Promise<void> {
	const originalHome = process.env.PI_WARDEN_TEST_HOME;
	const testHome = mkdtempSync(join(tmpdir(), "pi-warden-session-hooks-"));
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

async function withRawTestSettings(
	contents: string,
	test: () => Promise<void>,
): Promise<void> {
	const originalHome = process.env.PI_WARDEN_TEST_HOME;
	const testHome = mkdtempSync(join(tmpdir(), "pi-warden-session-hooks-"));
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

describe("session hooks", () => {
	it("registers session_start", () => {
		const { pi, handlers } = createMockPi();

		registerSessionHooks(pi as unknown as ExtensionAPI);

		assert.equal(handlers.has("session_start"), true);
	});

	it("warns when external dependencies are missing", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, handlers } = createMockPi();
			registerSessionHooks(pi as unknown as ExtensionAPI);
			const ctx = { hasUI: true, ui: { notify: mock.fn() } };

			await getSessionStartHandler(handlers)({}, ctx);

			const warning = String(ctx.ui.notify.mock.calls[0].arguments[0]);
			assert.match(warning, /pi-caveman/);
			assert.match(warning, /context-mode/);
			assert.match(warning, /warden-setup/);
		});
	});

	it("warns once per missing dependency set", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, handlers } = createMockPi();
			registerSessionHooks(pi as unknown as ExtensionAPI);
			const ctx = { hasUI: true, ui: { notify: mock.fn() } };
			const handler = getSessionStartHandler(handlers);

			await handler({}, ctx);
			await handler({}, ctx);

			assert.equal(ctx.ui.notify.mock.calls.length, 1);
		});
	});

	it("warns again when missing dependency set changes", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, handlers } = createMockPi();
			registerSessionHooks(pi as unknown as ExtensionAPI);
			const ctx = { hasUI: true, ui: { notify: mock.fn() } };
			const handler = getSessionStartHandler(handlers);

			await handler({}, ctx);

			const settingsPath = getPiAgentSettingsPath();
			writeFileSync(
				settingsPath,
				JSON.stringify({ packages: ["npm:pi-caveman"] }),
				"utf-8",
			);
			await handler({}, ctx);

			assert.equal(ctx.ui.notify.mock.calls.length, 2);
			assert.match(
				String(ctx.ui.notify.mock.calls[1].arguments[0]),
				/context-mode/,
			);
		});
	});

	it("does not warn when external dependencies are configured", async () => {
		await withTestSettings(
			{ packages: ["npm:pi-caveman", "npm:context-mode"] },
			async () => {
				const { pi, handlers } = createMockPi();
				registerSessionHooks(pi as unknown as ExtensionAPI);
				const ctx = { hasUI: true, ui: { notify: mock.fn() } };

				await getSessionStartHandler(handlers)({}, ctx);

				assert.equal(ctx.ui.notify.mock.calls.length, 0);
			},
		);
	});

	it("does not warn without UI", async () => {
		await withTestSettings({ packages: [] }, async () => {
			const { pi, handlers } = createMockPi();
			registerSessionHooks(pi as unknown as ExtensionAPI);
			const ctx = { hasUI: false, ui: { notify: mock.fn() } };

			await getSessionStartHandler(handlers)({}, ctx);

			assert.equal(ctx.ui.notify.mock.calls.length, 0);
		});
	});

	it("reports corrupt settings instead of missing dependencies", async () => {
		await withRawTestSettings("{not json", async () => {
			const { pi, handlers } = createMockPi();
			registerSessionHooks(pi as unknown as ExtensionAPI);
			const ctx = { hasUI: true, ui: { notify: mock.fn() } };

			await getSessionStartHandler(handlers)({}, ctx);

			const warning = String(ctx.ui.notify.mock.calls[0].arguments[0]);
			assert.match(warning, /cannot read Pi settings/i);
			assert.doesNotMatch(warning, /pi-caveman, context-mode/);
		});
	});
});
