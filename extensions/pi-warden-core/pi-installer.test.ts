import assert from "node:assert/strict";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { EXIT_TIMEOUT } from "./constants.js";
import { spawnPiInstall } from "./pi-installer.js";

describe("spawnPiInstall", () => {
	it("resolves a failure result when pi command cannot spawn", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "";

		try {
			const result = await spawnPiInstall("npm:missing-package", 50);

			assert.equal(result.code, 1);
			assert.match(result.stderr, /ENOENT|not found|spawn/i);
		} finally {
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
		}
	});

	it("waits for timed-out pi process to close before resolving", async () => {
		if (process.platform === "win32") return;

		const originalPath = process.env.PATH;
		const dir = mkdtempSync(join(tmpdir(), "pi-warden-installer-"));
		const marker = join(dir, "closed.txt");
		const fakePi = join(dir, "pi");
		writeFileSync(
			fakePi,
			`#!/usr/bin/env bash
trap 'sleep 0.05; echo closed > "${marker}"; exit 0' TERM
while true; do sleep 1; done
`,
			"utf-8",
		);
		chmodSync(fakePi, 0o755);
		process.env.PATH = `${dir}:${originalPath ?? ""}`;

		try {
			const result = await spawnPiInstall("npm:slow-package", 25);

			assert.equal(result.code, EXIT_TIMEOUT);
			assert.match(result.stderr, /timed out/);
			assert.equal(existsSync(marker), true);
			assert.equal(readFileSync(marker, "utf-8").trim(), "closed");
		} finally {
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
