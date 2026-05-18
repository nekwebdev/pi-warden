import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const pkg = JSON.parse(
	readFileSync(resolve(packageRoot, "package.json"), "utf-8"),
) as {
	files?: string[];
	scripts?: Record<string, string>;
	pi?: {
		extensions?: string[];
		prompts?: string[];
	};
};

describe("package pi resources", () => {
	it("does not advertise a package test script", () => {
		assert.equal(pkg.scripts?.test, undefined);
	});

	it("advertises explicit committed Pi resources", () => {
		assert.deepEqual(pkg.pi?.extensions, [
			"./extensions/pi-warden-core/index.ts",
		]);
		assert.deepEqual(pkg.pi?.prompts, ["./prompts/bootstrap.md"]);
	});

	it("all advertised Pi resources exist", () => {
		const entries = [...(pkg.pi?.extensions ?? []), ...(pkg.pi?.prompts ?? [])];
		assert.ok(entries.length > 0, "expected advertised Pi resources");

		for (const entry of entries) {
			assert.equal(
				existsSync(resolve(packageRoot, entry)),
				true,
				`${entry} should exist`,
			);
		}
	});

	it("bootstrap prompt has setup and safety guidance", () => {
		const body = readFileSync(
			resolve(packageRoot, "prompts/bootstrap.md"),
			"utf-8",
		);

		assert.match(
			body,
			/^---\ndescription: Bootstrap a fresh Pi Warden install\nargument-hint: "\[goal\]"\n---/,
		);
		assert.match(body, /\/warden-setup/);
		assert.match(body, /npm:pi-caveman/);
		assert.match(body, /npm:context-mode/);
		assert.match(body, /restart Pi/i);
		assert.match(body, /Do not copy secrets|explicit confirmation/i);
	});
});
