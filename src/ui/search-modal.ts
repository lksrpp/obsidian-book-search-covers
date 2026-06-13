// Book search: ONE modal. Type a query (debounced live search — one Google
// request per pause, which respects the 1k/day free quota), browse rich result
// rows, refine the query in place if the book is wrong. The store and the
// cover-storage mode from settings are only defaults — both can be overridden
// here for this search.

import {
	App,
	debounce,
	DropdownComponent,
	Modal,
	Platform,
	setIcon,
	setTooltip,
} from "obsidian";
import { type BookResult, yearOf } from "../model";
import { searchBooks } from "../search";
import { type BookSearchCoverSettings, type CoverMode, STORES } from "../settings";
import { trackKeyboardViewport } from "./mobile-viewport";

/** Per-invocation choices made in a modal, overriding the settings defaults. */
export interface SearchOverrides {
	country: string;
	coverMode: CoverMode;
}

const MIN_QUERY_LEN = 3;
const DEBOUNCE_MS = 600;

export class BookSearchModal extends Modal {
	private country: string;
	private coverMode: CoverMode;
	private results: BookResult[] = [];
	private selected = -1;
	private generation = 0;
	private picking = false;
	private inputEl!: HTMLInputElement;
	private resultsEl!: HTMLElement;
	private disposeViewport: () => void = () => {};

	constructor(
		app: App,
		private settings: BookSearchCoverSettings,
		/** Resolves to true when the modal should close (false = stay open, e.g. duplicate cancel). */
		private onPick: (book: BookResult, overrides: SearchOverrides) => Promise<boolean>,
	) {
		super(app);
		this.country = settings.preferredCountry;
		this.coverMode = settings.coverMode;
	}

	onOpen(): void {
		this.modalEl.addClass("bsc-modal");
		this.titleEl.setText("Search for a book");

		this.inputEl = this.contentEl.createEl("input", {
			type: "text",
			cls: "bsc-query-input",
			attr: { placeholder: "Title, author, ISBN…" },
		});

		this.resultsEl = this.contentEl.createDiv({ cls: "bsc-results" });
		this.renderMessage("search", "Type to search by title, author or ISBN.");

		// Options and key hints live in a footer bar, so the eye goes straight
		// from the input to the results.
		const footer = this.contentEl.createDiv({ cls: "bsc-modal-footer" });
		addOptionsRow(footer, {
			country: this.country,
			coverMode: this.coverMode,
			onCountry: (code) => {
				this.country = code;
				void this.runSearch();
			},
			onCoverMode: (mode) => {
				this.coverMode = mode;
			},
		});
		addKeyHints(footer, [
			["↑↓", "navigate"],
			["↵", "create note"],
			["esc", "close"],
		]);

		const debounced = debounce(() => void this.runSearch(), DEBOUNCE_MS, true);
		this.inputEl.addEventListener("input", () => {
			this.selected = -1;
			debounced();
		});
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				debounced.cancel();
				if (this.selected >= 0) void this.pick(this.results[this.selected]);
				else {
					void this.runSearch();
					// On mobile, "Search" on the keyboard means "I'm done typing":
					// drop focus so the keyboard closes and the results get the
					// full screen. (Desktop keeps focus for quick query edits.)
					if (Platform.isMobile) this.inputEl.blur();
				}
			} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				this.moveSelection(e.key === "ArrowDown" ? 1 : -1);
			}
		});
		window.setTimeout(() => this.inputEl.focus(), 0);
		this.disposeViewport = trackKeyboardViewport(this);
	}

	onClose(): void {
		this.generation++; // discard any in-flight search
		this.disposeViewport();
		this.contentEl.empty();
	}

	private async runSearch(): Promise<void> {
		const query = this.inputEl.value.trim();
		if (query.length < MIN_QUERY_LEN) return;
		const gen = ++this.generation;
		this.renderSkeleton();
		try {
			const results = await searchBooks(query, this.settings, this.country);
			if (gen !== this.generation) return; // a newer search superseded this one
			this.results = results;
			if (results.length === 0) {
				this.renderMessage("book-x", "No books found. Try another store or fewer words.");
			} else {
				this.renderResults();
			}
		} catch (e) {
			if (gen !== this.generation) return;
			this.results = [];
			this.renderMessage(
				"alert-triangle",
				e instanceof Error ? e.message : "Search failed.",
			);
		}
	}

	/** Centered icon + text, used for the idle, no-results and error states. */
	private renderMessage(icon: string, text: string): void {
		this.resultsEl.empty();
		this.selected = -1;
		const box = this.resultsEl.createDiv({ cls: "bsc-empty" });
		setIcon(box.createDiv({ cls: "bsc-empty-icon" }), icon);
		box.createDiv({ text });
	}

	/** Shimmering placeholder rows while a search is in flight. */
	private renderSkeleton(): void {
		this.resultsEl.empty();
		this.selected = -1;
		for (let i = 0; i < 4; i++) {
			const row = this.resultsEl.createDiv({ cls: "bsc-result-row bsc-skeleton-row" });
			row.createDiv({ cls: "bsc-result-cover bsc-skeleton-block" });
			const text = row.createDiv({ cls: "bsc-result-text" });
			text.createDiv({ cls: "bsc-skeleton-line bsc-skeleton-block" });
			text.createDiv({ cls: "bsc-skeleton-line bsc-skeleton-block" });
			text.createDiv({ cls: "bsc-skeleton-line bsc-skeleton-block" });
		}
	}

	private renderResults(): void {
		this.resultsEl.empty();
		this.selected = -1;
		this.results.forEach((book, i) => {
			const row = this.resultsEl.createEl("button", { cls: "bsc-result-row" });
			// Always render the same fixed-size slot, image or not, so every
			// row's text starts at the same x position.
			const cover = row.createDiv({ cls: "bsc-result-cover" });
			if (book.providerCoverUrl) {
				const img = cover.createEl("img");
				img.addEventListener("load", () => img.addClass("is-loaded"));
				img.src = book.providerCoverUrl;
				img.loading = "lazy";
				if (img.complete) img.addClass("is-loaded");
			} else {
				cover.addClass("bsc-result-cover-empty");
				setIcon(cover, "book");
			}
			const text = row.createDiv({ cls: "bsc-result-text" });
			text.createDiv({ cls: "bsc-result-title", text: book.title });
			if (book.authors.length > 0) {
				text.createDiv({ cls: "bsc-result-authors", text: book.authors.join(", ") });
			}
			const meta = [
				yearOf(book),
				book.pageCount != null ? `${book.pageCount} pages` : undefined,
				book.publisher,
			]
				.filter((x) => x)
				.join(" · ");
			if (meta) text.createEl("small", { cls: "bsc-result-meta", text: meta });
			if (book.description) {
				text.createDiv({ cls: "bsc-result-desc", text: book.description });
			}
			row.addEventListener("click", () => void this.pick(book));
			row.addEventListener("mousemove", () => this.setSelection(i));
		});
	}

	private moveSelection(delta: number): void {
		if (this.results.length === 0) return;
		const next =
			(this.selected + delta + this.results.length + 1) % (this.results.length + 1);
		this.setSelection(next === this.results.length ? -1 : next);
	}

	private setSelection(index: number): void {
		this.selected = index;
		const rows = this.resultsEl.children;
		for (let i = 0; i < rows.length; i++) {
			rows[i]?.toggleClass("is-selected", i === index);
		}
		if (index >= 0) rows[index]?.scrollIntoView({ block: "nearest" });
	}

	private async pick(book: BookResult | undefined): Promise<void> {
		if (!book || this.picking) return;
		// Keep the modal open underneath while the handler may still ask about
		// duplicates; "cancel" there returns the user right back to the results.
		this.picking = true;
		try {
			const close = await this.onPick(book, {
				country: this.country,
				coverMode: this.coverMode,
			});
			if (close) this.close();
		} finally {
			this.picking = false;
		}
	}
}

