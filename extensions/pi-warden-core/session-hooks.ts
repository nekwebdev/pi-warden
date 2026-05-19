import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DISPLAY_NAME, SETUP_COMMAND } from "./constants.js";
import { getExternalDependencyStatuses } from "./package-checks.js";
import { formatPiAgentSettingsError, getPiWardenSettings } from "./utils.js";

type UI = {
	notify: (message: string, severity: "info" | "warning" | "error") => void;
};

type SessionStartContext = { hasUI: boolean; ui: UI };

let lastMissingDependencyWarningKey: string | undefined;

export function registerSessionHooks(pi: ExtensionAPI): void {
	lastMissingDependencyWarningKey = undefined;
	pi.on("session_start", async (_event, ctx) =>
		onSessionStart(ctx as SessionStartContext),
	);
}

async function onSessionStart(ctx: SessionStartContext): Promise<void> {
	if (!ctx.hasUI) return;
	warnMissingExternalDependencies(ctx.ui);
}

function warnMissingExternalDependencies(ui: UI): void {
	const result = getExternalDependencyStatuses();
	if (!result.ok) {
		const warningKey = `settings-error:${result.settingsError.kind}:${result.settingsError.message}`;
		if (warningKey === lastMissingDependencyWarningKey) return;
		lastMissingDependencyWarningKey = warningKey;
		ui.notify(
			`${DISPLAY_NAME} setup cannot read Pi settings (${formatPiAgentSettingsError(
				result.settingsError,
			)}). Fix settings before running /${SETUP_COMMAND}.`,
			"error",
		);
		return;
	}

	const missing = result.statuses.filter((status) => !status.installed);
	if (missing.length === 0) {
		lastMissingDependencyWarningKey = undefined;
		return;
	}

	const piWarden = getPiWardenSettings(result.settings);
	if (piWarden.doNotWarnForMissingDependencies === true) {
		lastMissingDependencyWarningKey = undefined;
		return;
	}

	const warningKey = missing
		.map((status) => status.dependency.pkg)
		.sort()
		.join("|");
	if (warningKey === lastMissingDependencyWarningKey) return;
	lastMissingDependencyWarningKey = warningKey;

	const list = missing
		.map((status) => status.dependency.pkg.replace(/^npm:/, ""))
		.join(", ");
	ui.notify(
		`${DISPLAY_NAME} setup needs ${missing.length} external package(s): ${list}. Run /${SETUP_COMMAND} to install them.`,
		"warning",
	);
}
