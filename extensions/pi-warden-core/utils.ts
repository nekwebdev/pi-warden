import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PI_AGENT_SETTINGS_RELATIVE } from "./constants.js";
import type { McpServerConfig } from "./external-deps.js";

export interface PiAgentSettingsResult {
	readonly settings: Record<string, unknown>;
	readonly packages: unknown[];
}

export type PiAgentSettingsErrorKind =
	| "missing"
	| "unreadable"
	| "invalid-json"
	| "invalid-shape";

export type PiAgentSettingsReadResult =
	| ({ readonly ok: true } & PiAgentSettingsResult)
	| {
			readonly ok: false;
			readonly kind: PiAgentSettingsErrorKind;
			readonly path: string;
			readonly message: string;
	  };

export type PiAgentSettingsError = Extract<
	PiAgentSettingsReadResult,
	{ readonly ok: false }
>;

export interface PiWardenSettings {
	readonly doNotWarnForMissingDependencies?: boolean;
	readonly useNerdGlyphs?: boolean;
}

export type PiAgentSettingsWriteResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly settingsError: PiAgentSettingsError };

export interface McpJson {
	readonly mcpServers: Record<string, McpServerConfig>;
	readonly [key: string]: unknown;
}

export type McpJsonReadResult =
	| { readonly ok: true; readonly config: McpJson }
	| {
			readonly ok: false;
			readonly kind: PiAgentSettingsErrorKind;
			readonly path: string;
			readonly message: string;
	  };

export type McpJsonError = Extract<McpJsonReadResult, { readonly ok: false }>;

export type McpJsonWriteResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly mcpError: McpJsonError };

export type McpServerChanges = {
	readonly add?: Record<string, McpServerConfig>;
	readonly remove?: readonly string[];
};

export function getPiAgentSettingsPath(): string {
	if (process.env.PI_WARDEN_TEST_HOME) {
		return join(process.env.PI_WARDEN_TEST_HOME, ...PI_AGENT_SETTINGS_RELATIVE);
	}

	if (process.env.PI_CODING_AGENT_DIR) {
		return join(process.env.PI_CODING_AGENT_DIR, "settings.json");
	}

	return join(homedir(), ...PI_AGENT_SETTINGS_RELATIVE);
}

export function getPiAgentSettingsDir(): string {
	return dirname(getPiAgentSettingsPath());
}

export function getMcpJsonPath(): string {
	return join(getPiAgentSettingsDir(), "mcp.json");
}

export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function formatPiAgentSettingsError(
	error: PiAgentSettingsError,
): string {
	return `${error.path}: ${error.message}`;
}

export function formatMcpJsonError(error: McpJsonError): string {
	return `${error.path}: ${error.message}`;
}

export function getPiWardenSettings(
	settings: Record<string, unknown> | undefined,
): PiWardenSettings {
	if (!settings) return {};
	const value = settings.piWarden;
	if (!isPlainObject(value)) return {};

	return {
		...(typeof value.doNotWarnForMissingDependencies === "boolean"
			? {
					doNotWarnForMissingDependencies:
						value.doNotWarnForMissingDependencies,
				}
			: {}),
		...(typeof value.useNerdGlyphs === "boolean"
			? { useNerdGlyphs: value.useNerdGlyphs }
			: {}),
	};
}

export function writePiWardenSettings(
	patch: PiWardenSettings,
): PiAgentSettingsWriteResult {
	const result = readPiAgentSettings();
	if (!result.ok) return { ok: false, settingsError: result };

	const current = isPlainObject(result.settings.piWarden)
		? result.settings.piWarden
		: {};
	const next = {
		...result.settings,
		piWarden: {
			...current,
			...patch,
		},
	};

	try {
		writeFileSync(
			getPiAgentSettingsPath(),
			`${JSON.stringify(next, null, 2)}\n`,
			"utf-8",
		);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			settingsError: {
				ok: false,
				kind: "unreadable",
				path: getPiAgentSettingsPath(),
				message: toErrorMessage(error),
			},
		};
	}
}

