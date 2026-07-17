// Google Books — the PRIMARY search provider. Rich metadata in both English and
// German, and (crucially) returns ISBNs, page count and publisher in one call.
//
// A free API key is required as of 2026 — the keyless path is hard quota-gated.
// The key lives in plugin settings (data.json, local to the device).

import { asIsbnQuery, type BookResult } from "../model";
import { requestWithRetry } from "./http";

const ENDPOINT = "https://www.googleapis.com/books/v1/volumes";
const MAX_RESULTS = 5;

export class GoogleBooksError extends Error {}

interface VolumeInfo {
	title?: string;
	subtitle?: string;
	authors?: string[];
	description?: string;
	publisher?: string;
	publishedDate?: string;
	pageCount?: number;
	categories?: string[];
	language?: string;
	industryIdentifiers?: { type?: string; identifier?: string }[];
	imageLinks?: Record<string, string>;
}

/**
 * Search Google Books. Returns up to 5 normalized results. Throws
 * GoogleBooksError on a missing key or a non-200 response so the caller can
 * surface a clear Notice (and optionally fall back to Open Library).
 */
export async function searchGoogleBooks(
	query: string,
	apiKey: string,
	preferredCountry: string,
	coverWidth: number,
): Promise<BookResult[]> {
	if (!apiKey) {
		throw new GoogleBooksError("No Google Books API key set (see plugin settings).");
	}
	const url = new URL(ENDPOINT);
	// An ISBN-shaped query becomes the precise isbn: lookup.
	const isbn = asIsbnQuery(query);
	url.searchParams.set("q", isbn ? `isbn:${isbn}` : query);
	url.searchParams.set("maxResults", String(MAX_RESULTS));
	url.searchParams.set("country", preferredCountry);
	url.searchParams.set("key", apiKey);

	let res;
	try {
		res = await requestWithRetry({ url: url.toString() });
	} catch {
		throw new GoogleBooksError(
			"Could not reach Google Books. Check your internet connection.",
		);
	}
	if (res.status === 400 || res.status === 401 || res.status === 403) {
		throw new GoogleBooksError(
			`Google Books rejected the API key (status ${res.status}). Check it in the plugin settings.`,
		);
	}
	if (res.status === 429) {
		throw new GoogleBooksError(
			"Google Books daily quota reached (free tier: 1,000 searches). Try again tomorrow.",
		);
	}
	if (res.status >= 500) {
		throw new GoogleBooksError(
			`Google Books is temporarily unavailable (status ${res.status}) after retrying. Try again in a moment, or switch to another store.`,
		);
	}
	if (res.status !== 200) {
		throw new GoogleBooksError(`Google Books returned status ${res.status}.`);
	}
	const body = res.json as
		| { items?: { id?: string; volumeInfo?: VolumeInfo }[] }
		| undefined;
	const items = body?.items ?? [];
	return items.map((it) => normalize(it.volumeInfo ?? {}, coverWidth, it.id));
}

/**
 * Fetch the single-volume record for a picked book and return its description
 * converted to markdown, or null if unavailable. The list endpoint flattens
 * descriptions to one paragraph; only `volumes/{id}` keeps the publisher's
 * structure (as HTML: <p>, <br><br>, <b>, <i>). Costs one extra API request —
 * call it once per created note, never per search result.
 */
export async function fetchRichDescription(
	volumeId: string,
	apiKey: string,
): Promise<string | null> {
	const url = new URL(`${ENDPOINT}/${encodeURIComponent(volumeId)}`);
	url.searchParams.set("key", apiKey);
	try {
		const res = await requestWithRetry({ url: url.toString() });
		if (res.status !== 200) return null;
		const body = res.json as { volumeInfo?: { description?: string } } | undefined;
		const html = body?.volumeInfo?.description;
		return html ? htmlDescriptionToMarkdown(html) : null;
	} catch {
		return null;
	}
}

/**
 * Convert a Google volume description (loose publisher HTML) to plain
 * markdown-friendly text. Only paragraph structure is kept; <b>/<i> are
 * STRIPPED rather than converted — observed responses interleave them across
 * line breaks (malformed nesting), which would produce broken `**` runs.
 */
export function htmlDescriptionToMarkdown(html: string): string {
	return (
		html
			.replace(/<\/p>/gi, "\n\n")
			// 2+ consecutive <br> (any spacing, optional /) = paragraph break…
			.replace(/(?:<br\s*\/?>\s*){2,}/gi, "\n\n")
			// …a lone <br> = line break.
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<[^>]+>/g, "")
			.replace(/\n{3,}/g, "\n\n")
			.replace(/[ \t]+\n/g, "\n")
			.trim()
	);
}

function normalize(v: VolumeInfo, coverWidth: number, id?: string): BookResult {
	const ids = v.industryIdentifiers ?? [];
	const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier;
	const isbn10 = ids.find((i) => i.type === "ISBN_10")?.identifier;
	// Google's thumbnail is low-res and carries a page-curl edge; request a
	// larger render and drop the curl. Only used as the LAST cover fallback.
	const rawCover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail;
	const providerCoverUrl = rawCover ? upscaleGoogleCover(rawCover, coverWidth) : undefined;

	return {
		title: v.title ?? "Untitled",
		subtitle: v.subtitle,
		authors: v.authors ?? [],
		description: v.description,
		publisher: v.publisher,
		publishedDate: v.publishedDate,
		pageCount: v.pageCount,
		isbn13,
		isbn10,
		categories: v.categories,
		language: v.language,
		providerCoverUrl,
		googleVolumeId: id,
		source: "google",
	};
}

/**
 * Best-res render of a Google Books cover URL: force https (the API returns
 * plain-http links, which iOS blocks), drop the curl, force a width.
 */
export function upscaleGoogleCover(url: string, width: number): string {
	return url
		.replace(/^http:/, "https:")
		.replace(/&edge=curl/, "")
		.replace(/&zoom=\d+/, "&zoom=1")
		.concat(`&fife=w${width}`);
}
