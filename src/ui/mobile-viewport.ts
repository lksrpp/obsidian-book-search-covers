// iOS keyboard fix for the plugin's modals. Obsidian centers a base Modal
// vertically, but on iOS WKWebView the soft keyboard *overlays* the page
// instead of shrinking the layout viewport — so `vh`/`dvh` stay full-height and
// the keyboard ends up covering the modal's lower half (footer dropdowns and
// part of the results). The visualViewport API is the only signal that reflects
// the space *above* the keyboard; we write its height into a CSS variable the
// mobile stylesheet uses to cap the modal, and flag the modal's own container
// so it anchors to the top instead of staying centered behind the keyboard.
// Desktop and any webview without visualViewport are left untouched.

import { Platform } from "obsidian";

/** Call from a Modal's onOpen; returns a teardown to call from onClose. */
export function trackKeyboardViewport(modalEl: HTMLElement): () => void {
	const vv = window.visualViewport;
	// Desktop, or a webview without the API: native centering and the vh-based
	// caps are already correct, so do nothing and hand back a no-op disposer.
	if (!Platform.isMobile || !vv) return () => {};

	// Flag this modal's own .modal-container, not the body: the duplicate
	// dialog stacks on top of the still-open search modal, and a global flag
	// would top-anchor that (and any other plugin's) modal too.
	const container = modalEl.closest(".modal-container");
	container?.addClass("bsc-anchor-top");
	const apply = (): void => {
		// Height available above the keyboard. offsetTop is normally 0 (Obsidian
		// locks page scroll under the modal); subtract it defensively so a
		// non-zero offset never lets the modal grow back under the keyboard.
		const height = Math.max(0, vv.height - vv.offsetTop);
		modalEl.style.setProperty("--bsc-vv-height", `${height}px`);
	};
	apply();
	// resize fires on keyboard show/hide and on rotation; scroll fires when the
	// visual viewport pans (e.g. focus auto-scroll) — both change usable height.
	vv.addEventListener("resize", apply);
	vv.addEventListener("scroll", apply);

	return () => {
		vv.removeEventListener("resize", apply);
		vv.removeEventListener("scroll", apply);
		container?.removeClass("bsc-anchor-top");
		modalEl.style.removeProperty("--bsc-vv-height");
	};
}
