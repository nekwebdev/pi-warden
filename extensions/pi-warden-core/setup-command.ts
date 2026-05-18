import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	DISPLAY_NAME,
	INSTALL_TIMEOUT_MS,
	SETUP_COMMAND,
	STDERR_SNIPPET_CHARS,
} from "./constants.js";
import type { ExternalDependency } from "./external-deps.js";
import { findMissingExternalDependencies } from "./package-checks.js";
import { spawnPiInstall } from "./pi-installer.js";
import {
	formatPiAgentSettingsError,
	getPiAgentSettingsPath,
	toErrorMessage,
} from "./utils.js";

type UI = {
	notify: (message: string, severity: "info" | "warning" | "error") => void;
	confirm: (title: string, body: string) => Promise<boolean>;
};

type CommandContext = { hasUI: boolean; ui: UI };
type InstallPackage = typeof spawnPiInstall;

type SetupCommandOptions = {
	readonly installPackage?: InstallPackage;
};

type InstallSummary = {
	readonly succeeded: string[];
	readonly failed: Array<{ readonly pkg: string; readonly error: string }>;
};

const MSG_INTERACTIVE_ONLY = `/${SETUP_COMMAND} requires interactive mode`;
const MSG_NOTHING_TO_DO = `${DISPLAY_NAME} external dependencies already installed.`;
const MSG_CANCELLED = `/${SETUP_COMMAND} cancelled`;
const MSG_CONFIRM_TITLE = `Apply ${DISPLAY_NAME} setup changes?`;
const MSG_RESTART =
	"Restart your Pi session to load newly installed external packages.";
const MSG_SETTINGS_ERROR_PREFIX = `${DISPLAY_NAME} setup cannot read Pi settings`;
const MSG_CHANGED_DURING_CONFIRM = `${DISPLAY_NAME} external dependencies changed during confirmation; nothing to install.`;

type DependencyCheckError = Extract<
	ReturnType<typeof findMissingExternalDependencies>,
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

function buildConfirmBody(missing: readonly ExternalDependency[]): string {
	const lines = [`${DISPLAY_NAME} will apply the following changes:`, ""];
	lines.push("Install external Pi packages via `pi install`:");
	for (const dependency of missing) {
		lines.push(`  • ${dependency.pkg}  (provides ${dependency.provides})`);
	}
	lines.push("");
	lines.push(
		`Your ${getPiAgentSettingsPath()} packages list will be updated by Pi after successful installs. Proceed?`,
	);
	return lines.join("\n");
}

export function registerSetupCommand(
	pi: ExtensionAPI,
	options: SetupCommandOptions = {},
): void {
	const installPackage = options.installPackage ?? spawnPiInstall;
	pi.registerCommand(SETUP_COMMAND, {
		description: "Install Pi Warden external dependencies",
		handler: (args, ctx) =>
			handleSetupCommand(args, ctx as CommandContext, installPackage),
	});
}

async function handleSetupCommand(
	_args: string,
	ctx: CommandContext,
	installPackage: InstallPackage,
): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(MSG_INTERACTIVE_ONLY, "error");
		return;
	}

	const previewResult = findMissingExternalDependencies();
	if (!previewResult.ok) {
		notifySettingsError(ctx.ui, previewResult);
		return;
	}

	if (previewResult.missing.length === 0) {
		ctx.ui.notify(MSG_NOTHING_TO_DO, "info");
		return;
	}

	const confirmed = await ctx.ui.confirm(
		MSG_CONFIRM_TITLE,
		buildConfirmBody(previewResult.missing),
	);
	if (!confirmed) {
		ctx.ui.notify(MSG_CANCELLED, "info");
		return;
	}

	const installResult = findMissingExternalDependencies();
	if (!installResult.ok) {
		notifySettingsError(ctx.ui, installResult);
		return;
	}
	if (installResult.missing.length === 0) {
		ctx.ui.notify(MSG_CHANGED_DURING_CONFIRM, "info");
		return;
	}

	const summary = await installMissing(
		ctx.ui,
		installResult.missing,
		installPackage,
	);
	ctx.ui.notify(
		buildReport(summary),
		summary.failed.length > 0 ? "warning" : "info",
	);
}

async function installMissing(
	ui: UI,
	missing: readonly ExternalDependency[],
	installPackage: InstallPackage,
): Promise<InstallSummary> {
	const succeeded: string[] = [];
	const failed: InstallSummary["failed"] = [];

	for (const { pkg } of missing) {
		ui.notify(`Installing ${pkg}…`, "info");
		try {
			const result = await installPackage(pkg, INSTALL_TIMEOUT_MS);
			if (result.code === 0) {
				succeeded.push(pkg);
			} else {
				failed.push({
					pkg,
					error: installerFailureMessage(result),
				});
			}
		} catch (error) {
			failed.push({ pkg, error: toErrorMessage(error) });
		}
	}

	return { succeeded, failed };
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

function buildReport(summary: InstallSummary): string {
	const lines: string[] = [];
	if (summary.succeeded.length > 0)
		lines.push(`✓ Installed: ${summary.succeeded.join(", ")}`);
	if (summary.failed.length > 0) {
		lines.push("✗ Failed:");
		for (const { pkg, error } of summary.failed)
			lines.push(`  ${pkg}: ${error}`);
	}
	if (summary.succeeded.length > 0) {
		lines.push("");
		lines.push(MSG_RESTART);
	}
	return lines.join("\n");
}
