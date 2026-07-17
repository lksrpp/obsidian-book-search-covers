// Shared HTTP helper: requestUrl with bounded retry on transient 5xx backend
// failures. Google Books has been returning intermittent 503 "backendFailed"
// (Google-side, not the request); Open Library can do the same on a bad day. A
// quick retry recovers most of these, since the failures are intermittent.

import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";

// Only transient server faults — never 4xx, which are permanent for the request
// (a bad key, a real quota, a malformed query), and never 429, where retrying
// only adds load.
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
// Backoff before attempts 2 and 3 (index by attempt-1). Kept short to stay
// within an interactive search's latency budget.
const BACKOFF_MS = [400, 900];
const LAST_BACKOFF_MS = BACKOFF_MS[BACKOFF_MS.length - 1] ?? 900;

const sleep = (ms: number): Promise<void> =>
	new Promise((r) => window.setTimeout(r, ms));

/**
 * requestUrl (with `throw: false`) plus bounded retry on 5xx and on network
 * failure. Returns the last response — including a final 5xx — so the caller can
 * still map the status to its own error. Re-throws only when every attempt
 * failed to connect at all.
 */
export async function requestWithRetry(params: RequestUrlParam): Promise<RequestUrlResponse> {
	let lastErr: unknown;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if (attempt > 0) {
			await sleep(BACKOFF_MS[attempt - 1] ?? LAST_BACKOFF_MS);
		}
		let res: RequestUrlResponse;
		try {
			res = await requestUrl({ ...params, throw: false });
		} catch (e) {
			lastErr = e; // network failure — retry
			continue;
		}
		// A definite (non-5xx) status is final; a 5xx is worth another try unless
		// this was the last attempt, in which case the caller handles it.
		if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS - 1) {
			return res;
		}
	}
	// Reached only when every attempt threw a network error.
	throw lastErr;
}
