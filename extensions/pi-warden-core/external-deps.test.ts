import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXTERNAL_DEPENDENCIES } from "./external-deps.js";

describe("EXTERNAL_DEPENDENCIES", () => {
	it("lists pi-caveman and context-mode as external install targets", () => {
		assert.deepEqual(
			EXTERNAL_DEPENDENCIES.map((dependency) => dependency.pkg),
			["npm:pi-caveman", "npm:context-mode"],
		);
	});

	it("keeps canonical install targets separate from accepted user-managed sources", () => {
		const caveman = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:pi-caveman",
		);
		const contextMode = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:context-mode",
		);

		assert.deepEqual(caveman?.acceptedSources, [
			"git:github.com/jonjonrankin/pi-caveman",
			"local:pi-caveman",
		]);
		assert.deepEqual(contextMode?.acceptedSources, [
			"git:github.com/mksglu/context-mode",
			"local:context-mode",
		]);
		assert.equal(caveman?.acceptedSources.includes("npm:pi-caveman"), false);
		assert.equal(
			contextMode?.acceptedSources.includes("npm:context-mode"),
			false,
		);
	});

	it("describes capabilities for every external dependency", () => {
		for (const dependency of EXTERNAL_DEPENDENCIES) {
			assert.equal(dependency.provides.trim().length > 0, true, dependency.pkg);
		}

		assert.match(EXTERNAL_DEPENDENCIES[0].provides, /caveman/i);
		assert.match(EXTERNAL_DEPENDENCIES[1].provides, /context-mode/i);
	});
});
