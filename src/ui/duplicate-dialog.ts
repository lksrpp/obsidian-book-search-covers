// Confirmation shown when a picked book seems to already have a note,
// BEFORE anything is created. Closing the dialog (esc, click-away) counts
// as cancel.

import { App, ButtonComponent, Modal, TFile } from "obsidian";

export type DuplicateChoice = "open" | "create" | "cancel";

/** Ask what to do about an apparent duplicate; resolves with the choice. */
export function confirmDuplicate(app: App, existing: TFile): Promise<DuplicateChoice> {
	return new Promise((resolve) => new DuplicateDialog(app, existing, resolve).open());
}

class DuplicateDialog extends Modal {
	private done = false;

	constructor(
		app: App,
		private existing: TFile,
		private resolve: (choice: DuplicateChoice) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Note may already exist");
		this.contentEl.createEl("p", {
			text: `This book seems to already have a note: “${this.existing.basename}”.`,
		});
		const buttons = this.contentEl.createDiv({ cls: "bsc-dialog-buttons" });
		new ButtonComponent(buttons)
			.setButtonText("Open existing note")
			.setCta()
			.onClick(() => this.finish("open"));
		new ButtonComponent(buttons)
			.setButtonText("Create anyway")
			.onClick(() => this.finish("create"));
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.finish("cancel"));
	}

	onClose(): void {
		if (!this.done) {
			this.done = true;
			this.resolve("cancel");
		}
		this.contentEl.empty();
	}

	private finish(choice: DuplicateChoice): void {
		this.done = true;
		this.resolve(choice);
		this.close();
	}
}
