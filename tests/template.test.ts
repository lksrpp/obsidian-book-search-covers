import { describe, expect, it } from "vitest";
import {
	buildVars,
	descriptionCallout,
	escapeYamlDouble,
	renderNote,
	renderTemplate,
	replaceCoverInBody,
	unwrapWikiLink,
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

	it("accepts a custom callout title as argument", () => {
		const vars = buildVars({ ...BOOK, description: "Blurb." }, "");
		expect(renderTemplate("{{descriptionCallout:Inhalt}}", vars)).toBe(
			"> [!summary]- Inhalt\n> Blurb.",
		);
		expect(renderTemplate("{{descriptionCallout: Mit Leerzeichen }}", vars)).toBe(
			"> [!summary]- Mit Leerzeichen\n> Blurb.",
		);
	});

	it("renders empty for a custom title without description", () => {
		expect(renderTemplate("{{descriptionCallout:Inhalt}}", buildVars(BOOK, ""))).toBe("");
	});

	it("leaves arguments on other variables literal", () => {
		expect(renderTemplate("{{title:nope}}", buildVars(BOOK, ""))).toBe("{{title:nope}}");
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

describe("renderNote cover paths", () => {
	const LOCAL = "Books/cover/Mein Weltbild - Albert Einstein (1934).jpg";

	it("keeps a vault path plain in frontmatter, wikilinks and plain text", () => {
		const template =
			'---\ncover: "{{cover}}"\nlink: "[[{{cover}}]]"\n---\n![[{{cover}}|250]]\n{{cover}}\n';
		const out = renderNote(template, buildVars(BOOK, LOCAL));
		expect(out).toContain(`cover: "${LOCAL}"`);
		expect(out).toContain(`link: "[[${LOCAL}]]"`);
		expect(out).toContain(`![[${LOCAL}|250]]`);
		expect(out).not.toContain("%20");
	});

	it("encodes a vault path as a markdown link target", () => {
		const out = renderNote("![cover|250]({{cover}})", buildVars(BOOK, LOCAL));
		expect(out).toBe(
			"![cover|250](Books/cover/Mein%20Weltbild%20-%20Albert%20Einstein%20%281934%29.jpg)",
		);
	});

	it("leaves an angle-bracketed link target plain", () => {
		const out = renderNote("![cover](<{{cover}}>)", buildVars(BOOK, LOCAL));
		expect(out).toBe(`![cover](<${LOCAL}>)`);
	});

	it("never re-encodes a remote URL", () => {
		const url = "https://books.google.com/books/content?id=x&fife=w800";
		const out = renderNote(`---\ncover: "{{cover}}"\n---\n![]({{cover}})`, buildVars(BOOK, url));
		expect(out).toContain(`cover: "${url}"`);
		expect(out).toContain(`![](${url})`);
	});
});

describe("replaceCoverInBody", () => {
	const OLD = "covers/Mein Weltbild - Albert Einstein.jpg";
	const OLD_ENC = "covers/Mein%20Weltbild%20-%20Albert%20Einstein.jpg";
	const NEW = "covers/Mein Weltbild (2).jpg";
	const NEW_ENC = "covers/Mein%20Weltbild%20%282%29.jpg";
	const URL = "https://is1-ssl.mzstatic.com/image/thumb/x/800x800bb.jpg";
	const note = (fm: string, body: string) => `---\ncover: "${fm}"\n---\n${body}`;

	it("replaces a pre-1.1.4 encoded path and encodes the new one in a link target", () => {
		const r = replaceCoverInBody(note(OLD_ENC, `![cover|250](${OLD_ENC})\n`), OLD_ENC, NEW);
		expect(r.count).toBe(1);
		expect(r.content).toContain(`![cover|250](${NEW_ENC})`);
	});

	it("matches the encoded body form when the property holds the plain path", () => {
		const r = replaceCoverInBody(`![cover|250](${OLD_ENC})`, OLD, NEW);
		expect(r).toEqual({ content: `![cover|250](${NEW_ENC})`, count: 1 });
	});

	it("matches #?() encoded by hand, not only what encodeURI covers", () => {
		const old = "covers/What? (Vol. #1).jpg";
		const r = replaceCoverInBody("![](covers/What%3F%20%28Vol.%20%231%29.jpg)", old, NEW);
		expect(r).toEqual({ content: `![](${NEW_ENC})`, count: 1 });
	});

	it("keeps the new path plain inside a wikilink embed", () => {
		const r = replaceCoverInBody(`![[${OLD}|250]]`, OLD, NEW);
		expect(r).toEqual({ content: `![[${NEW}|250]]`, count: 1 });
	});

	it("keeps the new path plain inside an angle-bracket link target", () => {
		const r = replaceCoverInBody(`![cover](<${OLD}>)`, OLD, NEW);
		expect(r).toEqual({ content: `![cover](<${NEW}>)`, count: 1 });
	});

	it("matches on the inner path of a wikilink property value", () => {
		const r = replaceCoverInBody(`![](${OLD_ENC}) and ![[${OLD}]]`, `![[${OLD}]]`, NEW);
		expect(r.content).toBe(`![](${NEW_ENC}) and ![[${NEW}]]`);
		expect(r.count).toBe(2);
	});

	it("replaces a remote URL with a vault path", () => {
		const r = replaceCoverInBody(`![cover|250](${URL})\nSource: ${URL}`, URL, NEW);
		expect(r.content).toBe(`![cover|250](${NEW_ENC})\nSource: ${NEW}`);
		expect(r.count).toBe(2);
	});

	it("replaces a vault path with a remote URL, unencoded", () => {
		const r = replaceCoverInBody(`![cover|250](${OLD_ENC})\nCover: ${OLD}`, OLD, URL);
		expect(r).toEqual({ content: `![cover|250](${URL})\nCover: ${URL}`, count: 2 });
	});

	// `![[https://…]]` doesn't render, so the embed keeps showing the old cover.
	it("leaves a wikilink embed alone when the new cover is a URL", () => {
		const content = `![[${OLD}|250]]\n![](${OLD_ENC})`;
		const r = replaceCoverInBody(content, OLD, URL);
		expect(r).toEqual({ content: `![[${OLD}|250]]\n![](${URL})`, count: 1 });
		expect(replaceCoverInBody(`![[${OLD}]]`, OLD, URL)).toEqual({
			content: `![[${OLD}]]`,
			count: 0,
		});
	});

	it("only replaces whole values, not part of a longer path or URL", () => {
		const old = "covers/Dune.jpg";
		const content = [
			"![](archive/covers/Dune.jpg)",
			"![](covers/Dune.jpg.bak)",
			"![](covers/Dune.jpg2)",
			`![](${URL}?w=2)`,
		].join("\n");
		expect(replaceCoverInBody(content, old, NEW).count).toBe(0);
		expect(replaceCoverInBody(content, URL, NEW).count).toBe(0);
	});

	it("still replaces a value at the end of a sentence or line", () => {
		const r = replaceCoverInBody(`Cover: covers/Dune.jpg.\nAlt: covers/Dune.jpg`, "covers/Dune.jpg", NEW);
		expect(r).toEqual({ content: `Cover: ${NEW}.\nAlt: ${NEW}`, count: 2 });
	});

	it("never touches the frontmatter block", () => {
		const content = note(OLD, `![cover|250](${OLD_ENC})`);
		const r = replaceCoverInBody(content, OLD, NEW);
		expect(r.content.startsWith(`---\ncover: "${OLD}"\n---\n`)).toBe(true);
		expect(r.count).toBe(1);
	});

	it("finds the frontmatter block with CRLF line endings", () => {
		const content = `---\r\ncover: "${URL}"\r\n---\r\n![](${URL})\r\n`;
		const r = replaceCoverInBody(content, URL, NEW);
		expect(r.content).toBe(`---\r\ncover: "${URL}"\r\n---\r\n![](${NEW_ENC})\r\n`);
	});

	it("leaves the content unchanged without an old value", () => {
		const content = note("", `![cover|250](${OLD_ENC})`);
		expect(replaceCoverInBody(content, "", NEW)).toEqual({ content, count: 0 });
		expect(replaceCoverInBody(content, "   ", NEW)).toEqual({ content, count: 0 });
	});

	it("leaves the content unchanged when the old value is not in the body", () => {
		const content = note(OLD, "# Just a title\n");
		expect(replaceCoverInBody(content, OLD, NEW)).toEqual({ content, count: 0 });
	});
});

describe("unwrapWikiLink", () => {
	it("splits off a wikilink or embed wrapper, keeping an alias", () => {
		expect(unwrapWikiLink("[[covers/a.jpg]]")).toEqual({
			prefix: "[[",
			path: "covers/a.jpg",
			suffix: "]]",
		});
		expect(unwrapWikiLink("![[covers/a.jpg|250]]")).toEqual({
			prefix: "![[",
			path: "covers/a.jpg",
			suffix: "|250]]",
		});
	});

	it("passes plain values through", () => {
		expect(unwrapWikiLink("covers/a.jpg")).toEqual({ prefix: "", path: "covers/a.jpg", suffix: "" });
	});
});
