// Cover picker: a grid of candidate covers from Google and Apple, each with a
// caption (title / author / year / API), so the user can compare and pick by
// eye. Shares the options row (store + cover-storage override) and footer
// layout with the search modal — changing the store re-queries both sources.

import { App, Modal } from "obsidian";
import type { CoverCandidate } from "../cover";
import type { BookSearchCoverSettings, CoverMode } from "../settings";
import { addKeyHints, addOptionsRow } from "./search-modal";

const SOURCE_NAMES: Record<CoverCandidate["source"], string> = {
	google: "Google",
	apple: "Apple",
};

export class CoverPickerModal extends Modal {
	private country: string;
	private coverMode: CoverMode;
	private generation = 0;
	private candidates: CoverCandidate[] = [];
	private selected = -1;
	private statusEl!: HTMLElement;
	private gridEl!: HTMLElement;

	constructor(
		app: App,
		settings: BookSearchCoverSettings,
		private noteTitle: string,
		private fetchCandidates: (country: string) => Promise<CoverCandidate[]>,
		private onPick: (candidate: CoverCandidate, coverMode: CoverMode) => void,
	) {
		super(app);
		this.country = settings.preferredCountry;
		this.coverMode = settings.coverMode;
	}

	onOpen(): void {
		this.modalEl.addClass("bsc-modal");
		this.titleEl.setText(`Pick a cover for “${this.noteTitle}”`);

		this.statusEl = this.contentEl.createDiv({ cls: "bsc-status" });
		this.gridEl = this.contentEl.createDiv({ cls: "bsc-cover-grid" });

		const footer = this.contentEl.createDiv({ cls: "bsc-modal-footer" });
		addOptionsRow(footer, {
			country: this.country,
			coverMode: this.coverMode,
			onCountry: (code) => {
				this.country = code;
				void this.load();
			},
			onCoverMode: (mode) => {
				this.coverMode = mode;
			},
		});
		addKeyHints(footer, [
			["←↑↓→", "navigate"],
			["↵", "pick"],
			["esc", "close"],
		]);

		this.scope.register([], "ArrowRight", (e) => this.move(e, 1));
		this.scope.register([], "ArrowLeft", (e) => this.move(e, -1));
		this.scope.register([], "ArrowDown", (e) => this.move(e, this.columns()));
		this.scope.register([], "ArrowUp", (e) => this.move(e, -this.columns()));
		this.scope.register([], "Enter", (e) => {
			if (this.selected < 0) return;
			e.preventDefault();
			this.pickAt(this.selected);
		});

		void this.load();
	}

	onClose(): void {
		this.generation++; // discard any in-flight fetch
		this.contentEl.empty();
	}

	private async load(): Promise<void> {
		const gen = ++this.generation;
		this.gridEl.empty();
		this.candidates = [];
		this.selected = -1;
		this.statusEl.setText("Searching covers…");
		const candidates = await this.fetchCandidates(this.country);
		if (gen !== this.generation) return;
		this.statusEl.setText(candidates.length === 0 ? "No covers found." : "");
		this.renderGrid(candidates);
	}

	private renderGrid(candidates: CoverCandidate[]): void {
		this.gridEl.empty();
		this.candidates = candidates;
		this.selected = -1;
		candidates.forEach((candidate, i) => {
			const card = this.gridEl.createEl("button", { cls: "bsc-cover-card" });
			const img = card.createEl("img", { cls: "bsc-cover-card-img" });
			const caption = card.createDiv({ cls: "bsc-cover-card-caption" });
			caption.createDiv({ cls: "bsc-cover-card-title", text: candidate.title });
			if (candidate.author) {
				caption.createDiv({ cls: "bsc-cover-card-author", text: candidate.author });
			}
			if (candidate.year) {
				caption.createDiv({ cls: "bsc-cover-card-year", text: candidate.year });
			}
			// Actual pixel size, filled in once the image loads — lets
			// sharpness be compared by number, not by squinting.
			const dims = caption.createDiv({ cls: "bsc-cover-card-dims" });
			caption.createDiv({
				cls: "bsc-cover-card-api",
				text: `API: ${SOURCE_NAMES[candidate.source]}`,
			});
			const markLoaded = () => {
				img.addClass("is-loaded");
				if (img.naturalWidth > 0) {
					dims.setText(`${img.naturalWidth}×${img.naturalHeight} px`);
				}
			};
			img.addEventListener("load", markLoaded);
			img.src = candidate.url;
			img.loading = "lazy";
			if (img.complete) markLoaded();
			card.addEventListener("click", () => this.pickAt(i));
			card.addEventListener("mousemove", () => this.setSelection(i));
		});
	}

	/** Number of grid columns at the current modal width. */
	private columns(): number {
		const cols = getComputedStyle(this.gridEl).gridTemplateColumns.split(" ").length;
		return Math.max(cols, 1);
	}

	private move(e: KeyboardEvent, delta: number): void {
		if (this.candidates.length === 0) return;
		e.preventDefault();
		const next =
			this.selected < 0
				? 0
				: Math.min(Math.max(this.selected + delta, 0), this.candidates.length - 1);
		this.setSelection(next);
	}

	private setSelection(index: number): void {
		this.selected = index;
		const cards = this.gridEl.children;
		for (let i = 0; i < cards.length; i++) {
			cards[i]?.toggleClass("is-selected", i === index);
		}
		if (index >= 0) cards[index]?.scrollIntoView({ block: "nearest" });
	}

	private pickAt(index: number): void {
		const candidate = this.candidates[index];
		if (!candidate) return;
		this.close();
		this.onPick(candidate, this.coverMode);
	}
}
