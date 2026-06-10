import { App, PluginSettingTab, Setting } from "obsidian";
import type BookSearchCoverPlugin from "./main";
import { VARIABLE_DOCS } from "./template";
import { FolderSuggest } from "./ui/folder-suggest";

export type CoverMode = "link" | "download";

// Keep the Apple/Google size request sane: below ~100px is useless, above
// ~2000px Apple may serve nothing and Google caps out anyway.
export function clampCoverSize(n: number): number {
	if (!Number.isFinite(n) || n <= 0) return 800;
	return Math.min(Math.max(Math.round(n), 100), 2000);
}

/**
 * Common store regions offered in the settings dropdown and the in-modal store
 * override. ISO 3166-1 alpha-2, valid for both the Apple `country` parameter
 * and Google Books' `country`.
 */
export const STORES: ReadonlyArray<{ code: string; label: string }> = [
	{ code: "DE", label: "Germany" },
	{ code: "AT", label: "Austria" },
	{ code: "CH", label: "Switzerland" },
	{ code: "US", label: "United States" },
	{ code: "GB", label: "United Kingdom" },
	{ code: "IE", label: "Ireland" },
	{ code: "FR", label: "France" },
	{ code: "IT", label: "Italy" },
	{ code: "ES", label: "Spain" },
	{ code: "NL", label: "Netherlands" },
	{ code: "BE", label: "Belgium" },
	{ code: "LU", label: "Luxembourg" },
	{ code: "SE", label: "Sweden" },
	{ code: "DK", label: "Denmark" },
	{ code: "NO", label: "Norway" },
	{ code: "FI", label: "Finland" },
	{ code: "PT", label: "Portugal" },
	{ code: "CA", label: "Canada" },
	{ code: "AU", label: "Australia" },
	{ code: "NZ", label: "New Zealand" },
	{ code: "JP", label: "Japan" },
];

export interface BookSearchCoverSettings {
	/** Google Books API key (free). Stored locally in data.json. */
	googleApiKey: string;
	/** Default store/country code for Google and Apple (e.g. "DE"). Overridable per search. */
	preferredCountry: string;
	/** Square cover size requested from Apple (px). 800 is the sweet spot. */
	coverSize: number;
	/** Keep the remote URL, or download the image into the vault. Overridable per search. */
	coverMode: CoverMode;
	/** Vault folder for downloaded covers (used when coverMode = "download"). */
	coverFolder: string;
	/** Vault folder new book notes are created in. */
	noteFolder: string;
	/** Frontmatter property the "fetch cover" command writes into. */
	coverProperty: string;
	/** `{{var}}` template for the note basename. */
	fileNameTemplate: string;
	/** `{{var}}` template for the whole note (frontmatter + body). */
	noteTemplate: string;
}

export const DEFAULT_FILENAME_TEMPLATE = "{{title}}";

export const DEFAULT_TEMPLATE = `---
title: "{{title}}"
author:
{{authorsYamlLinks}}
publisher: "{{publisher}}"
published: {{year}}
pages: {{pageCount}}
isbn: "{{isbn}}"
categories:
{{categoriesYamlList}}
cover: "{{cover}}"
tags: [book]
---

![cover]({{cover}})

# {{title}}

{{description}}
`;

export const DEFAULT_SETTINGS: BookSearchCoverSettings = {
	googleApiKey: "",
	preferredCountry: "DE",
	coverSize: 800,
	coverMode: "link",
	coverFolder: "covers",
	noteFolder: "Books",
	coverProperty: "cover",
	fileNameTemplate: DEFAULT_FILENAME_TEMPLATE,
	noteTemplate: DEFAULT_TEMPLATE,
};

