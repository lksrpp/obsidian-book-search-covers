// iOS keyboard fix for the plugin's modals. Obsidian centers a base Modal
// vertically, but on iOS WKWebView the soft keyboard *overlays* the page
// instead of shrinking the layout viewport — so a centered modal has its lower
// half (footer dropdowns + results) hidden behind the keyboard, and `vh`/`dvh`
// and `window.visualViewport.height` all stay full-height (Safari/iOS is the
// documented exception that does not report the keyboard via visualViewport).
//
// The reliable signal is the Capacitor Keyboard plugin, which Obsidian is built
// on: it dispatches `keyboardWillShow`/`keyboardWillHide` DOM events on `window`
// carrying `keyboardHeight` (CSS px). We only *listen* to those events — we
// never import or re-register the plugin, so there's no conflict with Obsidian's
// own use of it. The height is written into a CSS variable the mobile stylesheet
// subtracts when capping the modal, and the modal's own container is flagged so
// it anchors to the top instead of staying centered behind the keyboard.
// Desktop is left untouched.

import { type Modal, Platform } from "obsidian";

/** The window keyboard events Capacitor dispatches carry the height directly.
 * Named to avoid shadowing the global DOM `KeyboardEvent` (a keydown event). */
type CapacitorKeyboardEvent = Event & {
	keyboardHeight?: number;
	detail?: { keyboardHeight?: number };
};

/** Call from a Modal's onOpen; returns a teardown to call from onClose. */
export function trackKeyboardViewport(modal: Modal): () => void {
	// Desktop: native centering and the vh-based caps are already correct, so do
	// nothing and hand back a no-op disposer.
	if (!Platform.isMobile) return () => {};

	// Flag this modal's own container, not the body: the duplicate dialog stacks
	// on top of the still-open search modal, and a global flag would top-anchor
	// that (and any other plugin's) modal too. The variable is set here too so it
	// inherits down to the modal element the stylesheet caps.
	const { containerEl } = modal;
	containerEl.addClass("bsc-anchor-top");

	const setKeyboardHeight = (px: number): void => {
		containerEl.style.setProperty("--bsc-kb-height", `${Math.max(0, px)}px`);
	};
	const onShow = (e: CapacitorKeyboardEvent): void => {
		setKeyboardHeight(e.keyboardHeight ?? e.detail?.keyboardHeight ?? 0);
	};
	const onHide = (): void => setKeyboardHeight(0);

	// willShow/willHide fire as the animation starts (so the modal reflows with
	// the keyboard rather than after); didShow corrects the height if the keyboard
	// resized mid-show (e.g. autocomplete bar, predictive text toggled).
	window.addEventListener("keyboardWillShow", onShow);
	window.addEventListener("keyboardDidShow", onShow);
	window.addEventListener("keyboardWillHide", onHide);
	window.addEventListener("keyboardDidHide", onHide);

	// Scroll-to-dismiss: when the user drags to scroll the results / cover grid,
	// drop focus so the keyboard slides away (which fires keyboardWillHide above,
	// resetting --bsc-kb-height to 0 and growing the modal to fill the freed
	// space). Matches the native iOS pattern (Messages, Safari, Mail).
	//
	// We listen to `touchmove`, not `scroll`, on purpose: both modals call
	// scrollIntoView() during arrow-key/pointer selection, which fires a `scroll`
	// event that would dismiss the keyboard the user is still typing into.
	// touchmove only fires on an actual finger drag. passive, so it never blocks.
	const scrollEl = modal.contentEl.querySelector<HTMLElement>(
		".bsc-results, .bsc-cover-grid",
	);
	const dismissKeyboard = (): void => {
		const active = activeDocument.activeElement;
		// Only blur a genuinely focused field. Once the keyboard is down
		// activeElement falls back to <body>, and touchmove fires continuously
		// during a drag — guard so we don't call blur() on body every frame.
		if (active instanceof HTMLElement && active !== activeDocument.body) {
			active.blur();
		}
	};
	scrollEl?.addEventListener("touchmove", dismissKeyboard, { passive: true });

	return () => {
		window.removeEventListener("keyboardWillShow", onShow);
		window.removeEventListener("keyboardDidShow", onShow);
		window.removeEventListener("keyboardWillHide", onHide);
		window.removeEventListener("keyboardDidHide", onHide);
		scrollEl?.removeEventListener("touchmove", dismissKeyboard);
		containerEl.removeClass("bsc-anchor-top");
		containerEl.style.removeProperty("--bsc-kb-height");
	};
}
