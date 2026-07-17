import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";

// requestWithRetry imports requestUrl from "obsidian" (the vitest alias stub
// throws by default); replace it with a mock we can script per-test.
vi.mock("obsidian", () => ({ requestUrl: vi.fn() }));

import { requestUrl } from "obsidian";
import { requestWithRetry } from "../src/providers/http";

const mockRequest = vi.mocked(requestUrl);

/** Minimal response — the helper only ever inspects `.status`. */
function resp(status: number): RequestUrlResponse {
	return { status } as RequestUrlResponse;
}

describe("requestWithRetry", () => {
	beforeEach(() => {
		// The helper sleeps via window.setTimeout; in the node test env point
		// window at globalThis and drive its timers with fake timers.
		vi.stubGlobal("window", globalThis);
		vi.useFakeTimers();
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("returns immediately on a 200 without retrying", async () => {
		mockRequest.mockResolvedValue(resp(200));
		const res = await requestWithRetry({ url: "u" });
		expect(res.status).toBe(200);
		expect(mockRequest).toHaveBeenCalledTimes(1);
	});

	it("passes throw:false through with the caller's params", async () => {
		mockRequest.mockResolvedValue(resp(200));
		await requestWithRetry({ url: "u", headers: { "User-Agent": "x" } });
		expect(mockRequest).toHaveBeenCalledWith({
			url: "u",
			headers: { "User-Agent": "x" },
			throw: false,
		});
	});

	it("retries a 503 and returns the eventual 200", async () => {
		mockRequest.mockResolvedValueOnce(resp(503)).mockResolvedValueOnce(resp(200));
		const p = requestWithRetry({ url: "u" });
		await vi.runAllTimersAsync();
		const res = await p;
		expect(res.status).toBe(200);
		expect(mockRequest).toHaveBeenCalledTimes(2);
	});

	it("gives up after 3 attempts and returns the final 5xx for the caller to map", async () => {
		mockRequest.mockResolvedValue(resp(503));
		const p = requestWithRetry({ url: "u" });
		await vi.runAllTimersAsync();
		const res = await p;
		expect(res.status).toBe(503);
		expect(mockRequest).toHaveBeenCalledTimes(3);
	});

	it.each([400, 401, 403, 404, 429])(
		"does NOT retry status %i (permanent for the request)",
		async (status) => {
			mockRequest.mockResolvedValue(resp(status));
			const res = await requestWithRetry({ url: "u" });
			expect(res.status).toBe(status);
			expect(mockRequest).toHaveBeenCalledTimes(1);
		},
	);

	it("retries a network failure, then succeeds", async () => {
		mockRequest.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(resp(200));
		const p = requestWithRetry({ url: "u" });
		await vi.runAllTimersAsync();
		const res = await p;
		expect(res.status).toBe(200);
		expect(mockRequest).toHaveBeenCalledTimes(2);
	});

	it("re-throws the last error when every attempt fails to connect", async () => {
		mockRequest.mockRejectedValue(new Error("offline"));
		const p = requestWithRetry({ url: "u" });
		const expectation = expect(p).rejects.toThrow("offline");
		await vi.runAllTimersAsync();
		await expectation;
		expect(mockRequest).toHaveBeenCalledTimes(3);
	});

	it("waits between attempts (does not hammer instantly)", async () => {
		mockRequest.mockResolvedValueOnce(resp(503)).mockResolvedValueOnce(resp(200));
		const p = requestWithRetry({ url: "u" });
		// Before any timer fires, only the first attempt has run.
		await Promise.resolve();
		expect(mockRequest).toHaveBeenCalledTimes(1);
		await vi.runAllTimersAsync();
		await p;
		expect(mockRequest).toHaveBeenCalledTimes(2);
	});
});
