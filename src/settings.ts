import {
	App,
	ButtonComponent,
	DropdownComponent,
	Notice,
	PluginSettingTab,
	Setting,
	setIcon,
	type SettingControl,
	type SettingDefinitionItem,
	type SettingGroupItem,
} from "obsidian";
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
	{ code: "AT", label: "Austria" },
	{ code: "AU", label: "Australia" },
	{ code: "BE", label: "Belgium" },
	{ code: "CA", label: "Canada" },
	{ code: "CH", label: "Switzerland" },
	{ code: "DE", label: "Germany" },
	{ code: "DK", label: "Denmark" },
	{ code: "ES", label: "Spain" },
	{ code: "FI", label: "Finland" },
	{ code: "FR", label: "France" },
	{ code: "GB", label: "United Kingdom" },
	{ code: "IE", label: "Ireland" },
	{ code: "IT", label: "Italy" },
	{ code: "JP", label: "Japan" },
	{ code: "LU", label: "Luxembourg" },
	{ code: "NL", label: "Netherlands" },
	{ code: "NO", label: "Norway" },
	{ code: "NZ", label: "New Zealand" },
	{ code: "PT", label: "Portugal" },
	{ code: "SE", label: "Sweden" },
	{ code: "US", label: "United States" },
];

/**
 * A store is an explicit provider + region choice — the thing the user
 * actually picks, not a hidden fallback chain. Open Library carries no
 * region; each Google entry is one `STORES` country.
 */
export type StoreId = "openlibrary" | `google:${string}`;

/**
 * A resolved store. Discriminated on `provider` so a Google store always
 * carries a `country` (ISO 3166-1 alpha-2) while Open Library never does —
 * callers in the Google branch get `country` typed as a plain string.
 */
export type Store =
	| { id: "openlibrary"; provider: "openlibrary"; country?: undefined; label: string }
	| { id: `google:${string}`; provider: "google"; country: string; label: string };

/** Every selectable store: Open Library, plus one Google entry per `STORES` country. */
export function allStores(): Store[] {
	return [
		{ id: "openlibrary", provider: "openlibrary", label: "Open Library" },
		...STORES.map(
			(s): Store => ({
				id: `google:${s.code}`,
				provider: "google",
				country: s.code,
				label: `Google ${s.code} (${s.label})`,
			}),
		),
	];
}

/** Parse a `StoreId` into its provider + region. Unknown Google country codes still resolve. */
export function resolveStore(id: StoreId): Store {
	if (id === "openlibrary") return { id, provider: "openlibrary", label: "Open Library" };
	const code = id.slice("google:".length);
	const known = STORES.find((s) => s.code === code);
	return {
		id,
		provider: "google",
		country: code,
		label: known ? `Google ${code} (${known.label})` : `Google — ${code}`,
	};
}

/** Cover-search region for Apple/Google: the store's own country, or US when it has none (Open Library). */
export function coverCountryFor(id: StoreId): string {
	return resolveStore(id).country ?? "US";
}

/**
 * The store actually usable right now: falls back to Open Library when the
 * configured store is Google but no API key is set (Google stores are
 * unusable without one — see the "Default store" dropdown below).
 */
export function effectiveStore(settings: BookSearchCoverSettings): StoreId {
	const store = resolveStore(settings.store);
	return store.provider === "google" && !settings.googleApiKey ? "openlibrary" : settings.store;
}

/**
 * Stores offered in the modal's quick switcher: the curated `switcherStores`
 * list, or every store when that list is empty (the default — good-enough
 * transparency until the user curates it down).
 */
export function switcherStoreList(settings: BookSearchCoverSettings): Store[] {
	if (settings.switcherStores.length === 0) return allStores();
	const chosen = new Set(settings.switcherStores);
	return allStores().filter((s) => chosen.has(s.id));
}

/**
 * Fill a store dropdown, greying out Google entries when no API key is set
 * (they are unusable without one).
 */
