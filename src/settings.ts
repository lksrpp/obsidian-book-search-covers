import { App, PluginSettingTab, Setting } from "obsidian";
import type BookSearchCoverPlugin from "./main";

export type CoverMode = "link" | "download";

export interface BookSearchCoverSettings {
	/** Google Books API key (free). Stored locally in data.json. */
	googleApiKey: string;
	/** Country code for Google `country` and the Apple store (e.g. "DE"). */
	preferredCountry: string;
	/** Square cover size requested from Apple (px). 800 is the sweet spot. */
	coverSize: number;
	/** Keep the remote URL, or download the image into the vault. */
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

export const DEFAULT_TEMPLATE = `---
title: "{{title}}"
author: "{{authors}}"
publisher: "{{publisher}}"
published: {{year}}
pages: {{pageCount}}
isbn: "{{isbn}}"
categories: "{{categories}}"
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
	fileNameTemplate: "{{title}}",
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

		new Setting(containerEl).setName("Sources").setHeading();

		new Setting(containerEl)
			.setName("Google Books API key")
			.setDesc("Required. Free key from the Google Cloud console (Books API).")
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
			.setName("Country code")
			.setDesc("Used for Google results and the Apple store (e.g. DE, US, GB).")
			.addText((t) =>
				t.setValue(s.preferredCountry).onChange(async (v) => {
					s.preferredCountry = v.trim().toUpperCase() || "DE";
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Covers").setHeading();

		new Setting(containerEl)
			.setName("Cover storage")
			.setDesc("Link the remote URL, or download the image into the vault.")
			.addDropdown((d) =>
				d
					.addOption("link", "Link URL")
					.addOption("download", "Download to folder")
					.setValue(s.coverMode)
					.onChange(async (v) => {
						s.coverMode = v as CoverMode;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Cover folder")
			.setDesc("Where downloaded covers are stored (download mode).")
			.addText((t) =>
				t.setValue(s.coverFolder).onChange(async (v) => {
					s.coverFolder = v.trim() || "covers";
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Cover size")
			.setDesc("Square px requested from Apple. 600, 800 or 1400 are common.")
			.addText((t) =>
				t.setValue(String(s.coverSize)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					s.coverSize = Number.isFinite(n) && n > 0 ? n : 800;
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
			.addText((t) =>
				t.setValue(s.noteFolder).onChange(async (v) => {
					s.noteFolder = v.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("File name template")
			.setDesc("Note basename. Supports {{title}}, {{author}}, {{year}}, etc.")
			.addText((t) =>
				t.setValue(s.fileNameTemplate).onChange(async (v) => {
					s.fileNameTemplate = v.trim() || "{{title}}";
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Note template")
			.setDesc("Whole note (frontmatter + body). Uses {{var}} placeholders.")
			.addTextArea((t) => {
				t.setValue(s.noteTemplate).onChange(async (v) => {
					s.noteTemplate = v;
					await this.plugin.saveSettings();
				});
				t.inputEl.rows = 14;
				t.inputEl.addClass("bsc-template-input");
			});
	}
}
