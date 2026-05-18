import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { EXTERNAL_DEPENDENCIES } from "./external-deps.js";
import { findMissingExternalDependencies } from "./package-checks.js";
import { getPiAgentSettingsPath } from "./utils.js";

function withTestSettings(contents: unknown, test: () => void): void {
	const originalHome = process.env.PI_WARDEN_TEST_HOME;
	const testHome = mkdtempSync(join(tmpdir(), "pi-warden-package-checks-"));
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
		if (originalHome === undefined) {
			delete process.env.PI_WARDEN_TEST_HOME;
		} else {
			process.env.PI_WARDEN_TEST_HOME = originalHome;
		}
		rmSync(testHome, { recursive: true, force: true });
	}
}

function missingPackages(): string[] {
	const result = findMissingExternalDependencies();
	assert.equal(result.ok, true);
	return result.ok ? result.missing.map((dependency) => dependency.pkg) : [];
}

describe("findMissingExternalDependencies", () => {
	it("returns all dependencies when settings are missing", () => {
		withTestSettings(undefined, () => {
			assert.deepEqual(findMissingExternalDependencies(), {
				ok: true,
				missing: [...EXTERNAL_DEPENDENCIES],
			});
		});
	});

	it("returns settings error when settings JSON is invalid", () => {
		withTestSettings("{not json", () => {
			const result = findMissingExternalDependencies();

			assert.equal(result.ok, false);
			if (!result.ok) assert.equal(result.settingsError.kind, "invalid-json");
		});
	});

	it("returns settings error when settings shape is malformed", () => {
		withTestSettings({ packages: "npm:pi-caveman" }, () => {
			const result = findMissingExternalDependencies();

			assert.equal(result.ok, false);
			if (!result.ok) assert.equal(result.settingsError.kind, "invalid-shape");
		});
	});

	it("reads string and object-form package source entries", () => {
		withTestSettings(
			{
				packages: [
					null,
					1,
					{ source: "git:github.com/jonjonrankin/pi-caveman" },
					"npm:context-mode",
				],
			},
			() => {
				assert.deepEqual(findMissingExternalDependencies(), {
					ok: true,
					missing: [],
				});
			},
		);
	});

	it("accepts git and local aliases for external dependencies", () => {
		withTestSettings(
			{
				packages: [
					"https://github.com/jonjonrankin/pi-caveman.git",
					"../vendor/context-mode",
				],
			},
			() => {
				assert.deepEqual(findMissingExternalDependencies(), {
					ok: true,
					missing: [],
				});
			},
		);
	});

	it("does not accept extended local or npm package names", () => {
		withTestSettings(
			{ packages: ["npm:pi-caveman-plus", "../vendor/context-mode-extra"] },
			() => {
				assert.deepEqual(missingPackages(), [
					"npm:pi-caveman",
					"npm:context-mode",
				]);
			},
		);
	});

	it("does not accept GitHub URL subpaths as installed dependencies", () => {
		for (const source of [
			"https://github.com/jonjonrankin/pi-caveman/issues/1",
			"https://github.com/jonjonrankin/pi-caveman/tree/main",
			"https://github.com/jonjonrankin/pi-caveman/blob/main/README.md",
			"https://github.com/jonjonrankin/pi-caveman/extra",
		]) {
			withTestSettings({ packages: [source, "npm:context-mode"] }, () => {
				assert.deepEqual(missingPackages(), ["npm:pi-caveman"]);
			});
		}
	});

	it("returns empty list when all external packages are configured", () => {
		withTestSettings(
			{ packages: ["npm:pi-caveman", "npm:context-mode"] },
			() => {
				assert.deepEqual(findMissingExternalDependencies(), {
					ok: true,
					missing: [],
				});
			},
		);
	});
});
