import type { Component } from "@earendil-works/pi-tui";
import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
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
		options?: {
			overlay?: boolean;
			overlayOptions?: {
				width?: number | `${number}%`;
				minWidth?: number;
				maxHeight?: number | `${number}%`;
				anchor?:
					| "center"
					| "top-left"
					| "top-center"
					| "top-right"
					| "left-center"
					| "right-center"
					| "bottom-left"
					| "bottom-center"
					| "bottom-right";
				offsetX?: number;
				offsetY?: number;
				row?: number | `${number}%`;
				col?: number | `${number}%`;
				margin?:
					| number
					| { top?: number; right?: number; bottom?: number; left?: number };
				visible?: (termWidth: number, termHeight: number) => boolean;
				nonCapturing?: boolean;
			};
		},
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
	| { readonly kind: "update" };

export async function showSetupPanel(
	ui: SetupPanelUI,
	statuses: readonly ExternalDependencyStatus[],
	initialSuppressMissingWarnings: boolean,
): Promise<SetupPanelResult> {
	let lastTermHeight: number | undefined;

	return ui.custom<SetupPanelResult>(
		(tui, theme, _keybindings, done) => {
			const items: PanelItem[] = [
				...statuses.map((status) => ({ kind: "dependency" as const, status })),
				{ kind: "warning-toggle" },
				{ kind: "update" },
			];
			let selected = 0;
			let suppressMissingWarnings = initialSuppressMissingWarnings;
			let cachedLines: string[] | undefined;
			let cachedWidth: number | undefined;
			let cachedHeight: number | undefined;
			const checkedByPkg = new Map(
				statuses.map((status) => [status.dependency.pkg, status.installed]),
			);

			function refresh() {
				cachedLines = undefined;
				cachedWidth = undefined;
				cachedHeight = undefined;
				tui.requestRender();
			}

			function buildChoices(): SetupDependencyChoice[] {
				return statuses.map((status) => ({
					pkg: status.dependency.pkg,
					checked: checkedByPkg.get(status.dependency.pkg) === true,
				}));
			}

			function hasPendingChanges(): boolean {
				if (suppressMissingWarnings !== initialSuppressMissingWarnings)
					return true;
				return statuses.some((status) => {
					if (!status.mutable) return false;
					const checked = checkedByPkg.get(status.dependency.pkg) === true;
					return checked !== status.installed;
				});
			}

			function submitUpdate() {
				if (!hasPendingChanges()) return;
				done({
					action: "update",
					choices: buildChoices(),
					suppressMissingWarnings,
				});
			}

			function moveSelected(delta: -1 | 1) {
				let next = selected;
				for (let i = 0; i < items.length; i++) {
					next = Math.min(items.length - 1, Math.max(0, next + delta));
					const it = items[next];
					if (!it) break;
					if (it.kind === "update" && !hasPendingChanges()) continue;
					selected = next;
					break;
				}
				refresh();
			}

			function handleInput(data: string): void {
				if (matchesKey(data, Key.up)) {
					moveSelected(-1);
					return;
				}
				if (matchesKey(data, Key.down)) {
					moveSelected(1);
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
				if (
					cachedLines &&
					cachedWidth === width &&
					cachedHeight === lastTermHeight
				)
					return cachedLines;
				const lines: string[] = [];

				const borderColor = "borderAccent" as const;
				const leftBorder = theme.fg(borderColor, "│");
				const rightBorder = theme.fg(borderColor, "│");

				const boxWidth = Math.max(4, width);
				const innerWidth = Math.max(1, boxWidth - 2);

				const padX = 2;
				const innerContentWidth = Math.max(1, innerWidth - padX * 2);

				const top = theme.fg(borderColor, "╭" + "─".repeat(innerWidth) + "╮");
				const bottom = theme.fg(
					borderColor,
					"╰" + "─".repeat(innerWidth) + "╯",
				);

				const minBoxHeight =
					lastTermHeight === undefined
						? undefined
						: Math.max(6, Math.ceil(lastTermHeight * 0.3));

				const withPanelBg = (line: string): string => {
					const truncated = truncateToWidth(line, innerContentWidth);
					const padded =
						" ".repeat(padX) +
						truncated +
						" ".repeat(
							Math.max(0, innerContentWidth - visibleWidth(truncated)),
						) +
						" ".repeat(padX);
					return theme.bg("toolPendingBg", padded);
				};

				const addInner = (line: string) =>
					lines.push(leftBorder + withPanelBg(line) + rightBorder);

				lines.push(top);

				addInner(theme.fg("accent", "Pi Warden packages setup"));
				addInner("");
				addInner(
					theme.fg(
						"dim",
						"Space/Enter toggles rows. Update applies changes (install/remove).",
					),
				);
				addInner("");

				const pointer = theme.bold(theme.fg("text", " "));
				const styleActive = (active: boolean, s: string) =>
					active ? theme.bold(s) : s;

				const renderWarningToggleRow = (mark: string): string => {
					const row = `${mark} Do not warn for missing dependencies`;
					if (suppressMissingWarnings === initialSuppressMissingWarnings)
						return theme.fg("text", row);
					return suppressMissingWarnings
						? theme.fg("success", row)
						: theme.fg("warning", row);
				};

				items.forEach((item, index) => {
					// layout:
					// pkg1..pkgx
					// (blank)
					// warn
					// (blank)
					// Update
					if (item.kind === "warning-toggle" && statuses.length > 0)
						addInner("");
					if (item.kind === "update") addInner("");

					const active = index === selected;
					const prefix = active ? pointer : "  ";

					if (item.kind === "dependency") {
						addInner(
							styleActive(active, prefix + renderDependencyRow(item.status)),
						);
					} else if (item.kind === "warning-toggle") {
						const mark = suppressMissingWarnings ? "󰡖" : "󰄱";
						addInner(
							styleActive(active, prefix + renderWarningToggleRow(mark)),
						);
					} else {
						const pending = hasPendingChanges();
						const label = pending
							? theme.bold(theme.fg("text", "Update"))
							: theme.fg("muted", "No changes");
						addInner(styleActive(active, prefix + label));
					}
				});

				// footer hints: force to bottom of box
				if (minBoxHeight !== undefined) {
					const targetInnerLines = Math.max(1, minBoxHeight - 2);
					const linesBeforeFooter = lines.length - 1; // minus top
					const footerLines = 2;
					const padCount = Math.max(
						0,
						targetInnerLines - (linesBeforeFooter + footerLines),
					);
					for (let i = 0; i < padCount; i++) addInner("");
				}

				addInner("");
				addInner(
					theme.fg(
						"dim",
						"↑↓ navigate • Space/Enter toggle/select • Esc cancel",
					),
				);

				lines.push(bottom);
				cachedLines = lines;
				cachedWidth = width;
				cachedHeight = lastTermHeight;
				return cachedLines;
			}

			function renderDependencyRow(status: ExternalDependencyStatus): string {
				const checked = checkedByPkg.get(status.dependency.pkg) === true;
				const mark = checked ? "󰡖" : "󰄱";
				const sourceLabel =
					status.kind === "canonical"
						? ""
						: status.kind === "accepted"
							? `user-managed ${status.matchedSource ?? "accepted source"}`
							: "missing";
				const sourcePart = sourceLabel.length > 0 ? ` — ${sourceLabel}` : "";
				const row = `${mark} ${status.dependency.pkg}${sourcePart} — ${status.dependency.provides}`;
				if (status.kind === "accepted") return theme.fg("dim", row);
				if (checked === status.installed) return theme.fg("text", row);
				if (checked) return theme.fg("success", row);
				return theme.fg("warning", row);
			}

			return {
				render,
				handleInput,
				invalidate() {
					cachedLines = undefined;
					cachedWidth = undefined;
					cachedHeight = undefined;
				},
			};
		},
		{
			overlay: true,
			overlayOptions: {
				// capture terminal dims so render can pad to % height
				visible: (_termWidth, termHeight) => {
					lastTermHeight = termHeight;
					return true;
				},
			},
		},
	);
}
