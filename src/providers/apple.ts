// Apple iTunes Search — cover candidate fetch + auto-pick heuristic.
//
// Ported from the Notable app's proven `app/lib/covers/apple.ts`. Apple Search
// returns a RANKED LIST, not one book; taking #1 blindly is wrong ~18% of the
// time (summaries/workbooks/companions squat at #1). The heuristic picks the
// best non-summary match and deliberately under-picks — returning 'none' over a
// confident wrong pick — because here a wrong cover is worse than no Apple cover
// (we fall back to the search provider's own image).
//
// The scoring functions are PURE (no I/O). `appleCoverSearch` does the HTTP via
// Obsidian's requestUrl (CORS-safe, works on mobile).

import { requestUrl } from "obsidian";

/** A normalized candidate parsed from one iTunes Search `results[]` entry. */
export interface AppleCandidate {
	trackName: string;
	artistName: string;
	/** ISO release date, when Apple provides one. */
	releaseDate?: string;
	/** Hi-res artwork URL derived from Apple's thumbnail URL. */
	artworkUrl: string;
}

/** The book fields the heuristic needs to rank Apple candidates. */
export interface BookForPick {
	title: string;
	subtitle?: string;
	author: string;
	seriesNumber?: string;
}

export type PickResult =
	| { kind: "apple"; candidate: AppleCandidate }
	| { kind: "none" };

// ─── Tunable thresholds (the heuristic's confidence gates) ──────────────────

const MIN_OVERLAP = 0.5;
const TIE_BAND = 0.1;
const AUTHOR_MATCH_MIN = 0.5;
const MIN_TOKEN_LEN = 2;

// Summary/companion squatters: a `trackName` matching this is dropped outright.
// German variants included. Word-boundaried so "summary" can't fire inside a
// real title.
const SUMMARY_RE =
	/\b(summary|zusammenfassung|inhaltsangabe|workbook|study guide|leitfaden|begleitbuch|conversation starters|key takeaways|companion to|sidekick)\b/i;

// ─── Search-term construction ───────────────────────────────────────────────

/** The two Apple search terms to try, in order: `title author`, then `title`. */
export function searchTerms(book: BookForPick): [primary: string, fallback: string] {
	const title = book.title.trim();
	const author = book.author.trim();
	const primary = author ? `${title} ${author}` : title;
	return [primary, title];
}

// ─── Token normalization + overlap ──────────────────────────────────────────

export function normalizeTokens(s: string): Set<string> {
	const cleaned = s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // combining diacritical marks
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, " "); // punctuation → space
	const out = new Set<string>();
	for (const tok of cleaned.split(/\s+/)) {
		if (tok.length > MIN_TOKEN_LEN) out.add(tok);
	}
	return out;
}

/** Jaccard index of two token sets. Two empty sets → 0 (not a match). */
export function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const t of a) if (b.has(t)) inter++;
	const union = a.size + b.size - inter;
	return union === 0 ? 0 : inter / union;
}

export function isSummaryShaped(trackName: string): boolean {
	return SUMMARY_RE.test(trackName);
}

function bookTitleText(book: BookForPick): string {
	return book.subtitle ? `${book.title} ${book.subtitle}` : book.title;
}

function authorMatches(book: BookForPick, c: AppleCandidate): boolean {
	return (
		jaccard(normalizeTokens(book.author), normalizeTokens(c.artistName)) >=
		AUTHOR_MATCH_MIN
	);
}

/**
 * Does the candidate title carry this series number as a standalone number?
 * Lookarounds prevent `5` matching inside `15`/`50`. The decimal point is
 * escaped so a fractional volume (1.5) matches literally.
 *
 * NOTE: regex lookbehind needs iOS 16.4+. Acceptable for a books plugin; the
 * obsidianmd lint rule `regex-lookbehind` will flag it as a reminder.
 */
function titleHasSeriesNumber(c: AppleCandidate, n: number): boolean {
	const numStr = String(n).replace(".", "\\.");
	return new RegExp(`(?<!\\d)${numStr}(?!\\d)`).test(c.trackName);
}

function parseSeriesNumber(raw: string | undefined): number | null {
	if (raw == null) return null;
	const n = Number.parseFloat(raw);
	return Number.isFinite(n) ? n : null;
}

interface Scored {
	candidate: AppleCandidate;
	overlap: number;
	authorMatch: boolean;
	seriesMatch: boolean;
}

/** Stable "same book" key: normalized title + artist token sets. */
function editionKey(c: AppleCandidate): string {
	const norm = (s: string) => [...normalizeTokens(s)].sort().join(" ");
	return `${norm(c.trackName)}|${norm(c.artistName)}`;
}

/**
 * Pick the best Apple candidate, or 'none'. See the file header for the bias
 * toward under-picking. The ladder: drop summaries → score by title overlap →
 * bail below MIN_OVERLAP → within a TIE_BAND contention set, break ties on the
 * series number first, then author; otherwise bail to 'none'.
 */
