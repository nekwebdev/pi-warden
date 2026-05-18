import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { getPiAgentSettingsPath, readPiAgentSettings } from "./utils.js";

function withTempSettings(contents: unknown, test: () => void): void {
	const originalHome = process.env.PI_WARDEN_TEST_HOME;
	const testHome = mkdtempSync(join(tmpdir(), "pi-warden-utils-"));
	process.env.PI_WARDEN_TEST_HOME = testHome;

	try {
		if (contents !== undefined) {
			const settingsPath = getPiAgentSettingsPath();
			mkdirSync(dirname(settingsPath), { recursive: true });
			writeFileSync(
				settingsPath,
				typeof contents === "string" ? contents : JSON.stringify(contents),
				"utf-8",
			);
		}
		test();
	} finally {
		if (originalHome === undefined) delete process.env.PI_WARDEN_TEST_HOME;
		else process.env.PI_WARDEN_TEST_HOME = originalHome;
		rmSync(testHome, { recursive: true, force: true });
	}
}

describe("getPiAgentSettingsPath", () => {
	it("uses PI_CODING_AGENT_DIR when present", () => {
		const originalTestHome = process.env.PI_WARDEN_TEST_HOME;
		const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
		delete process.env.PI_WARDEN_TEST_HOME;
		process.env.PI_CODING_AGENT_DIR = "/tmp/pi-agent-dir";

		try {
			assert.equal(
				getPiAgentSettingsPath(),
				join("/tmp/pi-agent-dir", "settings.json"),
			);
		} finally {
			if (originalTestHome === undefined) {
				delete process.env.PI_WARDEN_TEST_HOME;
			} else {
				process.env.PI_WARDEN_TEST_HOME = originalTestHome;
			}
			if (originalAgentDir === undefined) {
				delete process.env.PI_CODING_AGENT_DIR;
			} else {
				process.env.PI_CODING_AGENT_DIR = originalAgentDir;
			}
		}
	});

	it("keeps test home override ahead of PI_CODING_AGENT_DIR", () => {
		const originalTestHome = process.env.PI_WARDEN_TEST_HOME;
		const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_WARDEN_TEST_HOME = "/tmp/pi-warden-test-home";
		process.env.PI_CODING_AGENT_DIR = "/tmp/pi-agent-dir";

		try {
			assert.equal(
				getPiAgentSettingsPath(),
				join("/tmp/pi-warden-test-home", ".pi", "agent", "settings.json"),
			);
		} finally {
			if (originalTestHome === undefined) {
				delete process.env.PI_WARDEN_TEST_HOME;
			} else {
				process.env.PI_WARDEN_TEST_HOME = originalTestHome;
			}
			if (originalAgentDir === undefined) {
				delete process.env.PI_CODING_AGENT_DIR;
			} else {
				process.env.PI_CODING_AGENT_DIR = originalAgentDir;
			}
		}
	});

	it("returns missing settings state when settings file is absent", () => {
		withTempSettings(undefined, () => {
			const result = readPiAgentSettings();

			assert.equal(result.ok, false);
			if (!result.ok) assert.equal(result.kind, "missing");
		});
	});

	it("returns invalid-json settings state for corrupt JSON", () => {
		withTempSettings("{not json", () => {
			const result = readPiAgentSettings();

			assert.equal(result.ok, false);
			if (!result.ok) assert.equal(result.kind, "invalid-json");
		});
	});

	it("returns invalid-shape settings state when packages is missing", () => {
		withTempSettings({ notPackages: [] }, () => {
			const result = readPiAgentSettings();

			assert.equal(result.ok, false);
			if (!result.ok) assert.equal(result.kind, "invalid-shape");
		});
	});

	it("returns packages for valid settings", () => {
		withTempSettings({ packages: ["npm:pi-caveman"] }, () => {
			const result = readPiAgentSettings();

			assert.equal(result.ok, true);
			if (result.ok) assert.deepEqual(result.packages, ["npm:pi-caveman"]);
		});
	});
});
