import { describe, expect, it } from "vitest";
import { htmlDescriptionToMarkdown, upscaleGoogleCover } from "../src/providers/google";
import { asIsbnQuery } from "../src/model";

describe("asIsbnQuery", () => {
	it("accepts 13- and 10-digit ISBNs with dashes or spaces", () => {
		expect(asIsbnQuery("9780316595643")).toBe("9780316595643");
		expect(asIsbnQuery("978-0-316-59564-3")).toBe("9780316595643");
		expect(asIsbnQuery("978 0316 595 643")).toBe("9780316595643");
		expect(asIsbnQuery("0316595640")).toBe("0316595640");
		expect(asIsbnQuery("0-8044-2957-x")).toBe("080442957X");
	});

	it("rejects everything else", () => {
		expect(asIsbnQuery("dune frank herbert")).toBeNull();
		expect(asIsbnQuery("12345")).toBeNull();
		expect(asIsbnQuery("97803165956430")).toBeNull(); // 14 digits
		expect(asIsbnQuery("dune 9780316595643")).toBeNull(); // mixed text
	});
});

describe("htmlDescriptionToMarkdown", () => {
	it("converts <p> blocks to paragraphs and strips bold/italic", () => {
		const html =
			"<p><b>One of the most influential books.</b></p><p>'A masterpiece' <i>Financial Times</i></p>";
		expect(htmlDescriptionToMarkdown(html)).toBe(
			"One of the most influential books.\n\n'A masterpiece' Financial Times",
		);
	});

	it("treats <br><br> runs as paragraph breaks and a lone <br> as a line break", () => {
		const html = "<b>#1 BESTSELLER</b><br><br>A lone astronaut.<br>A desperate mission.";
		expect(htmlDescriptionToMarkdown(html)).toBe(
			"#1 BESTSELLER\n\nA lone astronaut.\nA desperate mission.",
		);
	});

	it("survives the malformed nesting observed in real responses", () => {
		const html = "<b>'Great book' <i>Financial Times<br><br></i></b>Next paragraph.";
		expect(htmlDescriptionToMarkdown(html)).toBe("'Great book' Financial Times\n\nNext paragraph.");
	});

	it("passes plain text through unchanged (publisher supplied no markup)", () => {
		const plain = "Die Verwandlung ist eine Erzählung von Franz Kafka.";
		expect(htmlDescriptionToMarkdown(plain)).toBe(plain);
	});

	it("collapses 3+ newlines and handles <br/> variants", () => {
		expect(htmlDescriptionToMarkdown("a</p><br/><br />b")).toBe("a\n\nb");
	});
});

describe("upscaleGoogleCover", () => {
	it("forces https, drops the curl, normalizes zoom, appends fife width", () => {
		const url =
			"http://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=5&edge=curl&source=gbs_api";
		expect(upscaleGoogleCover(url, 800)).toBe(
			"https://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1&source=gbs_api&fife=w800",
		);
	});
});
