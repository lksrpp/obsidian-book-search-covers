# Build plan — Book Search & Covers

Status: **scaffolded** (v0.1.0). This file is the implementation roadmap.

## Goal

An Obsidian plugin that replaces the "Book Search" plugin's weak cover UX:
search a book, pick the right edition from a rich list, and create a note from a
user template with a **high-resolution cover**. Single user, BRAT-installed.

## Design decisions (settled)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Primary metadata | **Google Books** (keyed) | ISBN + pages + publisher in one call; strong EN & DE. Keyless path is dead (2026). |
| Search fallback | **Open Library** (keyless) | Only when Google returns 0 results. |
| Cover | **provider's own image** (Google upscaled to `coverSize` via `fife`, https-forced) | Revised 2026-06-10: testing showed Google's w800 renders are high quality — no Apple call at creation time. |
| Cover fix-up | **manual picker** via "Fetch or replace cover": candidates from Google + Apple, labeled by source | The user compares by eye instead of trusting an auto-pick. The Notable `pickBest` heuristic is parked (kept for tests / possible ranking of the picker list). No Open Library in the cover path (per owner's decision). |
| Templating | custom `{{var}}` | No Templater dep; reading-status/rating live in the user's template. |
| Selection UX | **single modal, debounced live search** (revised 2026-06-10) | One modal: type (600 ms debounce, min 3 chars) → rich result rows → refine in place. Debounce keeps the quota respected (~1 request per typing pause). Store + download mode overridable per search; settings hold the defaults. |
| Description | rich text via `volumes/{id}` GET | The search-list description is flattened to one paragraph; the single-volume record keeps publisher HTML (`<p>`, `<br><br>`). One extra request per created note converts it to markdown paragraphs (b/i stripped — malformed nesting in the wild). Verified empirically 2026-06-10. |
| Cover storage | link URL **or** download | Setting toggle; same primitive backfills existing notes. |
| Distribution | BRAT | Single-user; no community-store submission needed. |

## Architecture (current scaffold)

```
src/
  main.ts              Plugin: settings, 2 commands, ribbon. Orchestrates flows.
  model.ts             BookResult — the one internal book shape + helpers.
  search.ts            Google → Open Library fallback orchestration.
  cover.ts             collectCoverCandidates (Google + Apple, labeled) +
                       encodeCoverPath + download-to-vault.
  template.ts          {{var}} substitution + YAML-escape helper.
  note.ts              filename sanitize + collision-free note creation.
  settings.ts          settings interface, defaults, default template, setting tab.
  providers/
    google.ts          PRIMARY search → BookResult[]. Needs API key.
    openlibrary.ts     FALLBACK search → BookResult[]. Keyless.
    apple.ts           cover search + PURE ranking heuristic (ported from Notable;
                       heuristic currently parked — picker shows all candidates).
  ui/
    search-modal.ts    BookSearchModal (single modal: debounced live search,
                       keyboard nav, store + download overrides) + the shared
                       options row + openBookSearch().
    cover-picker.ts    CoverPickerModal — labeled cover grid (Google/Apple),
                       same options row; store change re-queries.
    folder-suggest.ts  FolderSuggest — AbstractInputSuggest folder picker
                       for settings text fields.
```

Two commands: **New book note** (search → pick → create note with the provider's
cover) and **Fetch or replace cover for current note** (reads note frontmatter
title/author, collects Google + Apple candidates, user picks from a labeled
grid, written back via `processFrontMatter`).

## Best-practice compliance (already applied)

- `requestUrl` everywhere (CORS-safe, mobile-safe) — never `fetch`.
- DOM helpers (`createEl`/`createDiv`) — no `innerHTML`.
- No inline styles — all in `styles.css` with Obsidian CSS variables.
- `this.app`, `normalizePath`, Vault API (`getFileByPath`/`createBinary`),
  `FileManager.processFrontMatter` for frontmatter edits.
- Settings tab uses `setHeading()`, sentence case, no "Settings" in headings.
- Commands have no default hotkeys; ids are unbprefixed.
- `manifest.json` + `versions.json` + `version-bump.mjs`; tags must equal the
  manifest version with **no `v` prefix**.
- `eslint-plugin-obsidianmd` flat config; `isDesktopOnly: false`.

## Phase 1 — make the core loop run (DO FIRST)

The scaffold compiles, but has not been run inside Obsidian. Verify end-to-end:

- [ ] `npm install && npm run build` clean (done at scaffold time — re-verify).
- [ ] Symlink/copy into a test vault's `.obsidian/plugins/book-search-cover/`
      (or point BRAT at the repo). `npm run dev` for watch builds.
- [ ] Add a Google Books API key in settings.
- [ ] New book note → search a known EN title and a known DE title → confirm the
      pick list shows covers + metadata, and the created note matches the template.
- [ ] Confirm the Google cover (w800, https, no curl) looks sharp in the created
      note; spot-check a book where Google has no image (note should be created
      coverless with the hint notice).
- [ ] Toggle cover mode to **download** → confirm the image lands in the cover
      folder and the note embeds the local path.
- [ ] Fetch-cover command on an existing note → picker shows Google + Apple
      candidates with correct badges; picking one updates the frontmatter
      (and downloads, in download mode).
- [ ] Test on mobile (or `app.emulateMobile(true)`).

## Phase 2 — robustness & polish

- [x] **Modal & settings UX overhaul** (done 2026-06-10): single search modal
      (debounced live search, arrow-key navigation, in-place query refinement);
      store + download-cover overrides in BOTH modals via a shared options row
      (settings hold the defaults); rich paragraph descriptions fetched from
      `volumes/{id}` on create (tested: list endpoint is flattened, volume GET
      has `<p>`/`<br><br>`/`<b>`/`<i>` — converted by
      `htmlDescriptionToMarkdown`, tested); settings tab per the official style
      guide (general settings unheaded at top, brief intro with the two
      commands, toggle for download-vs-link, store dropdown of full
      Apple-Books markets — BR/MX/PL excluded as free-books-only stores,
      folder autocompletion via AbstractInputSuggest, template reset buttons
      via the component's own change pipeline, collapsible template-variable
      reference from `VARIABLE_DOCS`).
- [x] **Cover flow redesign** (done 2026-06-10): creation now uses the search
      provider's own image directly (Google upscaled to `coverSize`) — no Apple
      call at creation, since Google's w800 renders proved high quality in
      testing. "Fetch or replace cover" became an interactive picker
      (`ui/cover-picker.ts`): Google + Apple candidates side by side in a grid,
      badged by source, user picks by eye. `pickBest` and friends in `apple.ts`
      are parked (kept for tests / possible ranking of the picker list).
- [x] **Cover-path review fixes** (done 2026-06-10): Google cover URLs forced to
      https (the API returns plain-http `imageLinks`, which iOS blocks — see the
      `cover:` line in the sample notes); Google fallback cover now honors the
      `coverSize` setting instead of a hardcoded `fife=w800`; downloaded cover
      paths are percent-encoded (`encodeCoverPath`) so `![cover]({{cover}})`
      survives spaces/`()`/`#` in titles; the "Fetching cover…" notices are
      hidden in `finally` so an unexpected throw can't leave a permanent notice.
- [x] **YAML safety** (done 2026-06-10): `renderNote` splits the template at the
      frontmatter boundary and YAML-escapes values only inside the frontmatter
      block, leaving the body raw. Assumes frontmatter string scalars are
      double-quoted (the default template is). Unquoted-scalar edge cases with
      special chars remain the template author's responsibility.
- [ ] **Series handling**: Google sometimes returns series info under
      `volumeInfo` / search heuristics; populate `seriesName`/`seriesNumber` for
      templates. (The Apple heuristic's series tiebreak is parked along with the
      heuristic — relevant again only if the picker list gets heuristic ranking.)
- [x] **ISBN from Apple artwork** (done 2026-06-10): when an Apple cover is
      picked in the picker and the note has no `isbn` frontmatter, the ISBN-13
      embedded in the artwork filename is written alongside the cover.
- [x] **Rate-limit / error UX** (done 2026-06-10): distinct notices for a
      rejected key (400/401/403, points at settings), daily quota (429, names
      the 1k free tier), and offline (network error).
- [x] **Duplicate detection** (done 2026-06-10, refined same day): scans every
      note's cached frontmatter (in-memory, O(notes), negligible). Two signals
      in `matchesBook` (pure, tested): same ISBN (`isbn`/`isbn13`/`isbn10`,
      dashes ignored — exact edition identity), or same title (case-insensitive)
      AND author token-overlap (handles `[[wikilink]]` lists, plain strings,
      "Soares, Nate" reversals via the Apple tokenizer). Title match with no
      usable author info on either side still warns. Vault-wide scan kept
      deliberately (book notes may live outside the note folder); warns before
      creating, never blocks.
- [x] **Cover preview on pick**: superseded by the cover-picker redesign
      (2026-06-10) — the fetch-cover command now IS the preview-and-choose flow.
- [x] **Cover filename alignment** (done 2026-06-10): the note path is reserved
      first (`reserveNotePath`), and both creation and the picker name the
      downloaded cover after the final note basename (dedup suffix included).
- [x] **Fetch-cover parity** (review nice-to-have): superseded by the
      cover-picker redesign (2026-06-10) — the user's eye replaces the
      subtitle/series tiebreaks, so `{title, author}` is enough for the search.
- [x] **Cover size clamp** (done 2026-06-10): `clampCoverSize` keeps the value
      in 100–2000, applied both in the settings tab and on settings load.
- [ ] **`normalizeTokens` min-length check** (review 2026-06-10): the filter is
      `tok.length > MIN_TOKEN_LEN` with `MIN_TOKEN_LEN = 2`, i.e. tokens must be
      ≥3 chars — 2-char words ("It", "Du", initials) never join the Jaccard
      overlap, while the constant name implies they should. Verify against the
      Notable original when porting its tests (Phase 3) and fix name or operator.

### "Match my real template" pass

The owner's actual book notes (see `docs/sample book notes/`) use Dataview/meta-bind
inline fields, reading-status/rating fields, `aliases`, and `author` as a YAML
**list of `[[wikilinks]]`**. Most of that lives in the owner's own template, but
a few plugin-side additions are needed to reproduce it faithfully:

- [x] **Multi-author YAML-list variable** (done 2026-06-10): `TemplateVars` now
      supports list values. A frontmatter line consisting of only `{{listVar}}`
      expands to a YAML block sequence (`  - "[[Eliezer Yudkowsky]]"` …),
      reusing the placeholder's own indentation (default two spaces); an empty
      list removes the line (property → null); items are YAML-escaped; used
      inline, lists render comma-joined. Shipped `{{authorsYamlLinks}}` and
      `{{categoriesYamlList}}`; the default template now uses both, which also
      fixes the author round-trip wart (fetch-cover's `pickAuthor` reads the
      list and strips the wikilink cleanly). Covered by `tests/template.test.ts`.
      NOTE: an existing vault's data.json keeps the OLD saved template — reset
      the note template (or paste the new default) to get the list style.
- [ ] Consider further companion variables (alias for the full title, etc.)
      once the owner's real template is finalized.
- [ ] Discuss: Including a link to a file in the fault (e.g., in a template folder) that allows easier editing of templates and re-using it

## Phase 3 — tests & release

- [ ] Unit-test the pure logic with Vitest: `apple.ts` (`pickBest` — parked in
      the product but kept tested, `normalizeTokens`, `resizeArtworkUrl`,
      `isbnFromArtworkUrl`), `note.ts` (`sanitizeFileName`),
      `google.ts`/`openlibrary.ts` `normalize` against captured JSON fixtures.
      (Port the existing Apple tests from the Notable app.) Vitest is set up
      (2026-06-10, `npm test`; `tests/` is outside tsconfig + eslint on
      purpose) with an "obsidian" module stub aliased in vitest.config.ts.
      Covered so far: `template.ts`, and `note.ts` (`matchesBook`,
      `sanitizeFileName`). Still to do: `apple.ts` pure functions and the
      provider `normalize` fixtures.
- [ ] `npm run lint` clean against `eslint-plugin-obsidianmd`.
- [ ] First GitHub release: tag = `0.1.0` (no `v`), attach `main.js`,
      `manifest.json`, `styles.css` as individual assets. Install via BRAT.
- [ ] README disclosures verified (network use, API key) for eventual
      community-store eligibility.

## Open questions / future

- Optional metadata enrichment from **DNB SRU** (authoritative German data) keyed
  by ISBN — deferred; only if Google's DE metadata proves thin in practice.
- ~~Live per-keystroke search (debounced) instead of the two-step prompt~~ —
  done 2026-06-10 as part of the single-modal redesign.
