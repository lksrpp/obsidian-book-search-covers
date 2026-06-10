import { describe, expect, it } from "vitest";
import { matchesBook, sanitizeFileName } from "../src/note";
import type { BookResult } from "../src/model";

const BOOK: BookResult = {
	title: "If Anyone Builds It, Everyone Dies",
	authors: ["Eliezer Yudkowsky", "Nate Soares"],
	isbn13: "9780316595643",
	isbn10: "0316595640",
	source: "google",
};

describe("matchesBook — ISBN signal", () => {
	it("matches on isbn with dashes and on isbn13/isbn10 properties", () => {
		expect(matchesBook(BOOK, { isbn: "978-0-316-59564-3" })).toBe(true);
		expect(matchesBook(BOOK, { isbn13: "9780316595643" })).toBe(true);
		expect(matchesBook(BOOK, { isbn10: "0316595640" })).toBe(true);
	});

	it("matches a YAML-number isbn", () => {
		expect(matchesBook(BOOK, { isbn: 9780316595643 })).toBe(true);
	});

	it("ignores a different isbn (different edition falls through to title)", () => {
		expect(matchesBook(BOOK, { isbn: "9999999999999", title: "Other" })).toBe(false);
	});
});

describe("matchesBook — title + author signal", () => {
	const title = "if anyone builds it, everyone dies"; // case-insensitive

	it("matches when an author overlaps, across frontmatter shapes", () => {
		expect(matchesBook(BOOK, { title, author: ["[[Nate Soares]]"] })).toBe(true);
		expect(matchesBook(BOOK, { title, author: "Soares, Nate" })).toBe(true);
		expect(matchesBook(BOOK, { title, authors: ["", "[[Eliezer Yudkowsky]]"] })).toBe(true);
	});

	it("rejects a same-title note by a different author", () => {
		expect(matchesBook(BOOK, { title, author: "[[Jane Doe]]" })).toBe(false);
	});

	it("still warns when the existing note has no usable author info", () => {
		expect(matchesBook(BOOK, { title })).toBe(true);
		expect(matchesBook(BOOK, { title, author: [""] })).toBe(true);
	});

	it("rejects a different title outright", () => {
		expect(matchesBook(BOOK, { title: "Something Else", author: "[[Nate Soares]]" })).toBe(
			false,
		);
	});
});

describe("sanitizeFileName", () => {
	it("turns a subtitle colon into a dash and strips unsafe characters", () => {
		expect(sanitizeFileName("Dune: Part [Two] #1?")).toBe("Dune - Part Two 1");
	});

	it("keeps commas, apostrophes and accents", () => {
		expect(sanitizeFileName("L'Étranger, c'est moi")).toBe("L'Étranger, c'est moi");
	});

	it("falls back to Untitled", () => {
		expect(sanitizeFileName("???")).toBe("Untitled");
	});
});
