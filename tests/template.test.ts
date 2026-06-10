import { describe, expect, it } from "vitest";
import {
	buildVars,
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
