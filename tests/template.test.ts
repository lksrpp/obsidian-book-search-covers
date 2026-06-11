import { describe, expect, it } from "vitest";
import {
	buildVars,
	descriptionCallout,
	escapeYamlDouble,
	renderNote,
	renderTemplate,
} from "../src/template";
import type { BookResult } from "../src/model";

const BOOK: BookResult = {
	title: 'If Anyone Builds It, Everyone Dies',
	subtitle: "Why Superhuman AI Would Kill Us All",
	authors: ["Eliezer Yudkowsky", "Nate Soares"],
	publisher: "Hachette UK",
	publishedDate: "2025-09-16",
	pageCount: 223,
	isbn13: "9780316595643",
	categories: ["Non-Fiction", "AI"],
	language: "en",
	source: "google",
};

describe("escapeYamlDouble", () => {
	it("escapes backslashes, quotes and folds newlines", () => {
		expect(escapeYamlDouble('a "b" c\\d\ne')).toBe('a \\"b\\" c\\\\d e');
	});
});

describe("descriptionCallout", () => {
	it("wraps a single-line description in a collapsed callout", () => {
		expect(descriptionCallout("A short blurb.")).toBe(
			"> [!summary]- Description\n> A short blurb.",
		);
	});

	it("prefixes every line and keeps paragraph breaks inside the callout", () => {
		expect(descriptionCallout("First paragraph.\n\nSecond paragraph.")).toBe(
			"> [!summary]- Description\n> First paragraph.\n>\n> Second paragraph.",
		);
	});

	it("renders empty for a missing description", () => {
		expect(descriptionCallout("")).toBe("");
		expect(descriptionCallout("  \n ")).toBe("");
		expect(renderTemplate("{{descriptionCallout}}", buildVars(BOOK, ""))).toBe("");
	});

	it("is exposed as a template variable", () => {
		const out = renderTemplate(
			"{{descriptionCallout}}",
			buildVars({ ...BOOK, description: "Blurb." }, ""),
		);
		expect(out).toBe("> [!summary]- Description\n> Blurb.");
	});
});

describe("date variables", () => {
	it("renders {{date}} and {{datetime}} from the injected timestamp", () => {
		const now = new Date(2026, 5, 11, 9, 5, 3); // 2026-06-11 09:05:03 local
		const vars = buildVars(BOOK, "", now);
		expect(renderTemplate("{{date}}", vars)).toBe("2026-06-11");
		expect(renderTemplate("{{datetime}}", vars)).toBe("2026-06-11 09:05:03");
	});
});

describe("renderTemplate", () => {
	it("substitutes scalars raw and renders unknown vars empty", () => {
		const out = renderTemplate("{{title}} ({{year}}) {{nope}}", buildVars(BOOK, ""));
		expect(out).toBe("If Anyone Builds It, Everyone Dies (2025) ");
	});

	it("joins list vars inline", () => {
		const out = renderTemplate("{{authorsYamlLinks}}", buildVars(BOOK, ""));
		expect(out).toBe("[[Eliezer Yudkowsky]], [[Nate Soares]]");
	});
});

describe("renderNote list expansion", () => {
	const template = `---
title: "{{title}}"
author:
{{authorsYamlLinks}}
categories:
{{categoriesYamlList}}
---

# {{title}}
`;

	it("expands whole-line list vars into YAML block sequences", () => {
		const out = renderNote(template, buildVars(BOOK, ""));
		expect(out).toContain('author:\n  - "[[Eliezer Yudkowsky]]"\n  - "[[Nate Soares]]"\n');
		expect(out).toContain('categories:\n  - "Non-Fiction"\n  - "AI"\n');
	});

	it("keeps the placeholder's own indentation when present", () => {
		const indented = '---\nauthor:\n    {{authorsYamlLinks}}\n---\n';
		const out = renderNote(indented, buildVars(BOOK, ""));
		expect(out).toContain('author:\n    - "[[Eliezer Yudkowsky]]"\n');
	});

	it("removes the line entirely for an empty list", () => {
		const out = renderNote(template, buildVars({ ...BOOK, authors: [], categories: [] }, ""));
		expect(out).toContain("author:\ncategories:\n");
	});

	it("YAML-escapes list items", () => {
		const out = renderNote(
			template,
			buildVars({ ...BOOK, authors: ['A "Quoted" Name'] }, ""),
		);
		expect(out).toContain('  - "[[A \\"Quoted\\" Name]]"');
	});
});

describe("renderNote frontmatter/body split", () => {
	it("escapes quotes in frontmatter but leaves the body raw", () => {
		const template = '---\ntitle: "{{title}}"\n---\n\n# {{title}}\n';
		const book = { ...BOOK, title: 'Say "Hi"' };
		const out = renderNote(template, buildVars(book, ""));
		expect(out).toContain('title: "Say \\"Hi\\""');
		expect(out).toContain('# Say "Hi"');
	});

	it("handles CRLF templates", () => {
		const template = '---\r\ntitle: "{{title}}"\r\nauthor:\r\n{{authorsYamlLinks}}\r\n---\r\nbody';
		const out = renderNote(template, buildVars(BOOK, ""));
		expect(out).toContain('  - "[[Eliezer Yudkowsky]]"');
		expect(out).toContain('title: "If Anyone Builds It, Everyone Dies"');
	});

	it("treats a template without frontmatter as all-body", () => {
		const out = renderNote("# {{title}}", buildVars({ ...BOOK, title: '"Q"' }, ""));
		expect(out).toBe('# "Q"');
	});
});
