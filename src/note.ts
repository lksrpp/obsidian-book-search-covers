// Note creation: render the template, pick a collision-free path, write it.
//
// Path reservation (`reserveNotePath`) is separate from creation so the caller
// can name the downloaded cover after the FINAL note basename (including any
// de-duplication suffix) before writing the note.

import { App, normalizePath, Notice, TFile } from "obsidian";
import type { BookResult } from "./model";
import { buildVars, DEFAULT_TEMPLATE, renderNote, renderTemplate } from "./template";
// Pure tokenizer borrowed from the (parked) Apple heuristic: lowercases, strips
// punctuation/brackets/diacritics — which is also exactly what author
// comparison across frontmatter shapes ("[[Name]]", "Soares, Nate") needs.
import { normalizeTokens } from "./providers/apple";
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

/** The note basename for a book per the file name template (pre-dedup). */
export function bookNoteBasename(settings: BookSearchCoverSettings, book: BookResult): string {
	return sanitizeFileName(renderTemplate(settings.fileNameTemplate, buildVars(book, "")));
}

/**
 * Reserve a collision-free `.md` path for `basename` in the note folder
 * (creating the folder if needed). Never points at an existing file: on a name
 * collision a numeric suffix is appended.
 */
export async function reserveNotePath(
	app: App,
	settings: BookSearchCoverSettings,
	basename: string,
): Promise<string> {
	const folder = normalizePath(settings.noteFolder);
	await ensureFolder(app, folder);
	const base = folder === "" || folder === "/" ? basename : `${folder}/${basename}`;
	let candidate = normalizePath(`${base}.md`);
	let n = 1;
	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = normalizePath(`${base} ${++n}.md`);
	}
	return candidate;
}

/** Render the template for a book and create the note at `path`. */
export async function createBookNote(
	app: App,
	settings: BookSearchCoverSettings,
	book: BookResult,
	coverRef: string,
	path: string,
): Promise<TFile> {
	const template = await loadNoteTemplate(app, settings);
	const content = renderNote(template, buildVars(book, coverRef));
	return app.vault.create(path, content);
}

/**
 * The note template to render: the configured template file's content when one
 * is set, otherwise the inline template from the settings (itself defaulting
 * to the built-in template when blanked). A configured-but-missing file falls
 * back to the inline template WITH a notice (rather than failing the whole
 * creation flow — by this point the user has already searched and picked an
 * edition).
 */
export async function loadNoteTemplate(
	app: App,
	settings: BookSearchCoverSettings,
): Promise<string> {
	const raw = settings.templateFile.trim();
	if (raw !== "") {
		const file = resolveTemplateFile(app, raw);
		if (file) return app.vault.cachedRead(file);
		new Notice(
			`Template file "${raw}" not found; using the template from the settings.`,
			8000,
		);
	}
	return settings.noteTemplate.trim() === "" ? DEFAULT_TEMPLATE : settings.noteTemplate;
}

/** Find the configured template file, tolerating a missing `.md` extension. */
function resolveTemplateFile(app: App, raw: string): TFile | null {
	for (const candidate of [raw, `${raw}.md`]) {
		const f = app.vault.getAbstractFileByPath(normalizePath(candidate));
		if (f instanceof TFile) return f;
	}
	return null;
}

/**
 * Create `path` (a `.md` template file) pre-filled with `content`, for the
 * settings tab's "create template file" button. Returns the file's normalized
 * path. If a file already exists there, it is selected as-is — never
 * overwritten.
 */
export async function createTemplateFile(
	app: App,
	path: string,
	content: string,
): Promise<string> {
	const normalized = normalizePath(path.endsWith(".md") ? path : `${path}.md`);
	if (app.vault.getAbstractFileByPath(normalized)) return normalized;
	const slash = normalized.lastIndexOf("/");
	if (slash > 0) await ensureFolder(app, normalized.slice(0, slash));
	await app.vault.create(normalized, content);
	return normalized;
}

/**
 * Best-effort duplicate check over every markdown note's cached frontmatter
 * (in-memory metadata cache — no disk I/O). Used to WARN before creating —
 * never to block. Two signals, see `matchesBook`.
 */
export function findExistingBookNote(app: App, book: BookResult): TFile | null {
	for (const file of app.vault.getMarkdownFiles()) {
		const fm: Record<string, unknown> | undefined =
			app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm && matchesBook(book, fm)) return file;
	}
	return null;
}

/**
 * Does this note's frontmatter look like the same book?
 *   1. Same ISBN (`isbn`/`isbn13`/`isbn10`, dashes ignored) — exact edition
 *      identity. Different editions have different ISBNs, which is why the
 *      title signal below exists at all.
 *   2. Same title (case-insensitive) AND compatible authors. Frontmatter
 *      author shapes vary (list of `"[[wikilinks]]"`, plain string,
 *      comma-joined), so compatibility is a token overlap between any pair of
 *      authors — the tokenizer drops brackets/punctuation, making "[[Nate
 *      Soares]]" and "Soares, Nate" overlap. A title match where either side
 *      has no usable author info still counts: this only ever warns, and a
 *      rare false alarm is one dismissible notice while a silent skip defeats
 *      the check.
 */
export function matchesBook(book: BookResult, fm: Record<string, unknown>): boolean {
	const wantIsbns = new Set([book.isbn13, book.isbn10].filter((x): x is string => !!x));
	const fmIsbns = [fm.isbn, fm.isbn13, fm.isbn10]
		.map(normalizeIsbn)
		.filter((x): x is string => !!x);
	if (fmIsbns.some((x) => wantIsbns.has(x))) return true;

	if (
		typeof fm.title !== "string" ||
		fm.title.trim().toLowerCase() !== book.title.trim().toLowerCase()
	) {
		return false;
	}

	const bookAuthors = book.authors.map(normalizeTokens).filter((t) => t.size > 0);
	const fmAuthors = frontmatterAuthors(fm).map(normalizeTokens).filter((t) => t.size > 0);
	if (bookAuthors.length === 0 || fmAuthors.length === 0) return true;
	return bookAuthors.some((b) => fmAuthors.some((f) => intersects(b, f)));
}

/** All string values found under `author`/`authors`, flattened. */
function frontmatterAuthors(fm: Record<string, unknown>): string[] {
	return [fm.author, fm.authors]
		.flatMap((v): unknown[] => (Array.isArray(v) ? (v as unknown[]) : [v]))
		.filter((v): v is string => typeof v === "string");
}

function intersects(a: Set<string>, b: Set<string>): boolean {
	for (const t of a) if (b.has(t)) return true;
	return false;
}

/** Frontmatter ISBN value (string or YAML number) → bare digit string. */
function normalizeIsbn(value: unknown): string | null {
	if (typeof value === "number") return String(value);
	if (typeof value === "string") {
		const bare = value.replace(/[-\s]/g, "");
		return bare === "" ? null : bare;
	}
	return null;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	if (folder === "" || folder === "/") return;
	if (app.vault.getFolderByPath(folder)) return;
	await app.vault.createFolder(folder).catch(() => {
		// Concurrent creation — ignore.
	});
}
