// Cover handling.
//
// At note-creation time the cover is simply the search provider's own image
// (for Google, upscaled to `coverSize` via the fife parameter — see
// `upscaleGoogleCover`). No Apple call happens during creation.
//
// When that image is missing or disappointing, the "Fetch or replace cover"
// command collects candidates from BOTH Google and Apple, clearly labeled, and
// lets the user pick (see ui/cover-picker.ts). The old Apple auto-pick
// heuristic (`pickBest` in providers/apple.ts) is parked — kept for tests and
// possible future ranking of the picker list.
//
// Storage honors the `coverMode` setting: keep the remote URL, or download the
// image into the vault and return its local path for embedding.

import { App, normalizePath, requestUrl } from "obsidian";
import { appleCoverSearch } from "./providers/apple";
import { searchGoogleBooks } from "./providers/google";
import type { BookSearchCoverSettings } from "./settings";

export interface CoverCandidate {
	/** Remote https URL of the cover image. */
	url: string;
	/** "custom" = a URL the user pasted into the picker themselves. */
	source: "google" | "apple" | "custom";
	/** Caption lines shown under the image in the picker. */
	title: string;
	author?: string;
	year?: string;
}

/**
 * Collect cover candidates for a book from Google and Apple, in parallel.
 * Each source failing (no key, offline, …) just contributes nothing — the
 * picker shows whatever was found.
 */
export async function collectCoverCandidates(
	book: { title: string; author: string },
	settings: BookSearchCoverSettings,
): Promise<CoverCandidate[]> {
	const [google, apple] = await Promise.all([
		googleCandidates(book, settings),
		appleCandidates(book, settings),
	]);
	return dedupeByUrl([...google, ...apple]);
}

async function googleCandidates(
	book: { title: string; author: string },
	settings: BookSearchCoverSettings,
): Promise<CoverCandidate[]> {
	const query = book.author ? `${book.title} ${book.author}` : book.title;
	try {
		const results = await searchGoogleBooks(
			query,
			settings.googleApiKey,
			settings.preferredCountry,
			settings.coverSize,
		);
		return results
			.filter((r) => r.providerCoverUrl)
			.map((r) => ({
				url: r.providerCoverUrl as string,
				source: "google" as const,
				title: r.title,
				author: r.authors[0],
				year: yearFrom(r.publishedDate),
			}));
	} catch {
		return [];
	}
}

async function appleCandidates(
	book: { title: string; author: string },
	settings: BookSearchCoverSettings,
): Promise<CoverCandidate[]> {
	const candidates = await appleCoverSearch(
		{ title: book.title, author: book.author },
		settings.preferredCountry,
		settings.coverSize,
	);
	return candidates.map((c) => ({
		url: c.artworkUrl,
		source: "apple" as const,
		title: c.trackName,
		author: c.artistName || undefined,
		year: yearFrom(c.releaseDate),
	}));
}

function yearFrom(date: string | undefined): string | undefined {
	return date?.match(/\d{4}/)?.[0];
}

function dedupeByUrl(candidates: CoverCandidate[]): CoverCandidate[] {
	const seen = new Set<string>();
	return candidates.filter((c) => {
		if (seen.has(c.url)) return false;
		seen.add(c.url);
		return true;
	});
}

/**
 * Percent-encode a vault path so it is a valid `![](…)` markdown link target.
 * encodeURI handles spaces/umlauts but leaves `#?()` alone — those break
 * markdown links (or Obsidian's subpath parsing), so encode them by hand.
 */
export function encodeCoverPath(path: string): string {
	return encodeURI(path).replace(
		/[#?()]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/**
 * Download a cover into the vault and return its vault-relative path, or null
 * on failure. The file is named after `basename` (already filesystem-safe).
 */
export async function downloadCover(
	app: App,
	url: string,
	basename: string,
	settings: BookSearchCoverSettings,
): Promise<string | null> {
	const ext = url.match(/\.(png)(\?|$)/i) ? "png" : "jpg";
	const folder = normalizePath(settings.coverFolder);
	await ensureFolder(app, folder);
	const path = normalizePath(`${folder}/${basename}.${ext}`);

	try {
		const res = await requestUrl({ url, throw: false });
		if (res.status !== 200) return null;
		const existing = app.vault.getFileByPath(path);
		if (existing) {
			await app.vault.modifyBinary(existing, res.arrayBuffer);
		} else {
			await app.vault.createBinary(path, res.arrayBuffer);
		}
		return path;
	} catch {
		return null;
	}
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	if (folder === "" || folder === "/") return;
	if (app.vault.getFolderByPath(folder)) return;
	await app.vault.createFolder(folder).catch(() => {
		// Folder may have been created concurrently; ignore.
	});
}
