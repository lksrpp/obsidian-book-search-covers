// Google Books — the PRIMARY search provider. Rich metadata in both English and
// German, and (crucially) returns ISBNs, page count and publisher in one call.
//
// A free API key is required as of 2026 — the keyless path is hard quota-gated.
// The key lives in plugin settings (data.json, local to the device).

import { requestUrl } from "obsidian";
import type { BookResult } from "../model";

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
): Promise<BookResult[]> {
	if (!apiKey) {
		throw new GoogleBooksError("No Google Books API key set (see plugin settings).");
	}
	const url = new URL(ENDPOINT);
	url.searchParams.set("q", query);
	url.searchParams.set("maxResults", String(MAX_RESULTS));
	url.searchParams.set("country", preferredCountry);
	url.searchParams.set("key", apiKey);

	let res;
	try {
		res = await requestUrl({ url: url.toString(), throw: false });
	} catch {
		throw new GoogleBooksError("Network error reaching Google Books.");
	}
	if (res.status === 429) throw new GoogleBooksError("Google Books rate limit reached.");
	if (res.status !== 200) {
		throw new GoogleBooksError(`Google Books returned status ${res.status}.`);
	}
	const body = res.json as { items?: { volumeInfo?: VolumeInfo }[] } | undefined;
	const items = body?.items ?? [];
	return items.map((it) => normalize(it.volumeInfo ?? {}));
}

function normalize(v: VolumeInfo): BookResult {
	const ids = v.industryIdentifiers ?? [];
	const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier;
	const isbn10 = ids.find((i) => i.type === "ISBN_10")?.identifier;
	// Google's thumbnail is low-res and carries a page-curl edge; request a
	// larger render and drop the curl. Only used as the LAST cover fallback.
	const rawCover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail;
	const providerCoverUrl = rawCover ? upscaleGoogleCover(rawCover) : undefined;

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
		source: "google",
	};
}

/** Best-res render of a Google Books cover URL: drop the curl, force a width. */
export function upscaleGoogleCover(url: string): string {
	return url
		.replace(/&edge=curl/, "")
		.replace(/&zoom=\d+/, "&zoom=1")
		.concat("&fife=w800");
}