export function pickBest(book: BookForPick, candidates: AppleCandidate[]): PickResult {
	// Apple's trackName may or may not include the subtitle, while the search
	// provider (Google) gives title + subtitle separately. Score each candidate
	// against BOTH the bare title and title+subtitle and take the higher overlap,
	// so a subtitle present on only one side doesn't sink an otherwise exact match.
	const titleOnlyTokens = normalizeTokens(book.title);
	const titleFullTokens = normalizeTokens(bookTitleText(book));
	const seriesNum = parseSeriesNumber(book.seriesNumber);

	const scored: Scored[] = candidates
		.filter((c) => !isSummaryShaped(c.trackName))
		.map((c) => {
			const candTokens = normalizeTokens(c.trackName);
			return {
				candidate: c,
				overlap: Math.max(
					jaccard(titleOnlyTokens, candTokens),
					jaccard(titleFullTokens, candTokens),
				),
				authorMatch: authorMatches(book, c),
				seriesMatch: seriesNum != null && titleHasSeriesNumber(c, seriesNum),
			};
		});

	if (scored.length === 0) return { kind: "none" };

	scored.sort((a, b) => b.overlap - a.overlap);

	// Collapse duplicate editions. Apple lists the same book several times
	// (paperback/hardcover/regional store), all with identical title + artist.
	// Those are the same book, so any cover is correct — dedupe before judging
	// "contention", otherwise three identical editions look like an unresolvable
	// tie and the under-pick bias would (wrongly) bail to 'none'.
	const distinct: Scored[] = [];
	const seen = new Set<string>();
	for (const s of scored) {
		const key = editionKey(s.candidate);
		if (seen.has(key)) continue;
		seen.add(key);
		distinct.push(s);
	}

	const best = distinct[0];
	if (!best || best.overlap < MIN_OVERLAP) return { kind: "none" };

	const contention = distinct.filter((s) => best.overlap - s.overlap < TIE_BAND);
	if (contention.length === 1 && contention[0]) {
		return { kind: "apple", candidate: contention[0].candidate };
	}

	const seriesMatched = contention.filter((s) => s.seriesMatch);
	if (seriesMatched.length === 1 && seriesMatched[0]) {
		return { kind: "apple", candidate: seriesMatched[0].candidate };
	}
	if (seriesMatched.length === 0) {
		const authorMatched = contention.filter((s) => s.authorMatch);
		if (authorMatched.length === 1 && authorMatched[0]) {
			return { kind: "apple", candidate: authorMatched[0].candidate };
		}
	}
	return { kind: "none" };
}

// ─── iTunes response parsing ────────────────────────────────────────────────

/** Apple artwork thumbnail URL → hi-res at the requested square size. */
export function resizeArtworkUrl(thumbUrl: string, size: number): string {
	return thumbUrl.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.$1`);
}

/** Opportunistically pull an ISBN-13 Apple sometimes embeds in the art filename. */
export function isbnFromArtworkUrl(url: string): string | undefined {
	const m = url.match(/\/(\d{13})\.(?:jpg|png)\//);
	return m ? m[1] : undefined;
}

interface ItunesResult {
	trackName?: unknown;
	artistName?: unknown;
	artworkUrl100?: unknown;
	artworkUrl60?: unknown;
	releaseDate?: unknown;
}

export function parseAppleResults(body: unknown, size: number): AppleCandidate[] {
	const results =
		body && typeof body === "object" && Array.isArray((body as { results?: unknown }).results)
			? (body as { results: ItunesResult[] }).results
			: [];
	const out: AppleCandidate[] = [];
	for (const r of results) {
		const trackName = typeof r.trackName === "string" ? r.trackName : null;
		const artistName = typeof r.artistName === "string" ? r.artistName : "";
		const thumb =
			typeof r.artworkUrl100 === "string"
				? r.artworkUrl100
				: typeof r.artworkUrl60 === "string"
					? r.artworkUrl60
					: null;
		if (!trackName || !thumb) continue;
		out.push({
			trackName,
			artistName,
			releaseDate: typeof r.releaseDate === "string" ? r.releaseDate : undefined,
			artworkUrl: resizeArtworkUrl(thumb, size),
		});
	}
	return out;
}

// ─── I/O ────────────────────────────────────────────────────────────────────

const ENDPOINT = "https://itunes.apple.com/search";
const LIMIT = 5;

/**
 * Search Apple for cover candidates for a book. Tries `title author`, then
 * `title` alone when the combined term returns nothing. Returns up to 5
 * candidates with artwork sized to `size`. Returns [] on any failure — covers
 * are a best-effort enhancement, never a hard error.
 */
export async function appleCoverSearch(
	book: BookForPick,
	country: string,
	size: number,
): Promise<AppleCandidate[]> {
	const [primary, fallback] = searchTerms(book);
	const first = await searchOnce(primary, country, size);
	if (first.length > 0 || fallback === primary) return first;
	return searchOnce(fallback, country, size);
}

async function searchOnce(
	term: string,
	country: string,
	size: number,
): Promise<AppleCandidate[]> {
	const url = new URL(ENDPOINT);
	url.searchParams.set("term", term);
	url.searchParams.set("entity", "ebook");
	url.searchParams.set("country", country);
	url.searchParams.set("limit", String(LIMIT));
	try {
		const res = await requestUrl({ url: url.toString(), throw: false });
		if (res.status !== 200) return [];
		return parseAppleResults(res.json, size);
	} catch {
		return [];
	}
}
