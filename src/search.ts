// Search orchestration: Google Books first, falling back to Open Library when
// Google returns zero results or fails. Without an API key, Google is skipped
// and Open Library is used directly.

import type { BookResult } from "./model";
import { searchGoogleBooks } from "./providers/google";
import { searchOpenLibrary } from "./providers/openlibrary";
import type { BookSearchCoverSettings } from "./settings";

export async function searchBooks(
	query: string,
	settings: BookSearchCoverSettings,
	country: string = settings.preferredCountry,
): Promise<BookResult[]> {
	if (!settings.googleApiKey) {
		return searchOpenLibrary(query);
	}
	try {
		const results = await searchGoogleBooks(
			query,
			settings.googleApiKey,
			country,
			settings.coverSize,
		);
		if (results.length > 0) return results;
	} catch (e) {
		const fallback = await searchOpenLibrary(query);
		if (fallback.length > 0) return fallback;
		throw e;
	}
	// Google returned a clean empty result — try Open Library before giving up.
	return searchOpenLibrary(query);
}
