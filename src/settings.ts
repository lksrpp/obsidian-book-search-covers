import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type BookSearchCoverPlugin from "./main";
import { createTemplateFile } from "./note";
import { DEFAULT_TEMPLATE, VARIABLE_DOCS } from "./template";
import { FileSuggest } from "./ui/file-suggest";
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
	/**
	 * Inline `{{var}}` template for the whole note (frontmatter + body), edited
	 * right in the settings tab. Used whenever no template file is set.
	 */
	noteTemplate: string;
	/**
	 * Vault path of a note to use as the template instead (power users —
	 * editable like any note, Templater-style). Overrides `noteTemplate` when
	 * set; empty = use the inline template.
	 */
	templateFile: string;
}

export const DEFAULT_FILENAME_TEMPLATE = "{{title}}";

/** Suggested template file path for the "create template file" button. */
export const SUGGESTED_TEMPLATE_PATH = "Templates/Book template.md";

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
	templateFile: "",
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
						href: "https://github.com/lksrpp/obsidian-book-search-covers/blob/main/docs/google-books-api-key.md",
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
			.setName("Cover storage")
			.setDesc("Can be overridden per search in the modal.")
			.addDropdown((d) =>
				d
					.addOption("link", "Link the remote image URL")
					.addOption("download", "Download into the vault")
					.setValue(s.coverMode)
					.onChange(async (v) => {
						s.coverMode = v as CoverMode;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Cover folder")
			.setDesc(
				"Where downloaded covers are stored, also when downloading is only chosen per search.",
			)
			.addText((t) => {
				t.setValue(s.coverFolder).onChange(async (v) => {
					s.coverFolder = v.trim() || "covers";
					await this.plugin.saveSettings();
				});
				t.inputEl.addClass("bsc-path-input");
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
				t.inputEl.addClass("bsc-path-input");
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

		// The inline textarea is the simple path; a template file (below)
		// overrides it for power users. The textarea disables while a file is
		// set so the precedence is visible, not just documented.
		let templateInput: HTMLTextAreaElement | undefined;
		const syncTemplateEditor = () => {
			if (templateInput) templateInput.disabled = s.templateFile !== "";
		};
		new Setting(containerEl)
			.setName("Note template")
			.setDesc(
				"Whole note (frontmatter + body), {{var}} placeholders. Ignored while a template file is set below.",
			)
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip("Reset to the default template")
					.onClick(() => {
						if (!templateInput || templateInput.disabled) return;
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

		let templateFileInput: HTMLInputElement | undefined;
		new Setting(containerEl)
			.setName("Template file")
			.setDesc(
				"Power users: use a note in your vault as the template instead, editable like any note, with the same {{variables}}. Overrides the inline template above; leave empty to use it.",
			)
			.addText((t) => {
				templateFileInput = t.inputEl;
				t.setPlaceholder(SUGGESTED_TEMPLATE_PATH)
					.setValue(s.templateFile)
					.onChange(async (v) => {
						s.templateFile = v.trim();
						syncTemplateEditor();
						await this.plugin.saveSettings();
					});
				t.inputEl.addClass("bsc-path-input");
				new FileSuggest(this.app, t.inputEl);
			})
			.addExtraButton((b) =>
				b
					.setIcon("file-plus")
					.setTooltip(
						"Create a template file from the inline template above (at the entered path, or the suggested one) and use it",
					)
					.onClick(async () => {
						if (!templateFileInput) return;
						const target = templateFileInput.value.trim() || SUGGESTED_TEMPLATE_PATH;
						const content = s.noteTemplate.trim() === "" ? DEFAULT_TEMPLATE : s.noteTemplate;
						try {
							const path = await createTemplateFile(this.app, target, content);
							templateFileInput.value = path;
							templateFileInput.trigger("input");
							new Notice(`Using template file “${path}”.`);
						} catch (e) {
							new Notice(
								e instanceof Error ? e.message : "Could not create the template file.",
							);
						}
					}),
			);
		syncTemplateEditor();

		const varsDetails = containerEl.createEl("details", { cls: "bsc-variables" });
		varsDetails.createEl("summary", { text: "Available template variables" });
		const varsList = varsDetails.createDiv({ cls: "bsc-variables-grid" });
		for (const v of VARIABLE_DOCS) {
			varsList.createEl("code", { text: `{{${v.name}}}` });
			varsList.createDiv({ cls: "bsc-variables-desc", text: v.desc });
		}

		// Orientation for the commands, parked at the very bottom so the tab
		// opens straight on the actual settings. Collapsed by default.
		const intro = containerEl.createEl("details", { cls: "bsc-settings-intro" });
		intro.createEl("summary", { text: "How to use this plugin" });
		intro.createEl("p", {
			text: "This plugin searches Google Books (or Open Library, when no API key is set) and creates a book note from your template, including a high-resolution cover. Two commands:",
		});
		const list = intro.createEl("ul");
		const newNote = list.createEl("li");
		newNote.createEl("strong", { text: "New book note" });
		newNote.appendText(
			" (also on the ribbon): type to search, pick an edition, and the note is created from your template in the note folder. The store and cover storage above are only defaults; both can be changed in the modal per search.",
		);
		const fetchCover = list.createEl("li");
		fetchCover.createEl("strong", { text: "Fetch or replace cover for current note" });
		fetchCover.appendText(
			": pick a cover for the open note from Google and Apple candidates, compared side by side. It finds candidates via the note's frontmatter: title (file name if missing) and author/authors (plain text or [[wikilinks]], string or list). Good author info gives better candidates. The chosen cover is written into the cover property configured above.",
		);
	}
}
