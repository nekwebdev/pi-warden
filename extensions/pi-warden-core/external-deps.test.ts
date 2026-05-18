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

	it("accepts explicit npm, repository, and local source identifiers", () => {
		const caveman = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:pi-caveman",
		);
		const contextMode = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:context-mode",
		);

		assert.deepEqual(caveman?.acceptedSources, [
			"npm:pi-caveman",
			"repo:github.com/jonjonrankin/pi-caveman",
			"local:pi-caveman",
		]);
		assert.deepEqual(contextMode?.acceptedSources, [
			"npm:context-mode",
			"repo:github.com/mksglu/context-mode",
			"local:context-mode",
		]);
	});

	it("self-matches package source entries and describes capabilities", () => {
		for (const dependency of EXTERNAL_DEPENDENCIES) {
			assert.equal(
				dependency.acceptedSources.includes(dependency.pkg),
				true,
				dependency.pkg,
			);
			assert.equal(dependency.provides.trim().length > 0, true, dependency.pkg);
		}

		assert.match(EXTERNAL_DEPENDENCIES[0].provides, /caveman/i);
		assert.match(EXTERNAL_DEPENDENCIES[1].provides, /context-mode/i);
	});
});
