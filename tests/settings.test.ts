import { describe, expect, it } from "vitest";
import {
	allStores,
	coverCountryFor,
	DEFAULT_SETTINGS,
	effectiveStore,
	migrateStoreSetting,
	resolveStore,
	switcherStoreList,
	type BookSearchCoverSettings,
	type StoreId,
} from "../src/settings";

function settings(overrides: Partial<BookSearchCoverSettings>): BookSearchCoverSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

/** A pre-store data.json shape, plus the `store` the migration may add. */
type LegacyStored = Partial<BookSearchCoverSettings> & { preferredCountry?: string };

describe("resolveStore", () => {
	it("resolves Open Library with no country", () => {
		const s = resolveStore("openlibrary");
		expect(s.provider).toBe("openlibrary");
		expect(s.country).toBeUndefined();
	});

	it("resolves a known Google store to its country and a friendly label", () => {
		const s = resolveStore("google:DE");
		expect(s.provider).toBe("google");
		expect(s.country).toBe("DE");
		expect(s.label).toContain("Germany");
	});

	it("still resolves an unknown Google country code", () => {
		const s = resolveStore("google:ZZ");
		expect(s.provider).toBe("google");
		expect(s.country).toBe("ZZ");
		expect(s.label).toBe("Google — ZZ");
	});
});

describe("coverCountryFor", () => {
	it("uses the Google store's own country", () => {
		expect(coverCountryFor("google:US")).toBe("US");
	});

	it("falls back to US for Open Library (which has no region)", () => {
		expect(coverCountryFor("openlibrary")).toBe("US");
	});
});

describe("effectiveStore", () => {
	it("keeps a Google store when an API key is set", () => {
		expect(effectiveStore(settings({ store: "google:DE", googleApiKey: "k" }))).toBe("google:DE");
	});

	it("downgrades a Google store to Open Library when no key is set", () => {
		expect(effectiveStore(settings({ store: "google:DE", googleApiKey: "" }))).toBe("openlibrary");
	});

	it("leaves an Open Library store untouched regardless of key", () => {
		expect(effectiveStore(settings({ store: "openlibrary", googleApiKey: "" }))).toBe("openlibrary");
	});
});

describe("switcherStoreList", () => {
	it("returns every store when the curated list is empty (the default)", () => {
		expect(switcherStoreList(settings({ switcherStores: [] }))).toEqual(allStores());
	});

	it("returns only the curated stores, in canonical order", () => {
		const list = switcherStoreList(settings({ switcherStores: ["google:US", "openlibrary"] }));
		expect(list.map((s) => s.id)).toEqual(["openlibrary", "google:US"]);
	});
});

describe("migrateStoreSetting", () => {
	it("is a no-op for null", () => {
		expect(() => migrateStoreSetting(null)).not.toThrow();
	});

	it("leaves an already-migrated object untouched", () => {
		const stored: LegacyStored = { store: "openlibrary", preferredCountry: "DE" };
		migrateStoreSetting(stored);
		expect(stored.store).toBe("openlibrary");
	});

	it("derives a Google store from the legacy country when a key is present, dropping the old key", () => {
		const stored: LegacyStored = { googleApiKey: "k", preferredCountry: "AT" };
		migrateStoreSetting(stored);
		expect(stored.store).toBe<StoreId>("google:AT");
		expect(stored.preferredCountry).toBeUndefined();
	});

	it("defaults the legacy country to DE when it is absent", () => {
		const stored: LegacyStored = { googleApiKey: "k" };
		migrateStoreSetting(stored);
		expect(stored.store).toBe<StoreId>("google:DE");
	});

	it("migrates to Open Library when no API key was set", () => {
		const stored: LegacyStored = { googleApiKey: "", preferredCountry: "DE" };
		migrateStoreSetting(stored);
		expect(stored.store).toBe<StoreId>("openlibrary");
		expect(stored.preferredCountry).toBeUndefined();
	});
});
