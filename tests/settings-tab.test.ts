import { beforeAll, describe, expect, it } from "vitest";
import type { App } from "obsidian";
import {
	BookSearchCoverSettingTab,
	DEFAULT_SETTINGS,
	type BookSearchCoverSettings,
} from "../src/settings";
import type BookSearchCoverPlugin from "../src/main";
import { VARIABLE_DOCS } from "../src/template";

// `createFragment` is an Obsidian global, used to build the linked description
// on the API key row. Descriptions are only constructed here, never rendered,
// so a fake that swallows the builder calls is enough.
beforeAll(() => {
	(globalThis as unknown as { createFragment: unknown }).createFragment = (
		cb?: (frag: unknown) => void,
	) => {
		const frag = { appendText: () => undefined, createEl: () => ({}) };
		cb?.(frag);
		return frag;
	};
});

/** The setting tab with a stand-in plugin, recording what gets persisted. */
function tab(overrides: Partial<BookSearchCoverSettings> = {}) {
	const settings = { ...DEFAULT_SETTINGS, ...overrides };
	let saves = 0;
	const plugin = {
		settings,
		saveSettings: () => {
			saves += 1;
			return Promise.resolve();
		},
	} as unknown as BookSearchCoverPlugin;
	return {
		tab: new BookSearchCoverSettingTab({} as App, plugin),
		settings,
		saveCount: () => saves,
	};
}

/** Every row across every group, flattened. */
function rows() {
	return tab()
		.tab.getSettingDefinitions()
		.flatMap((group) => ("items" in group ? (group.items ?? []) : [group]));
}

describe("declarative setting definitions", () => {
	it("exposes every row through named groups", () => {
		const groups = tab().tab.getSettingDefinitions();
		expect(groups.every((g) => "type" in g && g.type === "group")).toBe(true);
		expect(rows().length).toBeGreaterThan(0);
	});

	// Every row needs a name to be reachable from Obsidian's settings search —
	// the whole point of adopting the declarative API.
	it("names every row", () => {
		for (const row of rows()) {
			expect("name" in row && row.name).toBeTruthy();
		}
	});

	// `control`, `render` and `action` are mutually exclusive per the API.
	it("never combines a control with a render callback", () => {
		for (const row of rows()) {
			expect("control" in row && "render" in row && row.control && row.render).toBeFalsy();
		}
	});

	// Reference content is declarative all the way down: no SettingPage
	// subclass, so nothing touches an API that is missing before 1.13.
	it("exposes reference content as pages of searchable entries", () => {
		const pages = rows().filter((row) => "type" in row && row.type === "page");
		expect(pages).toHaveLength(2);

		for (const page of pages) {
			expect("page" in page).toBe(false);
			expect("items" in page && page.items?.length).toBeTruthy();
			for (const entry of ("items" in page ? (page.items ?? []) : [])) {
				expect("name" in entry && entry.name).toBeTruthy();
				expect("desc" in entry && entry.desc).toBeTruthy();
			}
		}
	});

	// Every template variable gets its own entry, so searching "isbn" in
	// Obsidian's settings search finds it.
	it("lists every template variable as its own page entry", () => {
		const variables = rows().find(
			(row) => "name" in row && row.name === "Available template variables",
		);
		const names =
			variables && "items" in variables
				? (variables.items ?? []).map((i) => ("name" in i ? i.name : ""))
				: [];

		expect(names).toContain("{{isbn}}");
		expect(names).toContain("{{descriptionCallout}}");
		expect(names).toHaveLength(VARIABLE_DOCS.length);
	});

	// The guard that matters: a typo'd or renamed key would silently bind a
	// control to a setting that doesn't exist.
	it("binds every control to a real setting key", () => {
		const bound = rows()
			.map((row) => ("control" in row ? row.control : undefined))
			.filter((c) => c !== undefined);

		expect(bound.length).toBeGreaterThan(0);
		for (const control of bound) {
			expect(Object.keys(DEFAULT_SETTINGS)).toContain(control.key);
		}
	});
});

describe("note template description", () => {
	/** The "Note template" row's description for a given template-file setting. */
	function descFor(templateFile: string): string {
		const definitions = tab({ templateFile }).tab.getSettingDefinitions();
		const row = definitions
			.flatMap((group) => ("items" in group ? (group.items ?? []) : []))
			.find((item) => "name" in item && item.name === "Note template");
		return row && "desc" in row && typeof row.desc === "string" ? row.desc : "";
	}

	it("describes what the template does when it is in use", () => {
		expect(descFor("")).toContain("every new book note");
		expect(descFor("")).not.toContain("Not in use");
	});

	// The inline editor greys out when a template file is set; the description
	// is what explains why, so it has to follow that state.
	it("explains the greyed-out editor when a template file is set", () => {
		const desc = descFor("Templates/Book template.md");
		expect(desc).toContain("Not in use");
		expect(desc).toContain("Clear that field");
	});
});

describe("control value round-trip", () => {
	it("reads the current setting", () => {
		const { tab: t } = tab({ coverProperty: "artwork" });
		expect(t.getControlValue("coverProperty")).toBe("artwork");
	});

	it("persists a plain value", async () => {
		const { tab: t, settings, saveCount } = tab();
		await t.setControlValue("coverMode", "download");
		expect(settings.coverMode).toBe("download");
		expect(saveCount()).toBe(1);
	});

	// Normalization has to match what the hand-written fields produced, so the
	// two rendering paths can't store different things.
	it("clamps the cover size", async () => {
		const { tab: t, settings } = tab();
		await t.setControlValue("coverSize", 99999);
		expect(settings.coverSize).toBe(2000);
	});

	it("restores defaults for blanked-out required paths", async () => {
		const { tab: t, settings } = tab();
		await t.setControlValue("coverFolder", "   ");
		await t.setControlValue("coverProperty", "");
		expect(settings.coverFolder).toBe(DEFAULT_SETTINGS.coverFolder);
		expect(settings.coverProperty).toBe(DEFAULT_SETTINGS.coverProperty);
	});

	it("trims the note folder but allows the vault root", async () => {
		const { tab: t, settings } = tab();
		await t.setControlValue("noteFolder", "  Library/Books  ");
		expect(settings.noteFolder).toBe("Library/Books");
		await t.setControlValue("noteFolder", "");
		expect(settings.noteFolder).toBe("");
	});
});
