export type McpServerConfig = {
	readonly command: string;
	readonly args?: readonly string[];
	readonly env?: Record<string, string>;
	readonly cwd?: string;
	readonly transport?: string;
	readonly url?: string;
	readonly timeout?: number;
} & Record<string, unknown>;

export interface ExternalDependencyMcpConfig {
	readonly servers: Record<string, McpServerConfig>;
}

export interface ExternalDependency {
	/** Default install spec passed to `pi install`. */
	readonly pkg: string;
	/** Normalized installed-source identifiers accepted as satisfying this dependency. */
	readonly acceptedSources: readonly string[];
	/** User-facing capability text shown in setup preview and readiness warnings. */
	readonly provides: string;
	/** Machine-readable MCP config merged into mcp.json during setup updates. */
	readonly mcp?: ExternalDependencyMcpConfig;
}

export const EXTERNAL_DEPENDENCIES: readonly ExternalDependency[] = [
	{
		pkg: "npm:pi-caveman",
		acceptedSources: [
			"git:github.com/jonjonrankin/pi-caveman",
			"local:pi-caveman",
		],
		provides: "caveman response-style extension",
	},
	{
		pkg: "npm:context-mode",
		acceptedSources: [
			"git:github.com/mksglu/context-mode",
			"local:context-mode",
		],
		provides: "context-mode tools, MCP bridge, skills",
		mcp: {
			servers: {
				"context-mode": {
					command: "context-mode",
				},
			},
		},
	},
	{
		pkg: "npm:pi-mcp-adapter",
		acceptedSources: [
			"git:github.com/nekwebdev/pi-mcp-adapter",
			"local:pi-mcp-adapter",
		],
		provides: "Use MCP servers with Pi without burning your context window.",
	},
];
