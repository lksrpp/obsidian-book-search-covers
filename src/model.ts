// The single internal book shape. Every search provider (Google, Open Library)
// normalizes its response into this so the rest of the plugin — templating,
// cover resolution, note creation — never branches on provider.

export type BookSource = "google" | "openlibrary";

export interface BookResult {
	title: string;
	subtitle?: string;
	authors: string[];
	description?: string;
	publisher?: string;
	/** Raw published date as the provider gave it (e.g. "2021", "2021-05-04"). */
	publishedDate?: string;
	pageCount?: number;
	isbn13?: string;
	isbn10?: string;
	categories?: string[];
	/** BCP-47-ish language code from the provider (e.g. "en", "de"). */
	language?: string;
	seriesName?: string;
	seriesNumber?: string;
	/**
	 * Cover URL the search provider itself returned. Used only as the LAST
	 * cover fallback when Apple finds nothing — never the primary cover.
	 */
	providerCoverUrl?: string;
	/**
	 * Google volume id — lets us fetch the single-volume record for the picked
	 * book, whose description keeps paragraph structure (the list endpoint's
	 * is flattened to one line).
	 */
	googleVolumeId?: string;
	source: BookSource;
}

/** Best-effort 4-digit year pulled from a raw provider date. */
export function yearOf(book: BookResult): string | undefined {
	const m = book.publishedDate?.match(/\d{4}/);
	return m ? m[0] : undefined;
}

/** The ISBN we prefer for downstream lookups (cover fallback, enrichment). */
export function preferredIsbn(book: BookResult): string | undefined {
	return book.isbn13 ?? book.isbn10;
}
