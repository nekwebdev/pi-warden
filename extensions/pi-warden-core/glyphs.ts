export type PanelBorderGlyphs = {
	readonly topLeft: string;
	readonly topRight: string;
	readonly bottomLeft: string;
	readonly bottomRight: string;
	readonly horizontal: string;
	readonly vertical: string;
};

export type PanelGlyphs = {
	readonly border: PanelBorderGlyphs;
	readonly pointer: string;
	readonly checkboxOn: string;
	readonly checkboxOff: string;
	readonly bullet: string;
};

export type RenderedPanelBorder = {
	readonly top: string;
	readonly bottom: string;
	readonly left: string;
	readonly right: string;
};

const HEAVY_BORDER_GLYPHS: PanelBorderGlyphs = {
	topLeft: "┏",
	topRight: "┓",
	bottomLeft: "┗",
	bottomRight: "┛",
	horizontal: "━",
	vertical: "┃",
};

const NERD_GLYPHS: PanelGlyphs = {
	border: HEAVY_BORDER_GLYPHS,
	pointer: " ",
	checkboxOn: "󰡖",
	checkboxOff: "󰄱",
	bullet: "•",
};

const UNICODE_GLYPHS: PanelGlyphs = {
	border: HEAVY_BORDER_GLYPHS,
	pointer: "> ",
	checkboxOn: "[x]",
	checkboxOff: "[ ]",
	bullet: "•",
};

export function getPanelGlyphs(useNerdGlyphs: boolean): PanelGlyphs {
	return useNerdGlyphs ? NERD_GLYPHS : UNICODE_GLYPHS;
}

export function renderPanelBorder(
	border: PanelBorderGlyphs,
	innerWidth: number,
): RenderedPanelBorder {
	const horizontal = border.horizontal.repeat(Math.max(0, innerWidth));
	return {
		top: `${border.topLeft}${horizontal}${border.topRight}`,
		bottom: `${border.bottomLeft}${horizontal}${border.bottomRight}`,
		left: border.vertical,
		right: border.vertical,
	};
}
