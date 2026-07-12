// Search orchestration: the chosen store IS the provider — no fallback. A
// Google store errors out with the real error (e.g. Google's 503s); an Open
// Library store just searches Open Library.

import type { BookResult } from "./model";
import { GoogleBooksError, searchGoogleBooks } from "./providers/google";
import { searchOpenLibrary } from "./providers/openlibrary";
import {
	effectiveStore,
	resolveStore,
	type BookSearchCoverSettings,
	type StoreId,
} from "./settings";

export async function searchBooks(
	query: string,
	settings: BookSearchCoverSettings,
	store: StoreId = effectiveStore(settings),
): Promise<BookResult[]> {
	const resolved = resolveStore(store);
	if (resolved.provider === "openlibrary") {
		return searchOpenLibrary(query);
	}
	if (!settings.googleApiKey) {
		throw new GoogleBooksError("No Google Books API key set (see plugin settings).");
	}
	return searchGoogleBooks(query, settings.googleApiKey, resolved.country, settings.coverSize);
}