/**
 * The options row shared by the search modal and the cover picker, so both
 * modals read the same way: a store dropdown and a cover-storage dropdown,
 * defaulted from settings, applying to this invocation only.
 */
export function addOptionsRow(
	parent: HTMLElement,
	opts: {
		country: string;
		coverMode: CoverMode;
		onCountry: (code: string) => void;
		onCoverMode: (mode: CoverMode) => void;
	},
): void {
	const row = parent.createDiv({ cls: "bsc-options-row" });

	// Icon + short label keep the controls compact; the tooltip carries the
	// part users cannot guess: what the dropdown affects, and that it only
	// applies to this search.
	const storeOpt = row.createDiv({ cls: "bsc-option" });
	setIcon(storeOpt.createSpan({ cls: "bsc-option-icon" }), "globe");
	storeOpt.createEl("label", { cls: "bsc-option-label", text: "Store" });
	setTooltip(storeOpt, "Store region for search results and covers. This search only.");
	const dropdown = new DropdownComponent(storeOpt);
	for (const store of STORES) dropdown.addOption(store.code, `${store.label} (${store.code})`);
	if (!STORES.some((s) => s.code === opts.country)) {
		dropdown.addOption(opts.country, opts.country);
	}
	dropdown.setValue(opts.country).onChange(opts.onCountry);

	const coverOpt = row.createDiv({ cls: "bsc-option" });
	setIcon(coverOpt.createSpan({ cls: "bsc-option-icon" }), "image");
	coverOpt.createEl("label", { cls: "bsc-option-label", text: "Cover" });
	setTooltip(
		coverOpt,
		"Keep the cover as a remote link, or download it into the vault. This search only.",
	);
	new DropdownComponent(coverOpt)
		.addOption("link", "Link URL")
		.addOption("download", "Download")
		.setValue(opts.coverMode)
		.onChange((v) => opts.onCoverMode(v as CoverMode));
}

/**
 * Render the `kbd · label` hint group used in both modal footers. Skipped on
 * mobile, where there is no keyboard to hint at.
 */
export function addKeyHints(
	parent: HTMLElement,
	hints: ReadonlyArray<readonly [key: string, label: string]>,
): void {
	if (Platform.isMobile) return;
	const el = parent.createDiv({ cls: "bsc-key-hints" });
	for (const [key, label] of hints) {
		const hint = el.createSpan({ cls: "bsc-key-hint" });
		hint.createEl("kbd", { text: key });
		hint.appendText(` ${label}`);
	}
}

/**
 * Open the search modal, calling `onPick` with the chosen book + overrides.
 * `onPick` resolves to whether the modal should close; false keeps it open
 * (used when the duplicate dialog is cancelled).
 */
export function openBookSearch(
	app: App,
	settings: BookSearchCoverSettings,
	onPick: (book: BookResult, overrides: SearchOverrides) => Promise<boolean>,
): void {
	new BookSearchModal(app, settings, onPick).open();
}
