// Markdown-file autocompletion for settings text fields, via the public
// AbstractInputSuggest API (the Templater/QuickAdd community pattern): typing
// filters existing vault notes, picking one fills the input and fires the
// input's own change handler — any path can still be typed freely.

import { AbstractInputSuggest, App, TFile } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TFile> {
	constructor(
		app: App,
		private textInputEl: HTMLInputElement,
	) {
		super(app, textInputEl);
	}

	protected getSuggestions(query: string): TFile[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.toLowerCase().includes(q))
			.slice(0, 50);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile): void {
		this.setValue(file.path);
		// Fire the input's own change pipeline so the TextComponent saves.
		this.textInputEl.trigger("input");
		this.close();
	}
}