export function readPiAgentSettings(): PiAgentSettingsReadResult {
	const settingsPath = getPiAgentSettingsPath();
	if (!existsSync(settingsPath)) {
		return {
			ok: false,
			kind: "missing",
			path: settingsPath,
			message: "settings file does not exist",
		};
	}

	let contents: string;
	try {
		contents = readFileSync(settingsPath, "utf-8");
	} catch (error) {
		return {
			ok: false,
			kind: "unreadable",
			path: settingsPath,
			message: toErrorMessage(error),
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(contents);
	} catch (error) {
		return {
			ok: false,
			kind: "invalid-json",
			path: settingsPath,
			message: toErrorMessage(error),
		};
	}

	if (!isPlainObject(parsed)) {
		return {
			ok: false,
			kind: "invalid-shape",
			path: settingsPath,
			message: "settings root must be an object",
		};
	}
	if (!Array.isArray(parsed.packages)) {
		return {
			ok: false,
			kind: "invalid-shape",
			path: settingsPath,
			message: "settings.packages must be an array",
		};
	}

	return { ok: true, settings: parsed, packages: parsed.packages };
}

export function readMcpJson(): McpJsonReadResult {
	const path = getMcpJsonPath();
	if (!existsSync(path)) {
		return {
			ok: false,
			kind: "missing",
			path,
			message: "mcp.json file does not exist",
		};
	}

	let contents: string;
	try {
		contents = readFileSync(path, "utf-8");
	} catch (error) {
		return {
			ok: false,
			kind: "unreadable",
			path,
			message: toErrorMessage(error),
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(contents);
	} catch (error) {
		return {
			ok: false,
			kind: "invalid-json",
			path,
			message: toErrorMessage(error),
		};
	}

	if (!isPlainObject(parsed)) {
		return {
			ok: false,
			kind: "invalid-shape",
			path,
			message: "mcp.json root must be an object",
		};
	}

	const mcpServers = "mcpServers" in parsed ? parsed.mcpServers : {};
	if (!isPlainObject(mcpServers)) {
		return {
			ok: false,
			kind: "invalid-shape",
			path,
			message: "mcp.json mcpServers must be an object",
		};
	}
	for (const [name, server] of Object.entries(mcpServers)) {
		if (isPlainObject(server)) continue;
		return {
			ok: false,
			kind: "invalid-shape",
			path,
			message: `mcp.json mcpServers.${name} must be an object`,
		};
	}

	return {
		ok: true,
		config: {
			...parsed,
			mcpServers: mcpServers as Record<string, McpServerConfig>,
		},
	};
}

export function writeMcpServers(
	servers: Record<string, McpServerConfig>,
): McpJsonWriteResult {
	return writeMcpServerChanges({ add: servers });
}

export function writeMcpServerChanges(
	changes: McpServerChanges,
): McpJsonWriteResult {
	const result = readMcpJson();
	if (!result.ok && result.kind !== "missing") {
		return { ok: false, mcpError: result };
	}

	const add = changes.add ?? {};
	const remove = changes.remove ?? [];
	if (!result.ok && Object.keys(add).length === 0) return { ok: true };

	const current = result.ok ? result.config : { mcpServers: {} };
	const nextServers: Record<string, unknown> = { ...current.mcpServers };

	for (const name of remove) delete nextServers[name];

	for (const [name, desired] of Object.entries(add)) {
		const existing = isPlainObject(current.mcpServers[name])
			? current.mcpServers[name]
			: {};
		nextServers[name] = {
			...existing,
			...desired,
		};
	}

	const next = {
		...current,
		mcpServers: nextServers,
	};

	try {
		writeFileSync(
			getMcpJsonPath(),
			`${JSON.stringify(next, null, 2)}\n`,
			"utf-8",
		);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			mcpError: {
				ok: false,
				kind: "unreadable",
				path: getMcpJsonPath(),
				message: toErrorMessage(error),
			},
		};
	}
}
