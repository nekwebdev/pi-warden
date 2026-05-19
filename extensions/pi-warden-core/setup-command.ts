import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	DISPLAY_NAME,
	INSTALL_TIMEOUT_MS,
	SETUP_COMMAND,
	STDERR_SNIPPET_CHARS,
} from "./constants.js";
import type { ExternalDependencyStatus } from "./package-checks.js";
import { getExternalDependencyStatuses } from "./package-checks.js";
import { spawnPiInstall, spawnPiRemove } from "./pi-installer.js";
import { showSetupPanel, type SetupPanelUI } from "./setup-panel.js";
import {
	formatPiAgentSettingsError,
	getPiWardenSettings,
	toErrorMessage,
	writePiWardenSettings,
} from "./utils.js";

type UI = {
	notify: (message: string, severity: "info" | "warning" | "error") => void;
	confirm: (title: string, body: string) => Promise<boolean>;
	custom: SetupPanelUI["custom"];
};

type CommandContext = { hasUI: boolean; ui: UI };
type PackageCommand = typeof spawnPiInstall;

type SetupCommandOptions = {
	readonly installPackage?: PackageCommand;
	readonly removePackage?: PackageCommand;
};

export type SetupDependencyChoice = {
	readonly pkg: string;
	readonly checked: boolean;
};

export type SetupUpdateRequest = {
	readonly choices: readonly SetupDependencyChoice[];
	readonly suppressMissingWarnings: boolean;
};

type PackageAction = {
	readonly operation: "install" | "remove";
	readonly pkg: string;
};

type SetupUpdateSummary = {
	readonly installed: string[];
	readonly removed: string[];
	readonly failed: Array<{
		readonly operation: PackageAction["operation"] | "settings";
		readonly pkg: string;
		readonly error: string;
	}>;
	readonly preferenceUpdated: boolean;
};

const MSG_INTERACTIVE_ONLY = `/${SETUP_COMMAND} requires interactive mode`;
const MSG_CANCELLED = `/${SETUP_COMMAND} cancelled`;
const MSG_RESTART =
	"Restart your Pi session to load newly installed external packages.";
const MSG_SETTINGS_ERROR_PREFIX = `${DISPLAY_NAME} setup cannot read Pi settings`;

type DependencyCheckError = Extract<
	ReturnType<typeof getExternalDependencyStatuses>,
	{ ok: false }
>;

function notifySettingsError(ui: UI, result: DependencyCheckError): void {
	ui.notify(
		`${MSG_SETTINGS_ERROR_PREFIX} (${formatPiAgentSettingsError(
			result.settingsError,
		)}). Fix settings before running /${SETUP_COMMAND}.`,
		"error",
	);
}

export function registerSetupCommand(
	pi: ExtensionAPI,
	options: SetupCommandOptions = {},
): void {
	const installPackage = options.installPackage ?? spawnPiInstall;
	const removePackage = options.removePackage ?? spawnPiRemove;
	pi.registerCommand(SETUP_COMMAND, {
		description: "Configure Pi Warden external dependencies",
		handler: (args, ctx) =>
			handleSetupCommand(
				args,
				ctx as CommandContext,
				installPackage,
				removePackage,
			),
	});
}

async function handleSetupCommand(
	_args: string,
	ctx: CommandContext,
	installPackage: PackageCommand,
	removePackage: PackageCommand,
): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(MSG_INTERACTIVE_ONLY, "error");
		return;
	}

	const previewResult = getExternalDependencyStatuses();
	if (!previewResult.ok) {
		notifySettingsError(ctx.ui, previewResult);
		return;
	}

	const panelResult = await showSetupPanel(
		ctx.ui,
		previewResult.statuses,
		getPiWardenSettings(previewResult.settings)
			.doNotWarnForMissingDependencies === true,
	);
	if (panelResult.action === "cancel") {
		ctx.ui.notify(MSG_CANCELLED, "info");
		return;
	}

	const updateResult = await applySetupUpdate(
		ctx.ui,
		panelResult,
		installPackage,
		removePackage,
	);
	if ("settingsError" in updateResult) {
		notifySettingsError(ctx.ui, updateResult);
		return;
	}

	ctx.ui.notify(
		buildUpdateReport(updateResult),
		updateResult.failed.length > 0 ? "warning" : "info",
	);
}

