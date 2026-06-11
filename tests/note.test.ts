import { describe, expect, it } from "vitest";
import { App, TFile } from "obsidian";
import {
	bookNoteBasename,
	createTemplateFile,
	loadNoteTemplate,
	matchesBook,
	sanitizeFileName,
} from "../src/note";
import type { BookResult } from "../src/model";
import { DEFAULT_SETTINGS, type BookSearchCoverSettings } from "../src/settings";
import { DEFAULT_TEMPLATE } from "../src/template";

const BOOK: BookResult = {
	title: "If Anyone Builds It, Everyone Dies",
	authors: ["Eliezer Yudkowsky", "Nate Soares"],
	isbn13: "9780316595643",
	isbn10: "0316595640",
	source: "google",
};

describe("bookNoteBasename", () => {
	it("defaults to title - authors", () => {
		expect(bookNoteBasename(DEFAULT_SETTINGS, BOOK)).toBe(
			"If Anyone Builds It, Everyone Dies - Eliezer Yudkowsky, Nate Soares",
		);
	});

	it("drops the dangling separator when there are no authors", () => {
		expect(bookNoteBasename(DEFAULT_SETTINGS, { ...BOOK, authors: [] })).toBe(
			"If Anyone Builds It, Everyone Dies",
		);
	});
});

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

/** In-memory vault: path → markdown content. Returns the fake App + its files. */
function fakeVault(initial: Record<string, string>) {
	const files = new Map<string, TFile & { content: string }>();
	const put = (path: string, content: string) =>
		files.set(path, Object.assign(new TFile(), { content }));
	for (const [path, content] of Object.entries(initial)) put(path, content);
	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => files.get(p) ?? null,
			cachedRead: async (f: TFile & { content: string }) => f.content,
			create: async (p: string, c: string) => put(p, c),
			getFolderByPath: () => null,
			createFolder: async () => {},
		},
	} as unknown as App;
	return { app, files };
}

function settingsWith(
	templateFile: string,
	noteTemplate = "inline {{title}}",
): BookSearchCoverSettings {
	return { templateFile, noteTemplate } as BookSearchCoverSettings;
}

describe("loadNoteTemplate", () => {
	it("uses the inline template when no template file is configured", async () => {
		const { app } = fakeVault({});
		expect(await loadNoteTemplate(app, settingsWith(""))).toBe("inline {{title}}");
		expect(await loadNoteTemplate(app, settingsWith("  "))).toBe("inline {{title}}");
	});

	it("uses the built-in default when the inline template is blanked", async () => {
		const { app } = fakeVault({});
		expect(await loadNoteTemplate(app, settingsWith("", "  "))).toBe(DEFAULT_TEMPLATE);
	});

	it("a template file overrides the inline template", async () => {
		const { app } = fakeVault({ "Templates/Book.md": "# {{title}}" });
		expect(await loadNoteTemplate(app, settingsWith("Templates/Book.md"))).toBe("# {{title}}");
	});

	it("tolerates a missing .md extension", async () => {
		const { app } = fakeVault({ "Templates/Book.md": "# {{title}}" });
		expect(await loadNoteTemplate(app, settingsWith("Templates/Book"))).toBe("# {{title}}");
	});

	it("falls back to the inline template when the configured file is missing", async () => {
		const { app } = fakeVault({});
		expect(await loadNoteTemplate(app, settingsWith("Templates/Gone.md"))).toBe(
			"inline {{title}}",
		);
	});
});

describe("createTemplateFile", () => {
	it("creates the file with the given content, appending .md if needed", async () => {
		const { app, files } = fakeVault({});
		const path = await createTemplateFile(app, "Templates/Book template", "my template");
		expect(path).toBe("Templates/Book template.md");
		expect(files.get(path)?.content).toBe("my template");
	});

	it("never overwrites an existing file", async () => {
		const { app, files } = fakeVault({ "Templates/Book template.md": "mine" });
		const path = await createTemplateFile(app, "Templates/Book template.md", "new content");
		expect(path).toBe("Templates/Book template.md");
		expect(files.get(path)?.content).toBe("mine");
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
