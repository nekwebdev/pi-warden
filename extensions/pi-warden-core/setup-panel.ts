import type { Component } from "@earendil-works/pi-tui";
import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { getPanelGlyphs } from "./glyphs.js";
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

type TabId = "Packages" | "Display" | "lorem" | "ipsum";

const TABS: readonly TabId[] = ["Packages", "Display", "lorem", "ipsum"];

type PanelItem =
	| { readonly kind: "dependency"; readonly status: ExternalDependencyStatus }
	| { readonly kind: "warning-toggle" }
	| { readonly kind: "nerd-glyphs-toggle" }
	| { readonly kind: "update" };

export async function showSetupPanel(
	ui: SetupPanelUI,
	statuses: readonly ExternalDependencyStatus[],
	initialSuppressMissingWarnings: boolean,
	initialUseNerdGlyphs = false,
): Promise<SetupPanelResult> {
	let lastTermHeight: number | undefined;

	return ui.custom<SetupPanelResult>(
		(tui, theme, _keybindings, done) => {
			let suppressMissingWarnings = initialSuppressMissingWarnings;
			let useNerdGlyphs = initialUseNerdGlyphs;
			let cachedLines: string[] | undefined;
			let cachedWidth: number | undefined;
			let cachedHeight: number | undefined;
			let activeTabIndex = 0;
			const selectedByTab = new Map<TabId, number>(
				TABS.map((tab) => [tab, 0] as const),
			);
			const checkedByPkg = new Map(
				statuses.map((status) => [status.dependency.pkg, status.installed]),
			);

			function refresh() {
				cachedLines = undefined;
				cachedWidth = undefined;
				cachedHeight = undefined;
				tui.requestRender();
			}

			function tabId(): TabId {
				return TABS[activeTabIndex] ?? "Packages";
			}

			function selectedIndex(): number {
				return selectedByTab.get(tabId()) ?? 0;
			}

			function setSelected(index: number) {
				selectedByTab.set(tabId(), index);
			}

			function itemsForTab(): PanelItem[] {
				const tab = tabId();
				if (tab === "Packages") {
					return [
						...statuses.map((status) => ({
							kind: "dependency" as const,
							status,
						})),
						{ kind: "warning-toggle" },
						{ kind: "update" },
					];
				}
				if (tab === "Display") {
					return [{ kind: "nerd-glyphs-toggle" }, { kind: "update" }];
				}
				return [{ kind: "update" }];
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
				if (useNerdGlyphs !== initialUseNerdGlyphs) return true;
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
					useNerdGlyphs,
				});
			}

			function switchTab(delta: -1 | 1) {
				activeTabIndex = (activeTabIndex + delta + TABS.length) % TABS.length;
				const items = itemsForTab();
				setSelected(Math.min(items.length - 1, Math.max(0, selectedIndex())));
				refresh();
			}

			function moveSelected(delta: -1 | 1) {
				const items = itemsForTab();
				let next = selectedIndex();
				for (let i = 0; i < items.length; i++) {
					next = Math.min(items.length - 1, Math.max(0, next + delta));
					const item = items[next];
					if (!item) break;
					if (item.kind === "update" && !hasPendingChanges()) continue;
					setSelected(next);
					break;
				}
				refresh();
			}

			function handleInput(data: string): void {
				if (matchesKey(data, Key.tab)) {
					switchTab(1);
					return;
				}
				if (matchesKey(data, Key.shift("tab"))) {
					switchTab(-1);
					return;
				}
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

				const item = itemsForTab()[selectedIndex()];
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
				if (item.kind === "nerd-glyphs-toggle") {
					useNerdGlyphs = !useNerdGlyphs;
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

				const glyphs = getPanelGlyphs(useNerdGlyphs);
				const borderColor = "borderAccent" as const;
				const leftBorder = theme.fg(borderColor, glyphs.border.vertical);
				const rightBorder = theme.fg(borderColor, glyphs.border.vertical);

				const boxWidth = Math.max(4, width);
				const innerWidth = Math.max(1, boxWidth - 2);

				const padX = 2;
				const innerContentWidth = Math.max(1, innerWidth - padX * 2);

				const top = theme.fg(
					borderColor,
					glyphs.border.topLeft +
						glyphs.border.horizontal.repeat(innerWidth) +
						glyphs.border.topRight,
				);
				const bottom = theme.fg(
					borderColor,
					glyphs.border.bottomLeft +
						glyphs.border.horizontal.repeat(innerWidth) +
						glyphs.border.bottomRight,
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

				addInner(theme.fg("accent", "Pi Warden configuration"));
				addInner(renderTabStrip(theme));
				addInner("");

				const activeTab = tabId();
				if (activeTab === "Packages") {
					addInner(
						theme.fg(
							"dim",
							"Space/Enter toggles rows. Update applies changes (install/remove).",
						),
					);
					addInner("");
				} else if (activeTab === "Display") {
					addInner(
						theme.fg(
							"dim",
							"Space/Enter toggles settings. Update saves changes.",
						),
					);
					addInner("");
				} else {
					addInner(theme.fg("dim", "No options in this tab yet."));
					addInner("");
				}

				const pointer = theme.bold(theme.fg("text", glyphs.pointer));
				const styleActive = (active: boolean, value: string) =>
					active ? theme.bold(value) : value;

				const items = itemsForTab();
				items.forEach((item, index) => {
					if (item.kind === "warning-toggle" && statuses.length > 0)
						addInner("");
					if (item.kind === "update") addInner("");

					const active = index === selectedIndex();
					const prefix = active ? pointer : "  ";

					if (item.kind === "dependency") {
						addInner(
							styleActive(
								active,
								prefix + renderDependencyRow(theme, glyphs, item.status),
							),
						);
					} else if (item.kind === "warning-toggle") {
						addInner(
							styleActive(
								active,
								prefix + renderWarningToggleRow(theme, glyphs),
							),
						);
					} else if (item.kind === "nerd-glyphs-toggle") {
						addInner(
							styleActive(
								active,
								prefix + renderNerdGlyphsToggleRow(theme, glyphs),
							),
						);
					} else {
						const pending = hasPendingChanges();
						const label = pending
							? theme.bold(theme.fg("text", "Update"))
							: theme.fg("muted", "No changes");
						addInner(styleActive(active, prefix + label));
					}
				});

				if (minBoxHeight !== undefined) {
					const targetInnerLines = Math.max(1, minBoxHeight - 2);
					const linesBeforeFooter = lines.length - 1;
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
						`↑↓ navigate ${glyphs.bullet} Space/Enter toggle/select ${glyphs.bullet} Tab/Shift+Tab switch tabs ${glyphs.bullet} Esc cancel`,
					),
				);

				lines.push(bottom);
				cachedLines = lines;
				cachedWidth = width;
				cachedHeight = lastTermHeight;
				return cachedLines;
			}

			function renderTabStrip(theme: SetupPanelTheme): string {
				return TABS.map((tab, index) => {
					if (index === activeTabIndex)
						return theme.bold(theme.fg("text", tab));
					return theme.fg("muted", tab);
				}).join(theme.fg("muted", " | "));
			}

			function renderWarningToggleRow(
				theme: SetupPanelTheme,
				glyphs: ReturnType<typeof getPanelGlyphs>,
			): string {
				const mark = suppressMissingWarnings
					? glyphs.checkboxOn
					: glyphs.checkboxOff;
				const row = `${mark} Do not warn for missing dependencies`;
				if (suppressMissingWarnings === initialSuppressMissingWarnings)
					return theme.fg("text", row);
				return suppressMissingWarnings
					? theme.fg("success", row)
					: theme.fg("warning", row);
			}

			function renderNerdGlyphsToggleRow(
				theme: SetupPanelTheme,
				glyphs: ReturnType<typeof getPanelGlyphs>,
			): string {
				const mark = useNerdGlyphs ? glyphs.checkboxOn : glyphs.checkboxOff;
				const row = `${mark} Use Nerd Glyphs, requires compatible Nerd font`;
				if (useNerdGlyphs === initialUseNerdGlyphs)
					return theme.fg("text", row);
				return useNerdGlyphs
					? theme.fg("success", row)
					: theme.fg("warning", row);
			}

			function renderDependencyRow(
				theme: SetupPanelTheme,
				glyphs: ReturnType<typeof getPanelGlyphs>,
				status: ExternalDependencyStatus,
			): string {
				const checked = checkedByPkg.get(status.dependency.pkg) === true;
				const mark = checked ? glyphs.checkboxOn : glyphs.checkboxOff;
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
				visible: (_termWidth, termHeight) => {
					lastTermHeight = termHeight;
					return true;
				},
			},
		},
	);
}