export async function applySetupUpdate(
	ui: Pick<UI, "notify">,
	request: SetupUpdateRequest,
	installPackage: PackageCommand,
	removePackage: PackageCommand,
): Promise<SetupUpdateSummary | DependencyCheckError> {
	const revalidated = getExternalDependencyStatuses();
	if (!revalidated.ok) return revalidated;

	const actions = buildPackageActions(revalidated.statuses, request.choices);
	const installed: string[] = [];
	const removed: string[] = [];
	const failed: SetupUpdateSummary["failed"] = [];

	for (const action of actions) {
		const command =
			action.operation === "install" ? installPackage : removePackage;
		ui.notify(
			`${action.operation === "install" ? "Installing" : "Removing"} ${action.pkg}…`,
			"info",
		);
		try {
			const result = await command(action.pkg, INSTALL_TIMEOUT_MS);
			if (result.code === 0) {
				if (action.operation === "install") installed.push(action.pkg);
				else removed.push(action.pkg);
			} else {
				failed.push({
					operation: action.operation,
					pkg: action.pkg,
					error: installerFailureMessage(result),
				});
			}
		} catch (error) {
			failed.push({
				operation: action.operation,
				pkg: action.pkg,
				error: toErrorMessage(error),
			});
		}
	}

	const currentPreference =
		getPiWardenSettings(revalidated.settings)
			.doNotWarnForMissingDependencies === true;
	let preferenceUpdated = false;
	if (currentPreference !== request.suppressMissingWarnings) {
		const result = writePiWardenSettings({
			doNotWarnForMissingDependencies: request.suppressMissingWarnings,
		});
		if (result.ok) {
			preferenceUpdated = true;
		} else {
			failed.push({
				operation: "settings",
				pkg: "piWarden.doNotWarnForMissingDependencies",
				error: formatPiAgentSettingsError(result.settingsError),
			});
		}
	}

	return { installed, removed, failed, preferenceUpdated };
}

export function buildPackageActions(
	statuses: readonly ExternalDependencyStatus[],
	choices: readonly SetupDependencyChoice[],
): PackageAction[] {
	const choicesByPkg = new Map(choices.map((choice) => [choice.pkg, choice]));
	const actions: PackageAction[] = [];

	for (const status of statuses) {
		if (!status.mutable) continue;
		const choice = choicesByPkg.get(status.dependency.pkg);
		const desired = choice?.checked ?? status.installed;
		if (desired && !status.installed) {
			actions.push({ operation: "install", pkg: status.dependency.pkg });
		} else if (!desired && status.kind === "canonical") {
			actions.push({ operation: "remove", pkg: status.dependency.pkg });
		}
	}

	return actions;
}

export function buildUpdateReport(summary: SetupUpdateSummary): string {
	const lines: string[] = [];
	if (summary.installed.length > 0)
		lines.push(`✓ Installed: ${summary.installed.join(", ")}`);
	if (summary.removed.length > 0)
		lines.push(`✓ Removed: ${summary.removed.join(", ")}`);
	if (summary.preferenceUpdated)
		lines.push("✓ Updated missing-dependency warning preference");
	if (summary.failed.length > 0) {
		lines.push("✗ Failed:");
		for (const { operation, pkg, error } of summary.failed)
			lines.push(`  ${operation} ${pkg}: ${error}`);
	}
	if (summary.installed.length > 0 || summary.removed.length > 0) {
		lines.push("");
		lines.push(MSG_RESTART);
	}
	if (lines.length === 0) return `${DISPLAY_NAME} setup already up to date.`;
	return lines.join("\n");
}

function installerFailureMessage(result: {
	code: number;
	stdout: string;
	stderr: string;
}): string {
	const stderr = result.stderr.trim();
	if (stderr) return stderr.slice(0, STDERR_SNIPPET_CHARS);
	const stdout = result.stdout.trim();
	if (stdout) return stdout.slice(0, STDERR_SNIPPET_CHARS);
	return `exit ${result.code}`;
}
