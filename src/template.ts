// Note templating: simple, dependency-free `{{var}}` substitution over a single
// template string that covers both frontmatter and body. No Templater dep — any
// derived value (year, joined authors) is precomputed into a variable here.
//
// Two kinds of variables:
//   - scalars (string): substituted in place; YAML-escaped inside frontmatter.
//   - lists (string[]): a frontmatter line consisting of ONLY `{{var}}` expands
//     into a YAML block sequence (`  - "item"` per entry), so a template can do
//         author:
//         {{authorsYamlLinks}}
//     An empty list removes the line, leaving the property null. Used inline
//     (anywhere else), a list renders comma-joined.
//
// YAML caveat: scalar substitution is literal. The default template
// double-quotes scalar frontmatter values; `escapeYamlDouble` makes a value
// safe inside double quotes. Long/free-form text (description) belongs in the
// body.

import { type BookResult, yearOf, preferredIsbn } from "./model";

export type TemplateVars = Record<string, string | string[]>;

/**
 * User-facing reference of every template variable, rendered in the settings
 * tab. Keep in sync with `buildVars`.
 */
export const VARIABLE_DOCS: ReadonlyArray<{ name: string; desc: string }> = [
	{ name: "title", desc: "Book title" },
	{ name: "subtitle", desc: "Subtitle, if any" },
	{ name: "author", desc: "First author" },
	{ name: "authors", desc: "All authors, comma-separated" },
	{ name: "authorsYamlLinks", desc: "Authors as a YAML list of [[wikilinks]] (own line)" },
	{ name: "description", desc: "Publisher's description (body only — too long for frontmatter)" },
	{ name: "publisher", desc: "Publisher name" },
	{ name: "publishedDate", desc: "Raw publish date, e.g. 2021-05-04" },
	{ name: "year", desc: "4-digit publish year" },
	{ name: "pageCount", desc: "Number of pages" },
	{ name: "isbn", desc: "ISBN-13, falling back to ISBN-10" },
	{ name: "isbn13", desc: "ISBN-13 only" },
	{ name: "isbn10", desc: "ISBN-10 only" },
	{ name: "categories", desc: "Categories, comma-separated" },
	{ name: "categoriesYamlList", desc: "Categories as a YAML list (own line)" },
	{ name: "language", desc: "Language code, e.g. en, de" },
	{ name: "seriesName", desc: "Series name, if known" },
	{ name: "seriesNumber", desc: "Number within the series, if known" },
	{ name: "source", desc: "Search provider: google or openlibrary" },
	{ name: "cover", desc: "Cover URL or vault path, per the cover storage mode" },
];

/** Escape a string so it is safe inside a double-quoted YAML scalar. */
export function escapeYamlDouble(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/**
 * Build the variable map for a book. `coverRef` is whatever should appear for
 * `{{cover}}` — a remote URL or a vault-relative path, decided by the caller.
 */
export function buildVars(book: BookResult, coverRef: string): TemplateVars {
	return {
		title: book.title,
		subtitle: book.subtitle ?? "",
		author: book.authors[0] ?? "",
		authors: book.authors.join(", "),
		/** YAML list of `[[Author]]` wikilinks — see the file header. */
		authorsYamlLinks: book.authors.map((a) => `[[${a}]]`),
		description: book.description ?? "",
		publisher: book.publisher ?? "",
		publishedDate: book.publishedDate ?? "",
		year: yearOf(book) ?? "",
		pageCount: book.pageCount != null ? String(book.pageCount) : "",
		isbn: preferredIsbn(book) ?? "",
		isbn13: book.isbn13 ?? "",
		isbn10: book.isbn10 ?? "",
		categories: (book.categories ?? []).join(", "),
		/** YAML list of plain category strings. */
		categoriesYamlList: book.categories ?? [],
		language: book.language ?? "",
		seriesName: book.seriesName ?? "",
		seriesNumber: book.seriesNumber ?? "",
		source: book.source,
		cover: coverRef,
	};
}

/** Replace every `{{name}}` token, raw. Unknown tokens render as empty string. */
export function renderTemplate(template: string, vars: TemplateVars): string {
	return substitute(template, vars, false);
}

/**
 * Render a full note. Values substituted inside the leading frontmatter block
 * are YAML-escaped (safe inside a double-quoted scalar) and whole-line list
 * variables expand to block sequences; values in the body are left raw so
 * headings and `{{description}}` read naturally.
 */
export function renderNote(template: string, vars: TemplateVars): string {
	// Tolerate CRLF: a template pasted with \r\n endings must still be detected,
	// otherwise the whole frontmatter would skip escaping and break on a stray quote.
	const fm = template.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (!fm) return substitute(template, vars, false);
	const block = fm[0];
	const body = template.slice(block.length);
	return substitute(expandYamlLists(block, vars), vars, true) + substitute(body, vars, false);
}

/**
 * Expand frontmatter lines that consist of ONLY a list-variable placeholder
 * into YAML block sequences. The placeholder's own indentation is reused for
 * the items; an unindented placeholder gets the two-space indent Obsidian's
 * properties editor writes. Scalar/unknown placeholders are left for the
 * normal substitution pass.
 */
function expandYamlLists(block: string, vars: TemplateVars): string {
	return block.replace(
		/^([ \t]*)\{\{\s*(\w+)\s*\}\}[ \t]*\r?\n/gm,
		(line, indent: string, key: string) => {
			const value = vars[key];
			if (!Array.isArray(value)) return line;
			const pad = indent === "" ? "  " : indent;
			return value
				.filter((item) => item.trim() !== "")
				.map((item) => `${pad}- "${escapeYamlDouble(item)}"\n`)
				.join("");
		},
	);
}

function substitute(text: string, vars: TemplateVars, escapeForYaml: boolean): string {
	return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
		const value = vars[key] ?? "";
		const s = Array.isArray(value) ? value.join(", ") : value;
		return escapeForYaml ? escapeYamlDouble(s) : s;
	});
}
