// Search UI. Two steps on purpose: a query prompt, then a rich pick-list of the
// fetched results. We do NOT search per keystroke — Google Books' free tier is
// 1,000 requests/day, so one search per submitted query keeps it sustainable.

import { App, Modal, Notice, SuggestModal } from "obsidian";
import { type BookResult, yearOf } from "../model";
import { searchBooks } from "../search";
import type { BookSearchCoverSettings } from "../settings";

/** Step 1: collect the raw query. */
class QueryModal extends Modal {
	constructor(
		app: App,
		private onSubmit: (query: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Search for a book");
		const input = this.contentEl.createEl("input", {
			type: "text",
			cls: "bsc-query-input",
			attr: { placeholder: "Title, author, ISBN…" },
		});
		const submit = () => {
			const q = input.value.trim();
			if (q) {
				this.close();
				this.onSubmit(q);
			}
		};
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});
		const btn = this.contentEl.createEl("button", {
			text: "Search",
			cls: "mod-cta bsc-query-btn",
		});
		btn.addEventListener("click", submit);
		window.setTimeout(() => input.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Step 2: pick from the fetched candidates (cover + title + meta + blurb). */
class BookSuggestModal extends SuggestModal<BookResult> {
	constructor(
		app: App,
		private results: BookResult[],
		private onPick: (book: BookResult) => void,
	) {
		super(app);
		this.setPlaceholder("Pick the matching book…");
	}

	getSuggestions(query: string): BookResult[] {
		const q = query.toLowerCase().trim();
		if (!q) return this.results;
		return this.results.filter(
			(b) =>
				b.title.toLowerCase().includes(q) ||
				b.authors.join(" ").toLowerCase().includes(q),
		);
	}

	renderSuggestion(book: BookResult, el: HTMLElement): void {
		el.addClass("bsc-suggest-row");
		if (book.providerCoverUrl) {
			const img = el.createEl("img", { cls: "bsc-suggest-cover" });
			img.src = book.providerCoverUrl;
			img.loading = "lazy";
		} else {
			el.createDiv({ cls: "bsc-suggest-cover bsc-suggest-cover-empty" });
		}
		const text = el.createDiv({ cls: "bsc-suggest-text" });
		text.createDiv({ cls: "bsc-suggest-title", text: book.title });
		const meta = [book.authors.join(", "), yearOf(book), book.publisher]
			.filter((x) => x)
			.join(" · ");
		text.createEl("small", { cls: "bsc-suggest-meta", text: meta });
		if (book.description) {
			text.createDiv({
				cls: "bsc-suggest-desc",
				text: book.description.slice(0, 140),
			});
		}
	}

	onChooseSuggestion(book: BookResult): void {
		this.onPick(book);
	}
}

/** Run the full search flow, calling `onPick` with the chosen book. */
export function openBookSearch(
	app: App,
	settings: BookSearchCoverSettings,
	onPick: (book: BookResult) => void,
): void {
	const run = async (query: string) => {
		const searching = new Notice("Searching books…", 0);
		try {
			const results = await searchBooks(query, settings);
			searching.hide();
			if (results.length === 0) {
				new Notice("No books found.");
				return;
			}
			new BookSuggestModal(app, results, onPick).open();
		} catch (e) {
			searching.hide();
			new Notice(e instanceof Error ? e.message : "Search failed.");
		}
	};
	new QueryModal(app, (query) => void run(query)).open();
}
