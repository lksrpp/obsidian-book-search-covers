// Cover resolution + storage.
//
// Resolution chain (per the agreed design):
//   1. Apple iTunes Search (title+author) → ranking heuristic → hi-res artwork.
//   2. If Apple finds nothing usable → the search provider's own cover image.
//   3. Nothing → null (the note is created without a cover).
//
// Storage honors the `coverMode` setting: keep the remote URL, or download the
// image into the vault and return its local path for embedding.

import { App, normalizePath, requestUrl } from "obsidian";
import type { BookResult } from "./model";
import { appleCoverSearch, type BookForPick, pickBest } from "./providers/apple";
import type { BookSearchCoverSettings } from "./settings";

export interface ResolvedCover {
	/** Remote https URL of the chosen cover. */
	url: string;
	from: "apple" | "provider";
}

function toPick(book: BookResult): BookForPick {
	return {
		title: book.title,
		subtitle: book.subtitle,
		author: book.authors[0] ?? "",
		seriesNumber: book.seriesNumber,
	};
}

/** Find the best cover URL for a book, or null if no source has one. */
export async function resolveCoverUrl(
	book: BookForPick & { providerCoverUrl?: string },
	settings: BookSearchCoverSettings,
): Promise<ResolvedCover | null> {
	const candidates = await appleCoverSearch(
		book,
		settings.preferredCountry,
		settings.coverSize,
	);
	const picked = pickBest(book, candidates);
	if (picked.kind === "apple") {
		return { url: picked.candidate.artworkUrl, from: "apple" };
	}
	if (book.providerCoverUrl) {
		return { url: book.providerCoverUrl, from: "provider" };
	}
	return null;
}

/** Convenience wrapper that takes a full BookResult. */
export function resolveCoverForBook(
	book: BookResult,
	settings: BookSearchCoverSettings,
): Promise<ResolvedCover | null> {
	return resolveCoverUrl({ ...toPick(book), providerCoverUrl: book.providerCoverUrl }, settings);
}

/**
 * Download a cover into the vault and return its vault-relative path, or null
 * on failure. The file is named after `basename` (already filesystem-safe).
 */
export async function downloadCover(
	app: App,
	cover: ResolvedCover,
	basename: string,
	settings: BookSearchCoverSettings,
): Promise<string | null> {
	const ext = cover.url.match(/\.(png)(\?|$)/i) ? "png" : "jpg";
	const folder = normalizePath(settings.coverFolder);
	await ensureFolder(app, folder);
	const path = normalizePath(`${folder}/${basename}.${ext}`);

	try {
		const res = await requestUrl({ url: cover.url, throw: false });
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
