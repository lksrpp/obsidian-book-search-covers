// Open Library — the SEARCH FALLBACK, used only when Google returns no results
// (more likely for obscure German or self-published titles). Keyless. Its job
// is to *find the book*; cover handling stays with Apple → Google as elsewhere.

import { requestUrl } from "obsidian";
import { asIsbnQuery, type BookResult } from "../model";

const ENDPOINT = "https://openlibrary.org/search.json";
const LIMIT = 5;
// A descriptive User-Agent with contact info, as Open Library asks for.
const USER_AGENT = "book-search-covers (+https://github.com/lksrpp)";

export class OpenLibraryError extends Error {}

interface OlDoc {
	title?: string;
	subtitle?: string;
	author_name?: string[];
	first_publish_year?: number;
	number_of_pages_median?: number;
	isbn?: string[];
	subject?: string[];
	language?: string[];
	publisher?: string[];
	cover_i?: number;
}

/**
 * Search Open Library. Returns up to 5 normalized results, or throws
 * OpenLibraryError (with the HTTP status in the message) so the caller can
 * surface a clear Notice instead of a silent "no results" — mirrors Google.
 */
export async function searchOpenLibrary(query: string): Promise<BookResult[]> {
	const url = new URL(ENDPOINT);
	// An ISBN-shaped query becomes the precise isbn: field lookup.
	const isbn = asIsbnQuery(query);
	url.searchParams.set("q", isbn ? `isbn:${isbn}` : query);
	url.searchParams.set("limit", String(LIMIT));
	url.searchParams.set(
		"fields",
		"title,subtitle,author_name,first_publish_year,number_of_pages_median,isbn,subject,language,publisher,cover_i",
	);
	let res;
	try {
		res = await requestUrl({
			url: url.toString(),
			headers: { "User-Agent": USER_AGENT },
			throw: false,
		});
	} catch {
		throw new OpenLibraryError(
			"Could not reach Open Library. Check your internet connection.",
		);
	}
	if (res.status === 429) {
		throw new OpenLibraryError(
			"Open Library is rate-limiting this plugin (status 429). Try Google, or try again later.",
		);
	}
	if (res.status !== 200) {
		throw new OpenLibraryError(`Open Library returned status ${res.status}.`);
	}
	const body = res.json as { docs?: OlDoc[] } | undefined;
	return (body?.docs ?? []).map(normalize);
}

function normalize(d: OlDoc): BookResult {
	const isbns = d.isbn ?? [];
	const isbn13 = isbns.find((i) => i.length === 13);
	const isbn10 = isbns.find((i) => i.length === 10);
	const providerCoverUrl =
		d.cover_i != null
			? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
			: undefined;

	return {
		title: d.title ?? "Untitled",
		subtitle: d.subtitle,
		authors: d.author_name ?? [],
		publisher: d.publisher?.[0],
		publishedDate: d.first_publish_year ? String(d.first_publish_year) : undefined,
		pageCount: d.number_of_pages_median,
		isbn13,
		isbn10,
		categories: d.subject?.slice(0, 8),
		language: d.language?.[0],
		providerCoverUrl,
		source: "openlibrary",
	};
}
