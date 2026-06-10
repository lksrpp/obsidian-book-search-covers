# Book Search & Covers

An Obsidian plugin that searches for a book, lets you pick the right edition from
a rich result list, and creates a note from your own template — with a
**high-resolution cover**.

It uses **Google Books** for metadata (titles, authors, ISBN, page count,
publisher — English and German), **Apple iTunes Search** for sharp hi-res
covers, and **Open Library** as a search fallback when Google finds nothing.

> Single-user, self-hosted-minded. Installed privately via [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## How it works

1. Run **New book note** (ribbon icon or command).
2. Type a query, then pick the matching book from the list (cover, title,
   author/year, blurb).
3. The plugin resolves the best cover — Apple first (ranked + filtered to avoid
   summaries/workbooks), falling back to Google's own image — fills your
   template, and creates the note.

There's also **Fetch or replace cover for current note**, which re-runs cover
resolution on an existing note using its `title`/`author` frontmatter — handy
for backfilling notes made with another plugin.

## Setup

1. Get a free **Google Books API key**: Google Cloud console → create a project →
   enable the *Books API* → create an API key. No billing required (1,000
   requests/day).
2. Paste it into the plugin settings.
3. Set your country code (default `DE`), cover storage mode, and — optionally —
   a template file.

## Cover storage

- **Link URL** (default): the remote cover URL is written to the note. Lightest;
  needs internet to render.
- **Download to folder**: the hi-res image is saved into your vault and
  referenced locally. Portable and offline; ~140 KB per cover at 800×800.

## Note template

The **Note template** in the settings comes pre-filled with a sensible default —
tweak it right there (or don't, it works as-is). Power users can instead point
**Template file** at a regular note in the vault (with autocompletion, like
Templater's templates) — it then overrides the inline template, and the button
next to the setting creates such a file from your current inline template so
nothing is lost when switching. If a configured file goes missing, note
creation falls back to the inline template and tells you.

Use `{{var}}` placeholders in the template (frontmatter + body):

`title`, `subtitle`, `author`, `authors`, `description`, `descriptionCallout`
(the description as a collapsed `> [!summary]-` callout), `publisher`,
`publishedDate`, `year`, `pageCount`, `isbn`, `isbn13`, `isbn10`, `categories`,
`language`, `seriesName`, `seriesNumber`, `source`, `cover`.

Reading status, rating, dates, tags, etc. are **not** built in by design — add
them to your own template file.

> **YAML note:** substitution is literal. The default template double-quotes
> scalar frontmatter values; keep free-form text like `{{description}}` in the
> note body, not in frontmatter.

## Network use & privacy

This plugin makes requests to `googleapis.com` (with your API key),
`itunes.apple.com`, and `openlibrary.org` to fetch book data and covers. Your
API key is stored locally in the plugin's `data.json` and is never sent anywhere
except Google. No telemetry.

## Development

```bash
npm install
npm run dev     # watch build → main.js
npm run build   # typecheck + production build
npm run lint    # eslint-plugin-obsidianmd
```

Built with the standard Obsidian + esbuild toolchain. See
[`docs/build-plan.md`](docs/build-plan.md) for the implementation roadmap.

## License

MIT
