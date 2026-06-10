// Folder autocompletion for settings text fields, via the public
// AbstractInputSuggest API (the Templater/QuickAdd community pattern): typing
// filters existing vault folders, picking one fills the input and fires the
// input's own change handler — any new path can still be typed freely.

import { AbstractInputSuggest, App, TFolder } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private textInputEl: HTMLInputElement,
	) {
		super(app, textInputEl);
	}

	protected getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		// getAllLoadedFiles + filter rather than getAllFolders(): the latter
		// needs Obsidian 1.6.6, above our minAppVersion.
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder && f.path !== "/" && f.path.toLowerCase().includes(q),
			)
			.slice(0, 50);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		// Fire the input's own change pipeline so the TextComponent saves.
		this.textInputEl.trigger("input");
		this.close();
	}
}
