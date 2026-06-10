// Note templating: simple, dependency-free `{{var}}` substitution over a single
// template string that covers both frontmatter and body. No Templater dep — any
// derived value (year, joined authors) is precomputed into a variable here.
//
// YAML caveat: substitution is literal. The default template double-quotes
// scalar frontmatter values; `escapeYamlDouble` makes a value safe to sit
// inside double quotes. Long/free-form text (description) belongs in the body.

import { type BookResult, yearOf, preferredIsbn } from "./model";

export type TemplateVars = Record<string, string>;

/** Escape a string so it is safe inside a double-quoted YAML scalar. */
export function escapeYamlDouble(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/**
 * Build the variable map for a book. `coverRef` is whatever should appear for
 * `{{cover}}` — a remote URL or a vault-relative path, decided by the caller.
 */
export function buildVars(book: BookResult, coverRef: string): TemplateVars {
	const authors = book.authors.join(", ");
	return {
		title: book.title,
		subtitle: book.subtitle ?? "",
		author: book.authors[0] ?? "",
		authors,
		description: book.description ?? "",
		publisher: book.publisher ?? "",
		publishedDate: book.publishedDate ?? "",
		year: yearOf(book) ?? "",
		pageCount: book.pageCount != null ? String(book.pageCount) : "",
		isbn: preferredIsbn(book) ?? "",
		isbn13: book.isbn13 ?? "",
		isbn10: book.isbn10 ?? "",
		categories: (book.categories ?? []).join(", "),
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
 * are YAML-escaped (safe inside a double-quoted scalar); values in the body are
 * left raw so headings and `{{description}}` read naturally. This keeps the
 * single-template design while preventing a stray quote in a title from
 * breaking the whole note's frontmatter.
 */
export function renderNote(template: string, vars: TemplateVars): string {
	// Tolerate CRLF: a template pasted with \r\n endings must still be detected,
	// otherwise the whole frontmatter would skip escaping and break on a stray quote.
	const fm = template.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (!fm) return substitute(template, vars, false);
	const block = fm[0];
	const body = template.slice(block.length);
	return substitute(block, vars, true) + substitute(body, vars, false);
}

function substitute(text: string, vars: TemplateVars, escapeForYaml: boolean): string {
	return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
		const value = vars[key] ?? "";
		return escapeForYaml ? escapeYamlDouble(value) : value;
	});
}
