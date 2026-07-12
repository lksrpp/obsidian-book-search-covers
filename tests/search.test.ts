import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the two providers so we can assert which one searchBooks routes to,
// without any network I/O. GoogleBooksError must stay a real (constructable)
// class — searchBooks both throws it and callers instanceof-check it.
vi.mock("../src/providers/google", () => ({
	GoogleBooksError: class GoogleBooksError extends Error {},
	searchGoogleBooks: vi.fn(),
}));
vi.mock("../src/providers/openlibrary", () => ({
	searchOpenLibrary: vi.fn(),
}));

import { searchBooks } from "../src/search";
import { GoogleBooksError, searchGoogleBooks } from "../src/providers/google";
import { searchOpenLibrary } from "../src/providers/openlibrary";
import { DEFAULT_SETTINGS, type BookSearchCoverSettings } from "../src/settings";

const mockGoogle = vi.mocked(searchGoogleBooks);
const mockOL = vi.mocked(searchOpenLibrary);

function settings(overrides: Partial<BookSearchCoverSettings>): BookSearchCoverSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("searchBooks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGoogle.mockResolvedValue([]);
		mockOL.mockResolvedValue([]);
	});

	it("routes an Open Library store to Open Library only", async () => {
		await searchBooks("dune", settings({ googleApiKey: "k" }), "openlibrary");
		expect(mockOL).toHaveBeenCalledOnce();
		expect(mockGoogle).not.toHaveBeenCalled();
	});

	it("routes a Google store to Google with the store's own country", async () => {
		await searchBooks("dune", settings({ googleApiKey: "k" }), "google:US");
		expect(mockGoogle).toHaveBeenCalledWith("dune", "k", "US", DEFAULT_SETTINGS.coverSize);
		expect(mockOL).not.toHaveBeenCalled();
	});

	it("does NOT fall back to Open Library when Google errors — the real error propagates", async () => {
		mockGoogle.mockRejectedValue(new GoogleBooksError("Google Books returned status 503."));
		await expect(
			searchBooks("dune", settings({ googleApiKey: "k" }), "google:DE"),
		).rejects.toThrow("503");
		expect(mockOL).not.toHaveBeenCalled();
	});

	it("throws for a Google store with no API key, without calling Google", async () => {
		await expect(
			searchBooks("dune", settings({ googleApiKey: "" }), "google:DE"),
		).rejects.toBeInstanceOf(GoogleBooksError);
		expect(mockGoogle).not.toHaveBeenCalled();
		expect(mockOL).not.toHaveBeenCalled();
	});

	it("defaults the store via effectiveStore: a Google default with no key routes to Open Library", async () => {
		await searchBooks("dune", settings({ store: "google:DE", googleApiKey: "" }));
		expect(mockOL).toHaveBeenCalledOnce();
		expect(mockGoogle).not.toHaveBeenCalled();
	});
});
