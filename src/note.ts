// Note creation: render the template, pick a collision-free path, write it.

import { App, normalizePath, TFile } from "obsidian";
import type { BookResult } from "./model";
import { buildVars, renderNote, renderTemplate } from "./template";
import type { BookSearchCoverSettings } from "./settings";

// Illegal in an Obsidian note name (filesystem + link/markdown syntax). The
// colon is handled separately so a subtitle reads as a dash, not a gap. Commas,
// apostrophes and accented letters are intentionally kept.
const UNSAFE_FILENAME = /[\\/*?"<>|#^[\]]/g;

/** Make a string usable as a note/file basename. */
export function sanitizeFileName(name: string): string {
	const cleaned = name
		.replace(/\s*:\s*/g, " - ") // subtitle separator → dash
		.replace(UNSAFE_FILENAME, " ")
		.replace(/\s+/g, " ")
		.replace(/^[\s-]+|[\s-]+$/g, ""); // no leading/trailing space or dash
	return cleaned.length > 0 ? cleaned : "Untitled";
}

/**
 * Create a book note from the template. Returns the created file. Never
 * overwrites: on a name collision a numeric suffix is appended.
 */
export async function createBookNote(
	app: App,
	settings: BookSearchCoverSettings,
	book: BookResult,
	coverRef: string,
): Promise<TFile> {
	const vars = buildVars(book, coverRef);
	const content = renderNote(settings.noteTemplate, vars);
	const basename = sanitizeFileName(renderTemplate(settings.fileNameTemplate, vars));

	const folder = normalizePath(settings.noteFolder);
	await ensureFolder(app, folder);

	const path = await uniquePath(app, folder, basename);
	return app.vault.create(path, content);
}

async function uniquePath(app: App, folder: string, basename: string): Promise<string> {
	const base = folder === "" || folder === "/" ? basename : `${folder}/${basename}`;
	let candidate = normalizePath(`${base}.md`);
	let n = 1;
	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = normalizePath(`${base} ${++n}.md`);
	}
	return candidate;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	if (folder === "" || folder === "/") return;
	if (app.vault.getFolderByPath(folder)) return;
	await app.vault.createFolder(folder).catch(() => {
		// Concurrent creation — ignore.
	});
}
