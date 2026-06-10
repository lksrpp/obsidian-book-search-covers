import { describe, expect, it } from "vitest";
import { htmlDescriptionToMarkdown, upscaleGoogleCover } from "../src/providers/google";

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
