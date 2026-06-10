// Book search: ONE modal. Type a query (debounced live search — one Google
// request per pause, which respects the 1k/day free quota), browse rich result
// rows, refine the query in place if the book is wrong. The store and the
// cover-storage mode from settings are only defaults — both can be overridden
// here for this search.

import { App, debounce, DropdownComponent, Modal, ToggleComponent } from "obsidian";
import { type BookResult, yearOf } from "../model";
import { searchBooks } from "../search";
import { type BookSearchCoverSettings, type CoverMode, STORES } from "../settings";

/** Per-invocation choices made in a modal, overriding the settings defaults. */
export interface SearchOverrides {
	country: string;
	coverMode: CoverMode;
}

const MIN_QUERY_LEN = 3;
const DEBOUNCE_MS = 600;

export class BookSearchModal extends Modal {
	private country: string;
	private download: boolean;
	private results: BookResult[] = [];
	private selected = -1;
	private generation = 0;
	private inputEl!: HTMLInputElement;
	private statusEl!: HTMLElement;
	private resultsEl!: HTMLElement;

	constructor(
		app: App,
		private settings: BookSearchCoverSettings,
		private onPick: (book: BookResult, overrides: SearchOverrides) => void,
	) {
		super(app);
		this.country = settings.preferredCountry;
		this.download = settings.coverMode === "download";
	}

	onOpen(): void {
		this.modalEl.addClass("bsc-modal");
		this.titleEl.setText("Search for a book");

		this.inputEl = this.contentEl.createEl("input", {
			type: "text",
			cls: "bsc-query-input",
			attr: { placeholder: "Title, author, ISBN…" },
		});

		addOptionsRow(this.contentEl, {
			country: this.country,
			download: this.download,
			onCountry: (code) => {
				this.country = code;
				void this.runSearch();
			},
			onDownload: (v) => {
				this.download = v;
			},
		});

		this.statusEl = this.contentEl.createDiv({ cls: "bsc-status" });
		this.statusEl.setText(`Type at least ${MIN_QUERY_LEN} characters to search.`);
		this.resultsEl = this.contentEl.createDiv({ cls: "bsc-results" });

		const debounced = debounce(() => void this.runSearch(), DEBOUNCE_MS, true);
		this.inputEl.addEventListener("input", () => {
			this.selected = -1;
			debounced();
		});
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				debounced.cancel();
				if (this.selected >= 0) this.pick(this.results[this.selected]);
				else void this.runSearch();
			} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				this.moveSelection(e.key === "ArrowDown" ? 1 : -1);
			}
		});
		window.setTimeout(() => this.inputEl.focus(), 0);
	}

	onClose(): void {
		this.generation++; // discard any in-flight search
		this.contentEl.empty();
	}

	private async runSearch(): Promise<void> {
		const query = this.inputEl.value.trim();
		if (query.length < MIN_QUERY_LEN) return;
		const gen = ++this.generation;
		this.statusEl.setText("Searching…");
		try {
			const results = await searchBooks(query, this.settings, this.country);
			if (gen !== this.generation) return; // a newer search superseded this one
			this.results = results;
			this.statusEl.setText(results.length === 0 ? "No books found." : "");
			this.renderResults();
		} catch (e) {
			if (gen !== this.generation) return;
			this.results = [];
			this.resultsEl.empty();
			this.statusEl.setText(e instanceof Error ? e.message : "Search failed.");
		}
	}

	private renderResults(): void {
		this.resultsEl.empty();
		this.selected = -1;
		this.results.forEach((book, i) => {
			const row = this.resultsEl.createEl("button", { cls: "bsc-result-row" });
			if (book.providerCoverUrl) {
				const img = row.createEl("img", { cls: "bsc-result-cover" });
				img.src = book.providerCoverUrl;
				img.loading = "lazy";
			} else {
				row.createDiv({ cls: "bsc-result-cover bsc-result-cover-empty" });
			}
			const text = row.createDiv({ cls: "bsc-result-text" });
			text.createDiv({ cls: "bsc-result-title", text: book.title });
			const meta = [
				book.authors.join(", "),
				yearOf(book),
				book.pageCount != null ? `${book.pageCount} pages` : undefined,
				book.publisher,
			]
				.filter((x) => x)
				.join(" · ");
			text.createEl("small", { cls: "bsc-result-meta", text: meta });
			if (book.description) {
				text.createDiv({ cls: "bsc-result-desc", text: book.description });
			}
			row.addEventListener("click", () => this.pick(book));
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

	private pick(book: BookResult | undefined): void {
		if (!book) return;
		this.close();
		this.onPick(book, {
			country: this.country,
			coverMode: this.download ? "download" : "link",
		});
	}
}

/**
 * The options row shared by the search modal and the cover picker, so both
 * modals read the same way: a store dropdown and a download toggle, defaulted
 * from settings, applying to this invocation only.
 */
export function addOptionsRow(
	parent: HTMLElement,
	opts: {
		country: string;
		download: boolean;
		onCountry: (code: string) => void;
		onDownload: (download: boolean) => void;
	},
): void {
	const row = parent.createDiv({ cls: "bsc-options-row" });

	const storeOpt = row.createDiv({ cls: "bsc-option" });
	storeOpt.createEl("label", { text: "Store" });
	const dropdown = new DropdownComponent(storeOpt);
	for (const store of STORES) dropdown.addOption(store.code, `${store.label} (${store.code})`);
	if (!STORES.some((s) => s.code === opts.country)) {
		dropdown.addOption(opts.country, opts.country);
	}
	dropdown.setValue(opts.country).onChange(opts.onCountry);

	const dlOpt = row.createDiv({ cls: "bsc-option" });
	dlOpt.createEl("label", { text: "Download cover" });
	new ToggleComponent(dlOpt).setValue(opts.download).onChange(opts.onDownload);
}

/** Open the search modal, calling `onPick` with the chosen book + overrides. */
export function openBookSearch(
	app: App,
	settings: BookSearchCoverSettings,
	onPick: (book: BookResult, overrides: SearchOverrides) => void,
): void {
	new BookSearchModal(app, settings, onPick).open();
}
