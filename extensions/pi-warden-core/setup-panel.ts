import type { Component } from "@earendil-works/pi-tui";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { ExternalDependencyStatus } from "./package-checks.js";
import type {
	SetupDependencyChoice,
	SetupUpdateRequest,
} from "./setup-command.js";

export type SetupPanelResult =
	| { readonly action: "cancel" }
	| ({ readonly action: "update" } & SetupUpdateRequest);

export type SetupPanelUI = {
	custom: <T>(
		factory: (
			tui: { requestRender: () => void },
			theme: SetupPanelTheme,
			keybindings: unknown,
			done: (value: T) => void,
		) => Component,
		options?: { overlay?: boolean },
	) => Promise<T>;
};

type SetupPanelTheme = {
	fg: (name: string, text: string) => string;
	bg: (name: string, text: string) => string;
	bold: (text: string) => string;
};

type PanelItem =
	| { readonly kind: "dependency"; readonly status: ExternalDependencyStatus }
	| { readonly kind: "warning-toggle" }
	| { readonly kind: "update" }
	| { readonly kind: "cancel" };

export async function showSetupPanel(
	ui: SetupPanelUI,
	statuses: readonly ExternalDependencyStatus[],
	initialSuppressMissingWarnings: boolean,
): Promise<SetupPanelResult> {
	return ui.custom<SetupPanelResult>(
		(tui, theme, _keybindings, done) => {
			const items: PanelItem[] = [
				...statuses.map((status) => ({ kind: "dependency" as const, status })),
				{ kind: "warning-toggle" },
				{ kind: "update" },
				{ kind: "cancel" },
			];
			let selected = 0;
			let suppressMissingWarnings = initialSuppressMissingWarnings;
			let cachedLines: string[] | undefined;
			const checkedByPkg = new Map(
				statuses.map((status) => [status.dependency.pkg, status.installed]),
			);

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function buildChoices(): SetupDependencyChoice[] {
				return statuses.map((status) => ({
					pkg: status.dependency.pkg,
					checked: checkedByPkg.get(status.dependency.pkg) === true,
				}));
			}

			function submitUpdate() {
				done({
					action: "update",
					choices: buildChoices(),
					suppressMissingWarnings,
				});
			}

			function handleInput(data: string): void {
				if (matchesKey(data, Key.up)) {
					selected = Math.max(0, selected - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					selected = Math.min(items.length - 1, selected + 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.escape)) {
					done({ action: "cancel" });
					return;
				}
				if (!matchesKey(data, Key.enter) && !matchesKey(data, Key.space))
					return;

				const item = items[selected];
				if (!item) return;
				if (item.kind === "dependency") {
					if (!item.status.mutable) return;
					const pkg = item.status.dependency.pkg;
					checkedByPkg.set(pkg, checkedByPkg.get(pkg) !== true);
					refresh();
					return;
				}
				if (item.kind === "warning-toggle") {
					suppressMissingWarnings = !suppressMissingWarnings;
					refresh();
					return;
				}
				if (item.kind === "update") {
					submitUpdate();
					return;
				}
				done({ action: "cancel" });
			}

			function render(width: number): string[] {
				if (cachedLines) return cachedLines;
				const lines: string[] = [];
				const add = (line: string) => lines.push(truncateToWidth(line, width));

				add(theme.fg("accent", "Pi Warden setup"));
				add(
					theme.fg(
						"dim",
						"Space/Enter toggles rows. Update applies canonical package choices.",
					),
				);
				lines.push("");

				items.forEach((item, index) => {
					const active = index === selected;
					const prefix = active ? theme.fg("accent", "> ") : "  ";
					if (item.kind === "dependency") {
						add(prefix + renderDependencyRow(item.status));
					} else if (item.kind === "warning-toggle") {
						const mark = suppressMissingWarnings ? "☑" : "☐";
						add(`${prefix}${mark} Do not warn for missing dependencies`);
					} else if (item.kind === "update") {
						add(prefix + theme.fg("success", "Update"));
					} else {
						add(prefix + theme.fg("muted", "Cancel"));
					}
				});

				lines.push("");
				add(
					theme.fg(
						"dim",
						"↑↓ navigate • Space/Enter toggle/select • Esc cancel",
					),
				);
				cachedLines = lines;
				return cachedLines;
			}

			function renderDependencyRow(status: ExternalDependencyStatus): string {
				const checked = checkedByPkg.get(status.dependency.pkg) === true;
				const mark = checked ? "☑" : "☐";
				const sourceLabel =
					status.kind === "canonical"
						? "canonical"
						: status.kind === "accepted"
							? `user-managed ${status.matchedSource ?? "accepted source"}`
							: "missing";
				const row = `${mark} ${status.dependency.pkg} — ${sourceLabel} — ${status.dependency.provides}`;
				if (status.kind === "accepted") return theme.fg("dim", row);
				if (checked) return theme.fg("success", row);
				return theme.fg("warning", row);
			}

			return {
				render,
				handleInput,
				invalidate() {
					cachedLines = undefined;
				},
			};
		},
		{ overlay: true },
	);
}
