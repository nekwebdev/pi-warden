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

const NERD_GLYPHS: PanelGlyphs = {
	border: {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
	},
	pointer: " ",
	checkboxOn: "󰡖",
	checkboxOff: "󰄱",
	bullet: "•",
};

const ASCII_GLYPHS: PanelGlyphs = {
	border: {
		topLeft: "+",
		topRight: "+",
		bottomLeft: "+",
		bottomRight: "+",
		horizontal: "-",
		vertical: "|",
	},
	pointer: "> ",
	checkboxOn: "[x]",
	checkboxOff: "[ ]",
	bullet: "*",
};

export function getPanelGlyphs(useNerdGlyphs: boolean): PanelGlyphs {
	return useNerdGlyphs ? NERD_GLYPHS : ASCII_GLYPHS;
}