export class BookSearchCoverSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: BookSearchCoverPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		// Brief orientation so commands don't have to be self-discovered.
		new Setting(containerEl).setName("How to use this plugin").setHeading();
		// An info-only Setting row, so the text gets the exact same spacing as
		// every other settings row instead of a hand-styled div.
		const intro = new Setting(containerEl).setClass("bsc-settings-intro").infoEl;
		intro.createEl("p", {
			text: "This plugin searches Google Books (or Open Library, when no API key is set) and creates a book note from your template, including a high-resolution cover. Two commands:",
		});
		const list = intro.createEl("ul");
		const newNote = list.createEl("li");
		newNote.createEl("strong", { text: "New book note" });
		newNote.appendText(
			" (also on the ribbon) — type to search, pick an edition, and the note is created from your template in the note folder. The store and cover storage below are only defaults — both can be changed in the modal per search.",
		);
		const fetchCover = list.createEl("li");
		fetchCover.createEl("strong", { text: "Fetch or replace cover for current note" });
		fetchCover.appendText(
			" — pick a cover for the open note from Google and Apple candidates, compared side by side. It finds candidates via the note's frontmatter: title (file name if missing) and author/authors (plain text or [[wikilinks]], string or list). Good author info gives better candidates. The chosen cover is written into the cover property configured below.",
		);

		new Setting(containerEl).setName("Search").setHeading();

		new Setting(containerEl)
			.setName("Google Books API key")
			.setDesc(
				createFragment((frag) => {
					frag.appendText(
						"Free key from the Google Cloud console (Books API). Without a key, Open Library is used instead. ",
					);
					frag.createEl("a", {
						text: "Step-by-step guide",
						href: "https://github.com/lksrpp/obsidian-book-search-cover/blob/main/docs/google-books-api-key.md",
					});
				}),
			)
			.addText((t) =>
				t
					.setPlaceholder("AIza…")
					.setValue(s.googleApiKey)
					.onChange(async (v) => {
						s.googleApiKey = v.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default store")
			.setDesc(
				"Store region for search results and covers. Can be changed per search in the modal.",
			)
			.addDropdown((d) => {
				for (const store of STORES) d.addOption(store.code, `${store.label} (${store.code})`);
				// Keep an unknown stored value selectable instead of silently jumping to DE.
				if (!STORES.some((store) => store.code === s.preferredCountry)) {
					d.addOption(s.preferredCountry, s.preferredCountry);
				}
				d.setValue(s.preferredCountry).onChange(async (v) => {
					s.preferredCountry = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName("Covers").setHeading();

		new Setting(containerEl)
			.setName("Download covers into the vault")
			.setDesc(
				"On: the cover image is saved to the cover folder and embedded locally. Off: notes link the remote image URL. Can be overridden per search.",
			)
			.addToggle((t) =>
				t.setValue(s.coverMode === "download").onChange(async (v) => {
					s.coverMode = v ? "download" : "link";
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Cover folder")
			.setDesc("Where downloaded covers are stored.")
			.addText((t) => {
				t.setValue(s.coverFolder).onChange(async (v) => {
					s.coverFolder = v.trim() || "covers";
					await this.plugin.saveSettings();
				});
				new FolderSuggest(this.app, t.inputEl);
			});

		new Setting(containerEl)
			.setName("Cover size")
			.setDesc(
				"Cover px requested from Apple/Google (clamped to 100–2000). 600, 800 or 1400 are common.",
			)
			.addText((t) =>
				t.setValue(String(s.coverSize)).onChange(async (v) => {
					s.coverSize = clampCoverSize(Number.parseInt(v, 10));
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Cover frontmatter property")
			.setDesc('Property the "fetch cover" command writes into.')
			.addText((t) =>
				t.setValue(s.coverProperty).onChange(async (v) => {
					s.coverProperty = v.trim() || "cover";
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Notes").setHeading();

		new Setting(containerEl)
			.setName("Note folder")
			.setDesc("Where new book notes are created.")
			.addText((t) => {
				t.setValue(s.noteFolder).onChange(async (v) => {
					s.noteFolder = v.trim();
					await this.plugin.saveSettings();
				});
				new FolderSuggest(this.app, t.inputEl);
			});

		// Reset buttons write the default back through the component so the
		// field's own onChange persists it — no tab re-render needed.
		let fileNameInput: HTMLInputElement | undefined;
		new Setting(containerEl)
			.setName("File name template")
			.setDesc("Note basename. Supports the same {{variables}} as the note template.")
			.addText((t) => {
				fileNameInput = t.inputEl;
				t.setValue(s.fileNameTemplate).onChange(async (v) => {
					s.fileNameTemplate = v.trim() || DEFAULT_FILENAME_TEMPLATE;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip("Reset to default")
					.onClick(() => {
						if (!fileNameInput) return;
						fileNameInput.value = DEFAULT_FILENAME_TEMPLATE;
						fileNameInput.trigger("input");
					}),
			);

		let templateInput: HTMLTextAreaElement | undefined;
		new Setting(containerEl)
			.setName("Note template")
			.setDesc("Whole note (frontmatter + body). Uses {{var}} placeholders.")
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip("Reset to the current default template")
					.onClick(() => {
						if (!templateInput) return;
						templateInput.value = DEFAULT_TEMPLATE;
						templateInput.trigger("input");
					}),
			)
			.addTextArea((t) => {
				templateInput = t.inputEl;
				t.setValue(s.noteTemplate).onChange(async (v) => {
					s.noteTemplate = v;
					await this.plugin.saveSettings();
				});
				t.inputEl.rows = 14;
				t.inputEl.addClass("bsc-template-input");
			});

		const varsDetails = containerEl.createEl("details", { cls: "bsc-variables" });
		varsDetails.createEl("summary", { text: "Available template variables" });
		const varsList = varsDetails.createDiv({ cls: "bsc-variables-grid" });
		for (const v of VARIABLE_DOCS) {
			varsList.createEl("code", { text: `{{${v.name}}}` });
			varsList.createDiv({ cls: "bsc-variables-desc", text: v.desc });
		}
	}
}
