import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXTERNAL_DEPENDENCIES } from "./external-deps.js";

describe("EXTERNAL_DEPENDENCIES", () => {
	it("lists pi-caveman, context-mode, and pi-mcp-adapter as external install targets", () => {
		assert.deepEqual(
			EXTERNAL_DEPENDENCIES.map((dependency) => dependency.pkg),
			["npm:pi-caveman", "npm:context-mode", "npm:pi-mcp-adapter"],
		);
	});

	it("keeps canonical install targets separate from accepted user-managed sources", () => {
		const caveman = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:pi-caveman",
		);
		const contextMode = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:context-mode",
		);
		const piMcpAdapter = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:pi-mcp-adapter",
		);

		assert.deepEqual(caveman?.acceptedSources, [
			"git:github.com/jonjonrankin/pi-caveman",
			"local:pi-caveman",
		]);
		assert.deepEqual(contextMode?.acceptedSources, [
			"git:github.com/mksglu/context-mode",
			"local:context-mode",
		]);
		assert.deepEqual(piMcpAdapter?.acceptedSources, [
			"git:github.com/nekwebdev/pi-mcp-adapter",
			"local:pi-mcp-adapter",
		]);
		assert.equal(caveman?.acceptedSources.includes("npm:pi-caveman"), false);
		assert.equal(
			contextMode?.acceptedSources.includes("npm:context-mode"),
			false,
		);
		assert.equal(
			piMcpAdapter?.acceptedSources.includes("npm:pi-mcp-adapter"),
			false,
		);
	});

	it("describes capabilities for every external dependency", () => {
		for (const dependency of EXTERNAL_DEPENDENCIES) {
			assert.equal(dependency.provides.trim().length > 0, true, dependency.pkg);
		}

		assert.match(EXTERNAL_DEPENDENCIES[0].provides, /caveman/i);
		assert.match(EXTERNAL_DEPENDENCIES[1].provides, /context-mode/i);
		assert.equal(
			EXTERNAL_DEPENDENCIES[2].provides,
			"Use MCP servers with Pi without burning your context window.",
		);
	});

	it("declares context-mode MCP server metadata", () => {
		const contextMode = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:context-mode",
		);
		const piMcpAdapter = EXTERNAL_DEPENDENCIES.find(
			(dependency) => dependency.pkg === "npm:pi-mcp-adapter",
		);

		assert.deepEqual(contextMode?.mcp, {
			servers: {
				"context-mode": {
					command: "context-mode",
				},
			},
		});
		assert.equal(piMcpAdapter?.mcp, undefined);
	});
});
