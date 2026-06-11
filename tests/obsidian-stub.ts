// Minimal stand-in for the "obsidian" package so modules that import it can be
// unit-tested (vitest aliases "obsidian" here — see vitest.config.ts). Only the
// pure pieces are real; anything touching the app/network throws.

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/|\/$/g, "");
}

export function requestUrl(): never {
	throw new Error("requestUrl is not available in unit tests");
}

export class TFile {}
export class TFolder {}
export class App {}
export class Modal {}
export class SuggestModal {}
export class AbstractInputSuggest {}
export class Notice {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class DropdownComponent {}
export function setIcon(): void {}
export function setTooltip(): void {}
export function debounce<T>(fn: T): T {
	return fn;
}
