import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PI_AGENT_SETTINGS_RELATIVE } from "./constants.js";

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

export function getPiAgentSettingsPath(): string {
	if (process.env.PI_WARDEN_TEST_HOME) {
		return join(process.env.PI_WARDEN_TEST_HOME, ...PI_AGENT_SETTINGS_RELATIVE);
	}

	if (process.env.PI_CODING_AGENT_DIR) {
		return join(process.env.PI_CODING_AGENT_DIR, "settings.json");
	}

	return join(homedir(), ...PI_AGENT_SETTINGS_RELATIVE);
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
