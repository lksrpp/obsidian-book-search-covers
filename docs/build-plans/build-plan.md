# Build plan — Book Search & Cover

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
| Cover | **Apple iTunes Search** → Google's own image | Apple = sharpest covers + bilingual store; ranking heuristic ported from the Notable app avoids summary/workbook squatters. |
| Cover fallback | search provider's image | No Open Library in the cover path (per owner's decision). |
| Templating | custom `{{var}}` | No Templater dep; reading-status/rating live in the user's template. |
| Selection UX | two-step (query → pick list) | One API call per query — respects Google's 1k/day free quota. |
| Cover storage | link URL **or** download | Setting toggle; same primitive backfills existing notes. |
| Distribution | BRAT | Single-user; no community-store submission needed. |

## Architecture (current scaffold)

```
src/
  main.ts              Plugin: settings, 2 commands, ribbon. Orchestrates flows.
  model.ts             BookResult — the one internal book shape + helpers.
  search.ts            Google → Open Library fallback orchestration.
  cover.ts             resolveCover (Apple→provider) + download-to-vault.
  template.ts          {{var}} substitution + YAML-escape helper.
  note.ts              filename sanitize + collision-free note creation.
  settings.ts          settings interface, defaults, default template, setting tab.
  providers/
    google.ts          PRIMARY search → BookResult[]. Needs API key.
    openlibrary.ts     FALLBACK search → BookResult[]. Keyless.
    apple.ts           cover search + PURE ranking heuristic (ported from Notable).
  ui/
    search-modal.ts    QueryModal + BookSuggestModal + openBookSearch().
```

Two commands: **New book note** (search → pick → resolve cover → create note) and
**Fetch or replace cover for current note** (reads note frontmatter title/author,
re-resolves cover, writes it back via `processFrontMatter`).

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
- [ ] Confirm Apple cover resolution picks the right cover (spot-check against
      the Notable app's behaviour); confirm fallback to Google's image when Apple
      returns none.
- [ ] Toggle cover mode to **download** → confirm the image lands in the cover
      folder and the note embeds the local path.
- [ ] Fetch-cover command on an existing note → confirm frontmatter updates.
- [ ] Test on mobile (or `app.emulateMobile(true)`).

## Phase 2 — robustness & polish

- [x] **YAML safety** (done 2026-06-10): `renderNote` splits the template at the
      frontmatter boundary and YAML-escapes values only inside the frontmatter
      block, leaving the body raw. Assumes frontmatter string scalars are
      double-quoted (the default template is). Unquoted-scalar edge cases with
      special chars remain the template author's responsibility.
- [ ] **Series handling**: Google sometimes returns series info under
      `volumeInfo` / search heuristics; populate `seriesName`/`seriesNumber` so
      the Apple heuristic's series tiebreak actually fires.
- [ ] **ISBN from Apple artwork**: `isbnFromArtworkUrl` exists — opportunistically
      backfill a missing ISBN from the chosen cover's filename.
- [ ] **Rate-limit / error UX**: friendlier notices for bad key (401), quota
      (429), offline.
- [ ] **Duplicate detection**: warn (don't block) if a note with the same ISBN
      or title already exists.
- [ ] **Cover preview on pick**: optionally show the resolved hi-res cover before
      writing, with a "choose a different Apple candidate" affordance.
- [ ] **Cover filename alignment** (review nice-to-have): downloaded cover is named
      from the raw title and can collide/diverge from the de-duplicated note
      basename. Derive the cover basename from the final note basename.
- [ ] **Fetch-cover parity** (review nice-to-have): `fetchCoverForNote` builds only
      `{title, author}`; read `subtitle` + series fields from frontmatter too so
      `pickBest`'s subtitle/series tiebreaks fire for existing notes.
- [ ] **Cover size clamp** (review nice-to-have): clamp `coverSize` to a sane max so
      an absurd value doesn't silently yield no cover.

### "Match my real template" pass

The owner's actual book notes (see `docs/sample book notes/`) use Dataview/meta-bind
inline fields, reading-status/rating fields, `aliases`, and `author` as a YAML
**list of `[[wikilinks]]`**. Most of that lives in the owner's own template, but
a few plugin-side additions are needed to reproduce it faithfully:

- [ ] **Multi-author YAML-list variable**: a flat `{{authors}}` can't expand to N
      list items. Add a variable (e.g. `{{authorsYamlLinks}}`) that emits a
      YAML block-sequence of wikilinks, so a template can do:
      ```yaml
      author:
      {{authorsYamlLinks}}
      ```
      → `  - "[[Eliezer Yudkowsky]]"` / `  - "[[Nate Soares]]"`. Decide indent
      handling and how it interacts with the frontmatter-escaping in `renderNote`.
      Required: Research best practices, probably some guidance available.
- [ ] Consider companion list/link variables in the same spirit if needed
      (`{{categoriesYamlList}}`, alias for the full title, etc.) once the owner's
      real template is finalized.
- [ ] Discuss: Including a link to a file in the fault (e.g., in a template folder) that allows easier editing of templates and re-using it

## Phase 3 — tests & release

- [ ] Unit-test the pure logic with Vitest: `apple.ts` (`pickBest`,
      `normalizeTokens`, `resizeArtworkUrl`, `isbnFromArtworkUrl`), `template.ts`
      (`renderTemplate`, `escapeYamlDouble`), `note.ts` (`sanitizeFileName`),
      `google.ts`/`openlibrary.ts` `normalize` against captured JSON fixtures.
      (Port the existing Apple tests from the Notable app.)
- [ ] `npm run lint` clean against `eslint-plugin-obsidianmd`.
- [ ] First GitHub release: tag = `0.1.0` (no `v`), attach `main.js`,
      `manifest.json`, `styles.css` as individual assets. Install via BRAT.
- [ ] README disclosures verified (network use, API key) for eventual
      community-store eligibility.

## Open questions / future

- Optional metadata enrichment from **DNB SRU** (authoritative German data) keyed
  by ISBN — deferred; only if Google's DE metadata proves thin in practice.
- Live per-keystroke search (debounced) instead of the two-step prompt — only if
  the quota allows and the UX gain is worth it.