export function populateStoreDropdown(
	dropdown: DropdownComponent,
	stores: readonly Store[],
	hasApiKey: boolean,
): void {
	for (const store of stores) {
		dropdown.addOption(store.id, store.label);
		if (store.provider === "google" && !hasApiKey) {
			const opt = Array.from(dropdown.selectEl.options).find((o) => o.value === store.id);
			if (opt) opt.disabled = true;
		}
	}
}

export interface BookSearchCoverSettings {
	/** Google Books API key (free). Stored locally in data.json. */
	googleApiKey: string;
	/** Default store (provider + region) for search results and covers. Overridable per search. */
	store: StoreId;
	/**
	 * Stores offered as chips/options in the modal's quick switcher. Empty
	 * (the default) means "show all" — curate this down once the long list
	 * gets in the way.
	 */
	switcherStores: StoreId[];
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

export const DEFAULT_FILENAME_TEMPLATE = "{{title}} - {{authors}}";

/** Suggested template file path for the "create template file" button. */
export const SUGGESTED_TEMPLATE_PATH = "Templates/Book template.md";

export const DEFAULT_SETTINGS: BookSearchCoverSettings = {
	googleApiKey: "",
	store: "google:DE",
	switcherStores: [],
	coverSize: 800,
	coverMode: "link",
	coverFolder: "covers",
	noteFolder: "Books",
	coverProperty: "cover",
	fileNameTemplate: DEFAULT_FILENAME_TEMPLATE,
	noteTemplate: DEFAULT_TEMPLATE,
	templateFile: "",
};

/** Shape data.json could still be in from before the store rework (1.0.3 and earlier). */
interface PreStoreSettings {
	preferredCountry?: string;
}

/**
 * Migrate a pre-store settings object in place: derive `store` from the old
 * `googleApiKey` + `preferredCountry` pair. A no-op once `store` is present.
 */
export function migrateStoreSetting(
	stored: (Partial<BookSearchCoverSettings> & PreStoreSettings) | null,
): void {
	if (!stored || stored.store) return;
	stored.store = stored.googleApiKey
		? `google:${stored.preferredCountry ?? "DE"}`
		: "openlibrary";
	// Drop the legacy key so it doesn't linger in the merged settings / data.json.
	delete stored.preferredCountry;
}

/**
 * One settings row, in the form both rendering paths can consume: a
 * declarative `control` binding where the stock controls suffice, or an
 * imperative `render` callback where they don't.
 */
interface SettingRow {
	name: string;
	desc?: string | DocumentFragment;
	/** Extra search terms for the 1.13+ settings search. */
	aliases?: string[];
	/** Imperative renderer, for rows no stock control can express. */
	render?: (setting: Setting) => void;
	/** Declarative binding; read/written through get/setControlValue below. */
	control?: SettingControl;
	/**
	 * Reference content rather than a setting: a navigable sub-page on 1.13+,
	 * an inline disclosure block on older versions. Entries stay plain data so
	 * both paths render them and each one is indexed for settings search —
	 * and so no `SettingPage` subclass is needed, which matters: `SettingPage`
	 * doesn't exist before 1.13, and extending it at module load would break
	 * the plugin for exactly the users `display()` is kept for.
	 */
	page?: {
		/** Class on the legacy disclosure block. */
		cls: string;
		/** Monospace the entry names (template variables). */
		code?: boolean;
		entries: ReadonlyArray<{ name: string; desc: string }>;
	};
}

interface SettingSection {
	/** Omitted for trailing rows that carry their own headings. */
	heading?: string;
	rows: SettingRow[];
}

export class BookSearchCoverSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: BookSearchCoverPlugin,
	) {
		super(app, plugin);
	}

	// Handles parked by the row renderers below. Rows are drawn independently
	// of each other (the 1.13 renderer hands out one Setting at a time), but a
	// few stay coupled: the API key decides which Google stores are usable, and
	// a template file disables the inline template editor. Each renderer parks
	// its handle here so the coupled rows can refresh in place, without a full
	// re-render that would steal focus from the field being typed into.
	private storeDropdown?: DropdownComponent;
	private switcherToggle?: ButtonComponent;
	private switcherLabel?: HTMLElement;
	private switcherPanelEl?: HTMLElement;
	private switcherOpen = false;
	private templateInput?: HTMLTextAreaElement;
	private fileNameInput?: HTMLInputElement;
	private templateFileInput?: HTMLInputElement;

	/**
	 * The single source of truth for this tab. Both `getSettingDefinitions()`
	 * (Obsidian 1.13+) and `display()` (older versions) render from this, so the
	 * two paths cannot drift apart as settings are added or changed.
	 *
	 * Kept cheap — no vault reads or network calls — because 1.13 calls it on
	 * every update and once more at registration to index settings for search.
	 */
	private sections(): SettingSection[] {
		return [
			{
				heading: "Search",
				rows: [
					{
						name: "Google Books API key",
						desc: createFragment((frag) => {
							frag.appendText("Free key from the Google Cloud console (Books API). ");
							frag.createEl("a", {
								text: "Step-by-step guide",
								href: "https://github.com/lksrpp/obsidian-book-search-covers/blob/main/docs/google-books-api-key.md",
							});
							frag.appendText(
								". Without a key, searches use the free Open Library instead, with sparser metadata and covers.",
							);
						}),
						aliases: ["google books", "api key", "token", "credentials"],
						render: (setting) => this.renderApiKey(setting),
					},
					{
						name: "Default store",
						desc: "The provider and region used for searches and covers by default. Always available in the modal, and changeable per search. Google stores need the API key above.",
						aliases: ["provider", "region", "country", "open library", "google"],
						render: (setting) => this.renderStoreDropdown(setting),
					},
					{
						name: "Stores in quick switcher",
						desc: "Extra stores to offer in the modal's picker for quick switching during specific book searches. The default store above is always available; these are added to it.",
						aliases: ["provider", "region", "country", "picker", "open library", "google"],
						render: (setting) => this.renderSwitcher(setting),
					},
				],
			},
			{
				heading: "Covers",
				rows: [
					{
						name: "Cover storage",
						desc: "Whether covers are linked by remote URL or downloaded into your vault. Can be overridden per search.",
						aliases: ["download", "link", "remote", "image"],
						control: {
							type: "dropdown",
							key: "coverMode",
							defaultValue: DEFAULT_SETTINGS.coverMode,
							options: {
								link: "Link the remote image URL",
								download: "Download into the vault",
							},
						},
					},
					{
						name: "Cover folder",
						desc: "Where downloaded covers are saved, including when download is chosen for just a single search.",
						aliases: ["download", "attachment", "path"],
						control: {
							type: "folder",
							key: "coverFolder",
							placeholder: DEFAULT_SETTINGS.coverFolder,
							defaultValue: DEFAULT_SETTINGS.coverFolder,
						},
					},
					{
						name: "Cover size",
						desc: "Cover width in pixels requested from Apple/Google (clamped to 100–2000). 600, 800, or 1400 are common.",
						aliases: ["resolution", "pixels", "width", "quality"],
						control: {
							type: "number",
							key: "coverSize",
							min: 100,
							max: 2000,
							defaultValue: DEFAULT_SETTINGS.coverSize,
						},
					},
					{
						name: "Cover frontmatter property",
						desc: 'Frontmatter property the "Fetch cover" command writes the cover into.',
						aliases: ["frontmatter", "property", "metadata", "yaml"],
						control: {
							type: "text",
							key: "coverProperty",
							placeholder: DEFAULT_SETTINGS.coverProperty,
							defaultValue: DEFAULT_SETTINGS.coverProperty,
						},
					},
				],
			},
			{
				heading: "Notes",
				rows: [
					{
						name: "Note folder",
						desc: "Where new book notes are created.",
						aliases: ["path", "location", "directory"],
						control: {
							type: "folder",
							key: "noteFolder",
							placeholder: DEFAULT_SETTINGS.noteFolder,
							defaultValue: DEFAULT_SETTINGS.noteFolder,
						},
					},
					{
						name: "File name template",
						desc: "The new note's file name, without extension. Supports the same {{variables}} as the note template.",
						aliases: ["filename", "title", "naming", "variables"],
						render: (setting) => this.renderFileNameTemplate(setting),
					},
					{
						name: "Note template",
						desc: "The whole note, frontmatter and body, with {{variable}} placeholders. Ignored if a template file is set below.",
						aliases: ["frontmatter", "body", "variables", "placeholder"],
						render: (setting) => this.renderNoteTemplate(setting),
					},
					{
						name: "Template file",
						desc: "Power users: use a note in your vault as the template instead, editable like any note, with the same {{variables}}. Overrides the inline template above; leave empty to use it.",
						aliases: ["templater", "file", "variables"],
						render: (setting) => this.renderTemplateFile(setting),
					},
					{
						name: "Available template variables",
						desc: "Placeholders you can use in the file name and note templates.",
						page: {
							cls: "bsc-variables",
							code: true,
							entries: VARIABLE_DOCS.map((v) => ({ name: `{{${v.name}}}`, desc: v.desc })),
						},
					},
				],
			},
			{
				// Orientation for the commands, parked at the very bottom so the
				// tab opens straight on the actual settings.
				rows: [
					{
						name: "How to use this plugin",
						desc: "This plugin searches Google Books (or Open Library, when no API key is set) and creates a book note from your template, including a high-resolution cover. Two commands:",
						page: {
							cls: "bsc-settings-intro",
							entries: [
								{
									name: "New book note",
									desc: "Also on the ribbon: type to search, pick an edition, and the note is created from your template in the note folder. The store and cover storage settings are only defaults; both can be changed in the modal per search.",
								},
								{
									name: "Fetch or replace cover for current note",
									desc: "Pick a cover for the open note from Google and Apple candidates, compared side by side. It finds candidates via the note's frontmatter: title (file name if missing) and author/authors (plain text or [[wikilinks]], string or list). Good author info gives better candidates. The chosen cover is written into the cover property configured above.",
								},
							],
						},
					},
				],
			},
		];
	}

	/**
	 * Declarative definitions for Obsidian 1.13+. Rendering and settings-search
	 * indexing both come from here; `display()` is skipped entirely.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.sections().map(
			(section): SettingDefinitionItem => ({
				type: "group",
				heading: section.heading,
				items: section.rows.map((row): SettingGroupItem => {
					// Reference content becomes a navigable sub-page whose entries
					// are plain rows, so each one is searchable on its own.
					if (row.page) {
						return {
							type: "page",
							name: row.name,
							desc: row.desc,
							items: row.page.entries.map((entry) => ({ name: entry.name, desc: entry.desc })),
						};
					}
					const base = { name: row.name, desc: row.desc, aliases: row.aliases };
					return row.control
						? { ...base, control: row.control }
						: { ...base, render: (setting) => row.render?.(setting) };
				}),
			}),
		);
	}

	/** Reads the value behind a declarative `control` binding. */
	getControlValue(key: string): unknown {
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	/**
	 * Persists a declarative `control` binding, normalizing first so stored
	 * values match what the hand-written fields have always produced: paths
	 * trimmed, blanked-out required fields back to their default, size clamped.
	 * Overriding this replaces Obsidian's automatic save, so we save ourselves.
	 */
	setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.plugin.settings;
		switch (key) {
			case "coverSize":
				s.coverSize = clampCoverSize(Number(value));
				break;
			case "coverFolder":
				s.coverFolder = String(value).trim() || DEFAULT_SETTINGS.coverFolder;
				break;
			case "coverProperty":
				s.coverProperty = String(value).trim() || DEFAULT_SETTINGS.coverProperty;
				break;
			case "noteFolder":
				s.noteFolder = String(value).trim();
				break;
			default:
				(s as unknown as Record<string, unknown>)[key] = value;
		}
		return this.plugin.saveSettings();
	}

	/**
	 * Imperative fallback for Obsidian below 1.13, which has no declarative
	 * renderer. Walks the same `sections()` the definitions are built from, so
	 * the two paths render the same tab. Bypassed on 1.13+.
	 *
	 * @deprecated Remove once minAppVersion reaches 1.13.0.
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const section of this.sections()) {
			if (section.heading) {
				new Setting(containerEl).setName(section.heading).setHeading();
			}
			for (const row of section.rows) {
				const setting = new Setting(containerEl);
				// Pre-1.13 has no sub-pages; reference content collapses inline.
				if (row.page) {
					this.renderDisclosure(setting, row);
					continue;
				}
				setting.setName(row.name);
				if (row.desc) setting.setDesc(row.desc);
				if (row.render) row.render(setting);
				else if (row.control) this.renderControl(setting, row.control);
			}
		}
	}

	/**
	 * Stand-in for Obsidian 1.13's control renderer, covering just the control
	 * types `sections()` uses. Legacy `display()` path only.
	 */
	private renderControl(setting: Setting, control: SettingControl): void {
		// Every control below is backed by a string or number setting; anything
		// else would be a binding bug, so it renders empty rather than as
		// "[object Object]".
		const read = (): string => {
			const value = this.getControlValue(control.key);
			return typeof value === "string" || typeof value === "number" ? String(value) : "";
		};
		const write = (value: unknown): void => void this.setControlValue(control.key, value);

		switch (control.type) {
			case "dropdown":
				setting.addDropdown((d) => {
					for (const [value, label] of Object.entries(control.options)) {
						d.addOption(value, label);
					}
					d.setValue(read()).onChange(write);
				});
				break;
			case "number":
				setting.addText((t) => {
					t.setValue(read()).onChange((v) => write(Number.parseInt(v, 10)));
				});
				break;
			case "text":
				setting.addText((t) => {
					if (control.placeholder) t.setPlaceholder(control.placeholder);
					t.setValue(read()).onChange(write);
				});
				break;
			case "folder":
				setting.addText((t) => {
					if (control.placeholder) t.setPlaceholder(control.placeholder);
					t.setValue(read()).onChange(write);
					t.inputEl.addClass("bsc-path-input");
					new FolderSuggest(this.app, t.inputEl);
				});
				break;
		}
	}

	private renderApiKey(setting: Setting): void {
		const s = this.plugin.settings;
		setting.addText((t) =>
			t
				.setPlaceholder("AIza…")
				.setValue(s.googleApiKey)
				.onChange(async (v) => {
					s.googleApiKey = v.trim();
					await this.plugin.saveSettings();
					// Google stores are unusable without a key; keep the store
					// dropdown and the switcher checkboxes' greyed-out state in
					// sync as the key is typed or cleared, without a full
					// re-render (which would lose focus on this field).
					this.refreshStoreDropdownDisabled();
					this.refreshSwitcher();
				}),
		);
	}

	private renderStoreDropdown(setting: Setting): void {
		const s = this.plugin.settings;
		setting.addDropdown((d) => {
			this.storeDropdown = d;
			const stores = allStores();
			populateStoreDropdown(d, stores, s.googleApiKey !== "");
			// Keep an unknown stored value selectable instead of silently jumping to the default.
			if (!stores.some((store) => store.id === s.store)) {
				d.addOption(s.store, s.store);
			}
			d.setValue(s.store).onChange(async (v) => {
				s.store = v as StoreId;
				await this.plugin.saveSettings();
			});
		});
	}

	/**
	 * Re-grey the Google store options to match the current API key. Called from
	 * the key field's onChange so the two settings stay consistent without a
	 * full re-render.
	 */
	private refreshStoreDropdownDisabled(): void {
		if (!this.storeDropdown) return;
		const hasKey = this.plugin.settings.googleApiKey !== "";
		for (const opt of Array.from(this.storeDropdown.selectEl.options)) {
			if (opt.value.startsWith("google:")) opt.disabled = !hasKey;
		}
	}

	/**
	 * Multi-select "filter dropdown" for the modal's store picker. An empty
	 * switcherStores means "all" (the canonical default); the panel below the
	 * row expands to a checkbox list plus quick shortcuts.
	 */
	private renderSwitcher(setting: Setting): void {
		setting.addButton((btn) => {
			this.switcherToggle = btn;
			btn.buttonEl.addClass("bsc-store-select-toggle");
			// Build the label ourselves so a Lucide chevron can sit beside it
			// (setButtonText would wipe the icon).
			this.switcherLabel = btn.buttonEl.createSpan();
			setIcon(btn.buttonEl.createSpan({ cls: "bsc-store-select-chevron" }), "chevron-down");
			btn.onClick(() => {
				this.switcherOpen = !this.switcherOpen;
				this.refreshSwitcher();
			});
		});
		// The panel hangs off the row itself, not the tab container: the
		// declarative renderer hands out a Setting, never the container.
		setting.settingEl.addClass("bsc-store-select-row");
		this.switcherPanelEl = setting.settingEl.createDiv({ cls: "bsc-store-select" });
		this.refreshSwitcher();
	}

	/** The current selection, expanding the empty = "all" sentinel. */
	private selectedStoreIds(): StoreId[] {
		const { switcherStores } = this.plugin.settings;
		return switcherStores.length === 0 ? allStores().map((st) => st.id) : switcherStores;
	}

	/**
	 * Persist a selection in canonical order, collapsing "everything" back to
	 * the empty sentinel. Callers guarantee at least one id — an empty switcher
	 * would be indistinguishable from "all".
	 */
	private setStoreSelection(ids: Iterable<StoreId>): void {
		const wanted = new Set(ids);
		const canonical = allStores()
			.map((st) => st.id)
			.filter((id) => wanted.has(id));
		this.plugin.settings.switcherStores =
			canonical.length === allStores().length ? [] : canonical;
		void this.plugin.saveSettings();
		this.refreshSwitcher();
	}

	private refreshSwitcher(): void {
		const panelEl = this.switcherPanelEl;
		if (!panelEl || !this.switcherLabel || !this.switcherToggle) return;

		const s = this.plugin.settings;
		const all = allStores();
		const selected = new Set(this.selectedStoreIds());
		this.switcherLabel.setText(
			selected.size === all.length ? "All stores" : `${selected.size} of ${all.length} stores`,
		);
		this.switcherToggle.buttonEl.toggleClass("is-open", this.switcherOpen);

		panelEl.empty();
		panelEl.toggleClass("is-open", this.switcherOpen);
		if (!this.switcherOpen) return;

		// Shortcuts: reset to all, or narrow to Open Library only.
		const shortcuts = panelEl.createDiv({ cls: "bsc-store-select-shortcuts" });
		const addShortcut = (label: string, ids: StoreId[]): void => {
			const b = shortcuts.createEl("button", { text: label, cls: "bsc-store-shortcut" });
			b.addEventListener("click", () => this.setStoreSelection(ids));
		};
		addShortcut(
			"All",
			all.map((st) => st.id),
		);
		addShortcut("Only Open Library", ["openlibrary"]);

		// One checkbox per store, in canonical order. Google stores are
		// unusable without an API key, so they show disabled and unchecked.
		const hasKey = s.googleApiKey !== "";
		const list = panelEl.createDiv({ cls: "bsc-store-select-list" });
		for (const store of all) {
			const disabled = store.provider === "google" && !hasKey;
			const item = list.createEl("label", { cls: "bsc-store-select-item" });
			item.toggleClass("is-disabled", disabled);
			const cb = item.createEl("input", { type: "checkbox" });
			cb.checked = !disabled && selected.has(store.id);
			cb.disabled = disabled;
			item.appendText(store.label);
			cb.addEventListener("change", () => {
				const next = new Set(this.selectedStoreIds());
				if (cb.checked) next.add(store.id);
				else next.delete(store.id);
				// Never allow an empty switcher; keep the last store on.
				if (next.size === 0) {
					cb.checked = true;
					return;
				}
				this.setStoreSelection(next);
			});
		}
	}

	// Reset buttons write the default back through the component so the field's
	// own onChange persists it — no tab re-render needed.
	private renderFileNameTemplate(setting: Setting): void {
		const s = this.plugin.settings;
		setting
			.addText((t) => {
				this.fileNameInput = t.inputEl;
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
						if (!this.fileNameInput) return;
						this.fileNameInput.value = DEFAULT_FILENAME_TEMPLATE;
						this.fileNameInput.trigger("input");
					}),
			);
	}

	/**
	 * The inline textarea is the simple path; a template file (below) overrides
	 * it for power users. The textarea disables while a file is set so the
	 * precedence is visible, not just documented.
	 */
	private renderNoteTemplate(setting: Setting): void {
		const s = this.plugin.settings;
		setting
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip("Reset to the default template")
					.onClick(() => {
						if (!this.templateInput || this.templateInput.disabled) return;
						this.templateInput.value = DEFAULT_TEMPLATE;
						this.templateInput.trigger("input");
					}),
			)
			.addTextArea((t) => {
				this.templateInput = t.inputEl;
				t.setValue(s.noteTemplate).onChange(async (v) => {
					s.noteTemplate = v;
					await this.plugin.saveSettings();
				});
				t.inputEl.rows = 14;
				t.inputEl.addClass("bsc-template-input");
			});
		this.syncTemplateEditor();
	}

	private syncTemplateEditor(): void {
		if (this.templateInput) {
			this.templateInput.disabled = this.plugin.settings.templateFile !== "";
		}
	}

	private renderTemplateFile(setting: Setting): void {
		const s = this.plugin.settings;
		setting
			.addText((t) => {
				this.templateFileInput = t.inputEl;
				t.setPlaceholder(SUGGESTED_TEMPLATE_PATH)
					.setValue(s.templateFile)
					.onChange(async (v) => {
						s.templateFile = v.trim();
						this.syncTemplateEditor();
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
						if (!this.templateFileInput) return;
						const target = this.templateFileInput.value.trim() || SUGGESTED_TEMPLATE_PATH;
						const content = s.noteTemplate.trim() === "" ? DEFAULT_TEMPLATE : s.noteTemplate;
						try {
							const path = await createTemplateFile(this.app, target, content);
							this.templateFileInput.value = path;
							this.templateFileInput.trigger("input");
							new Notice(`Using template file “${path}”.`);
						} catch (e) {
							new Notice(e instanceof Error ? e.message : "Could not create the template file.");
						}
					}),
			);
		this.syncTemplateEditor();
	}

	/**
	 * The pre-1.13 stand-in for a sub-page: the same entries, collapsed inline.
	 * The row's own name/control columns are hidden by CSS — the disclosure's
	 * summary is the visible label.
	 */
	private renderDisclosure(setting: Setting, row: SettingRow): void {
		const page = row.page;
		if (!page) return;

		setting.settingEl.addClass("bsc-disclosure-row");
		const details = setting.settingEl.createEl("details", { cls: page.cls });
		details.createEl("summary", { text: row.name });
		if (typeof row.desc === "string") details.createEl("p", { text: row.desc });

		const grid = details.createDiv({ cls: "bsc-variables-grid" });
		for (const entry of page.entries) {
			grid.createEl(page.code ? "code" : "strong", { text: entry.name });
			grid.createDiv({ cls: "bsc-variables-desc", text: entry.desc });
		}
	}
}
