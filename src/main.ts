import { Notice, Plugin, TFile } from "obsidian";
import {
	type BookSearchCoverSettings,
	BookSearchCoverSettingTab,
	clampCoverSize,
	DEFAULT_SETTINGS,
} from "./settings";
import { openBookSearch, type SearchOverrides } from "./ui/search-modal";
import { confirmDuplicate } from "./ui/duplicate-dialog";
import {
	collectCoverCandidates,
	type CoverCandidate,
	downloadCover,
	encodeCoverPath,
} from "./cover";
import { CoverPickerModal } from "./ui/cover-picker";
import {
	bookNoteBasename,
	createBookNote,
	findExistingBookNote,
	reserveNotePath,
} from "./note";
import { isbnFromArtworkUrl } from "./providers/apple";
import { fetchRichDescription } from "./providers/google";
import type { BookResult } from "./model";
import type { CoverMode } from "./settings";

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
				if (!checking) this.fetchCoverForNote(file);
				return true;
			},
		});
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<BookSearchCoverSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
		this.settings.coverSize = clampCoverSize(this.settings.coverSize);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private startSearch(): void {
		openBookSearch(this.app, this.settings, (book, overrides) =>
			this.handlePick(book, overrides),
		);
	}

	/**
	 * Duplicate gate for a picked book. Runs while the search modal is still
	 * open underneath, so cancelling the dialog drops the user back into their
	 * results. Returns whether the search modal should close.
	 */
	private async handlePick(book: BookResult, overrides: SearchOverrides): Promise<boolean> {
		const existing = findExistingBookNote(this.app, book);
		if (existing) {
			const choice = await confirmDuplicate(this.app, existing);
			if (choice === "cancel") return false;
			if (choice === "open") {
				await this.app.workspace.getLeaf("tab").openFile(existing);
				return true;
			}
		}
		void this.createNote(book, overrides);
		return true;
	}

	/**
	 * Create + open the note. The cover is the search provider's own image
	 * (for Google: upscaled to `coverSize`); the picker command covers the
	 * cases where that image is missing or poor. `overrides` carries the
	 * per-search choices made in the modal (store, cover storage mode).
	 */
	private async createNote(book: BookResult, overrides: SearchOverrides): Promise<void> {
		const notice = new Notice("Preparing note…", 0);
		try {
			// The list endpoint flattens descriptions to one paragraph; the
			// single-volume record keeps the publisher's paragraph structure.
			// One extra request, only for the book actually being created.
			if (book.googleVolumeId && this.settings.googleApiKey) {
				const rich = await fetchRichDescription(
					book.googleVolumeId,
					this.settings.googleApiKey,
				);
				if (rich) book = { ...book, description: rich };
			}

			// Reserve the final note path first so a downloaded cover can share
			// the note's exact basename (including any de-duplication suffix).
			const path = await reserveNotePath(
				this.app,
				this.settings,
				bookNoteBasename(this.settings, book),
			);
			const basename = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");

			let coverRef = book.providerCoverUrl ?? "";
			if (coverRef && overrides.coverMode === "download") {
				const localPath = await downloadCover(this.app, coverRef, basename, this.settings);
				if (localPath) coverRef = encodeCoverPath(localPath);
				else new Notice("Cover download failed; linking the remote URL.");
			}
			await this.finishCreate(book, coverRef, path);
		} finally {
			notice.hide();
		}
	}

	private async finishCreate(book: BookResult, coverRef: string, path: string): Promise<void> {
		try {
			const file = await createBookNote(this.app, this.settings, book, coverRef, path);
			await this.app.workspace.getLeaf("tab").openFile(file);
			new Notice(`Created “${file.basename}”.`);
			if (!coverRef) {
				new Notice(
					"No cover from the search provider. Use “Fetch or replace cover” to pick one.",
				);
			}
		} catch (e) {
			new Notice(e instanceof Error ? e.message : "Could not create note.");
		}
	}

	/**
	 * Open the cover picker for an existing note: candidates from Google and
	 * Apple (via the note's frontmatter title/author), re-queried when the
	 * store override changes inside the modal.
	 */
	private fetchCoverForNote(file: TFile): void {
		const fm = (this.app.metadataCache.getFileCache(file)?.frontmatter ??
			{}) as Record<string, unknown>;
		const title = typeof fm.title === "string" ? fm.title : file.basename;
		const author = pickAuthor(fm);

		new CoverPickerModal(
			this.app,
			this.settings,
			title,
			(country) =>
				collectCoverCandidates(
					{ title, author },
					{ ...this.settings, preferredCountry: country },
				),
			(candidate, coverMode) => void this.applyCover(file, candidate, coverMode),
		).open();
	}

	/** Write the picked cover into the note's frontmatter (downloading first if chosen). */
	private async applyCover(
		file: TFile,
		candidate: CoverCandidate,
		coverMode: CoverMode,
	): Promise<void> {
		let coverRef = candidate.url;
		if (coverMode === "download") {
			// Name the cover after the note's basename so they stay paired.
			const path = await downloadCover(this.app, candidate.url, file.basename, this.settings);
			if (path) coverRef = encodeCoverPath(path);
			else new Notice("Cover download failed; linking the remote URL.");
		}

		// Apple sometimes embeds the edition's ISBN-13 in the artwork filename —
		// backfill it when the note has none.
		const foundIsbn =
			candidate.source === "apple" ? isbnFromArtworkUrl(candidate.url) : undefined;

		await this.app.fileManager.processFrontMatter(
			file,
			(front: Record<string, unknown>) => {
				front[this.settings.coverProperty] = coverRef;
				if (foundIsbn && !front.isbn) front.isbn = foundIsbn;
			},
		);
		new Notice(`Cover set from ${candidate.source === "apple" ? "Apple" : "Google"}.`);
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
