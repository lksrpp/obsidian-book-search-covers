import { Notice, Plugin, TFile } from "obsidian";
import {
	type BookSearchCoverSettings,
	BookSearchCoverSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { openBookSearch } from "./ui/search-modal";
import { downloadCover, resolveCoverForBook, resolveCoverUrl } from "./cover";
import { createBookNote, sanitizeFileName } from "./note";
import type { BookResult } from "./model";

export default class BookSearchCoverPlugin extends Plugin {
	settings!: BookSearchCoverSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new BookSearchCoverSettingTab(this.app, this));

		this.addRibbonIcon("book-plus", "New book note", () => this.startSearch());

		this.addCommand({
			id: "new-book-note",
			name: "New book note",
			callback: () => this.startSearch(),
		});

		this.addCommand({
			id: "fetch-cover",
			name: "Fetch or replace cover for current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.fetchCoverForNote(file);
				return true;
			},
		});
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<BookSearchCoverSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private startSearch(): void {
		openBookSearch(this.app, this.settings, (book) => void this.createNote(book));
	}

	/** Resolve the cover, render the template, create + open the note. */
	private async createNote(book: BookResult): Promise<void> {
		const notice = new Notice("Fetching cover…", 0);
		const cover = await resolveCoverForBook(book, this.settings);
		let coverRef = "";
		if (cover) {
			coverRef = cover.url;
			if (this.settings.coverMode === "download") {
				const path = await downloadCover(
					this.app,
					cover,
					sanitizeFileName(book.title),
					this.settings,
				);
				if (path) coverRef = path;
				else new Notice("Cover download failed; linking the remote URL.");
			}
		}
		notice.hide();

		try {
			const file = await createBookNote(this.app, this.settings, book, coverRef);
			await this.app.workspace.getLeaf("tab").openFile(file);
			new Notice(`Created “${file.basename}”.`);
		} catch (e) {
			new Notice(e instanceof Error ? e.message : "Could not create note.");
		}
	}

	/** Re-fetch a cover for an existing note using its frontmatter title/author. */
	private async fetchCoverForNote(file: TFile): Promise<void> {
		const fm = (this.app.metadataCache.getFileCache(file)?.frontmatter ??
			{}) as Record<string, unknown>;
		const title = typeof fm.title === "string" ? fm.title : file.basename;
		const author = pickAuthor(fm);

		const notice = new Notice("Fetching cover…", 0);
		const cover = await resolveCoverUrl({ title, author }, this.settings);
		if (!cover) {
			notice.hide();
			new Notice("No cover found.");
			return;
		}

		let coverRef = cover.url;
		if (this.settings.coverMode === "download") {
			const path = await downloadCover(
				this.app,
				cover,
				sanitizeFileName(title),
				this.settings,
			);
			if (path) coverRef = path;
			else new Notice("Cover download failed; linking the remote URL.");
		}
		notice.hide();

		await this.app.fileManager.processFrontMatter(
			file,
			(front: Record<string, unknown>) => {
				front[this.settings.coverProperty] = coverRef;
			},
		);
		new Notice(`Cover set from ${cover.from}.`);
	}
}

/** Pull a single author string from frontmatter (`author` or `authors`). */
function pickAuthor(fm: Record<string, unknown>): string {
	const raw = fm.author ?? fm.authors;
	const first = Array.isArray(raw)
		? raw.find((x): x is string => typeof x === "string" && x.trim() !== "")
		: raw;
	return typeof first === "string" ? stripWikiLink(first) : "";
}

/** `[[Eliezer Yudkowsky]]` / `[[target|Alias]]` → plain name; passes others through. */
function stripWikiLink(s: string): string {
	const m = s.trim().match(/^\[\[(?:[^|\]]*\|)?([^\]]+)\]\]$/);
	return (m?.[1] ?? s).trim();
}
