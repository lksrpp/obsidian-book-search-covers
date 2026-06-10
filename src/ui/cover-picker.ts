// Cover picker: a grid of candidate covers from Google and Apple, each with a
// source badge and a short label, so the user can compare and pick by eye.
// Shares the options row (store + download override) with the search modal —
// changing the store re-queries both sources.

import { App, Modal } from "obsidian";
import type { CoverCandidate } from "../cover";
import type { BookSearchCoverSettings, CoverMode } from "../settings";
import { addOptionsRow } from "./search-modal";

const SOURCE_NAMES: Record<CoverCandidate["source"], string> = {
	google: "Google",
	apple: "Apple",
};

export class CoverPickerModal extends Modal {
	private country: string;
	private download: boolean;
	private generation = 0;
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
		this.download = settings.coverMode === "download";
	}

	onOpen(): void {
		this.modalEl.addClass("bsc-modal");
		this.titleEl.setText(`Pick a cover for “${this.noteTitle}”`);

		addOptionsRow(this.contentEl, {
			country: this.country,
			download: this.download,
			onCountry: (code) => {
				this.country = code;
				void this.load();
			},
			onDownload: (v) => {
				this.download = v;
			},
		});

		this.statusEl = this.contentEl.createDiv({ cls: "bsc-status" });
		this.gridEl = this.contentEl.createDiv({ cls: "bsc-cover-grid" });
		void this.load();
	}

	onClose(): void {
		this.generation++; // discard any in-flight fetch
		this.contentEl.empty();
	}

	private async load(): Promise<void> {
		const gen = ++this.generation;
		this.gridEl.empty();
		this.statusEl.setText("Searching covers…");
		const candidates = await this.fetchCandidates(this.country);
		if (gen !== this.generation) return;
		this.statusEl.setText(candidates.length === 0 ? "No covers found." : "");
		this.renderGrid(candidates);
	}

	private renderGrid(candidates: CoverCandidate[]): void {
		this.gridEl.empty();
		for (const candidate of candidates) {
			const card = this.gridEl.createEl("button", { cls: "bsc-cover-card" });
			const img = card.createEl("img", { cls: "bsc-cover-card-img" });
			img.src = candidate.url;
			img.loading = "lazy";
			card.createDiv({
				cls: `bsc-cover-card-badge bsc-cover-card-badge-${candidate.source}`,
				text: SOURCE_NAMES[candidate.source],
			});
			card.createDiv({ cls: "bsc-cover-card-label", text: candidate.label });
			card.addEventListener("click", () => {
				this.close();
				this.onPick(candidate, this.download ? "download" : "link");
			});
		}
	}
}
