// Search orchestration: Google Books first; fall back to Open Library only when
// Google returns zero results. Errors from Google (bad key, rate limit) are
// surfaced to the caller rather than silently swallowed.

import type { BookResult } from "./model";
import { searchGoogleBooks } from "./providers/google";
import { searchOpenLibrary } from "./providers/openlibrary";
import type { BookSearchCoverSettings } from "./settings";

export async function searchBooks(
	query: string,
	settings: BookSearchCoverSettings,
): Promise<BookResult[]> {
	try {
		const results = await searchGoogleBooks(
			query,
			settings.googleApiKey,
			settings.preferredCountry,
		);
		if (results.length > 0) return results;
	} catch (e) {
		// No key at all is a config problem — surface it rather than silently
		// downgrading to Open Library. A key that's present but failed (quota,
		// network, transient) falls through to the keyless fallback below.
		if (!settings.googleApiKey) throw e;
		const fallback = await searchOpenLibrary(query);
		if (fallback.length > 0) return fallback;
		throw e;
	}
	// Google returned a clean empty result — try Open Library before giving up.
	return searchOpenLibrary(query);
}
