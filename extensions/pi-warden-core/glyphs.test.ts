import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPanelGlyphs, renderPanelBorder } from "./glyphs.js";

describe("getPanelGlyphs", () => {
	it("returns the regular unicode panel glyph map when nerd glyphs are disabled", () => {
		assert.deepEqual(getPanelGlyphs(false), {
			border: {
				topLeft: "┏",
				topRight: "┓",
				bottomLeft: "┗",
				bottomRight: "┛",
				horizontal: "━",
				vertical: "┃",
			},
			pointer: "> ",
			checkboxOn: "[x]",
			checkboxOff: "[ ]",
			bullet: "•",
		});
	});

	it("returns the nerd panel glyph map when nerd glyphs are enabled", () => {
		assert.deepEqual(getPanelGlyphs(true), {
			border: {
				topLeft: "┏",
				topRight: "┓",
				bottomLeft: "┗",
				bottomRight: "┛",
				horizontal: "━",
				vertical: "┃",
			},
			pointer: " ",
			checkboxOn: "󰡖",
			checkboxOff: "󰄱",
			bullet: "•",
		});
	});
});

describe("renderPanelBorder", () => {
	it("renders regular unicode border strings from a border glyph map", () => {
		assert.deepEqual(renderPanelBorder(getPanelGlyphs(false).border, 4), {
			top: "┏━━━━┓",
			bottom: "┗━━━━┛",
			left: "┃",
			right: "┃",
		});
	});

	it("renders nerd border strings from a border glyph map", () => {
		assert.deepEqual(renderPanelBorder(getPanelGlyphs(true).border, 4), {
			top: "┏━━━━┓",
			bottom: "┗━━━━┛",
			left: "┃",
			right: "┃",
		});
	});
});
