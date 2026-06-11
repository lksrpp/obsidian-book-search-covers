# Book Search & Covers

An Obsidian plugin that searches for a book, lets you pick the right edition from
a rich result list, and creates a note from your own template, including a
**high-resolution cover**.

It uses **Google Books** for metadata (titles, authors, ISBN, page count,
publisher; English and German), **Apple iTunes Search** for sharp hi-res
covers, and **Open Library** as the keyless search provider and as a fallback
when Google finds nothing.

> Single-user, self-hosted-minded. Installed privately via [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## How it works

1. Run **New book note** (ribbon icon or command).
2. Type to search. Results appear live, with cover, title, author, year and
   blurb. The store region and the cover storage mode can be changed right in
   the modal, for that search only.
3. Pick an edition. The note is created from your template in the note folder,
   with the search provider's cover image.

For a better cover, run **Fetch or replace cover for current note**: it
collects candidates from Google and Apple and shows them side by side, each
labeled with title, author, year and source API. It reads the note's
frontmatter `title` (file name if missing) and `author`/`authors` (plain text
or `[[wikilinks]]`); the chosen cover is written into the configured cover
property. Also handy for backfilling notes made with another plugin.

## Setup

1. Optional but recommended: get a free **Google Books API key**. Google Cloud
   console → create a project → enable the *Books API* → create an API key. No
   billing required (1,000 requests/day). Without a key, search uses Open
   Library instead, with leaner metadata.
2. Paste it into the plugin settings.
3. Set your default store (default `DE`), cover storage mode, and optionally a
   template file.

## Cover storage

- **Link URL** (default): the remote cover URL is written to the note.
  Lightest; needs internet to render.
- **Download into the vault**: the hi-res image is saved into your vault and
  referenced locally. Portable and offline; ~140 KB per cover at 800×800.

Both modals let you override the mode per search.

## Note template

The **Note template** in the settings comes pre-filled with a sensible default.
Tweak it right there (or don't, it works as-is). Power users can instead point
**Template file** at a regular note in the vault (with autocompletion, like
Templater's templates). It then overrides the inline template, and the button
next to the setting creates such a file from your current inline template so
nothing is lost when switching. If a configured file goes missing, note
creation falls back to the inline template and tells you.

Use `{{var}}` placeholders in the template (frontmatter + body):

`title`, `subtitle`, `author`, `authors`, `authorsYamlLinks` (YAML list of
`[[wikilinks]]`), `description`, `descriptionCallout` (the description as a
collapsed `> [!summary]-` callout; empty when there is no description; custom
callout title via `{{descriptionCallout:My title}}`),
`publisher`, `publishedDate`, `year`, `pageCount`, `isbn`, `isbn13`, `isbn10`,
`categories`, `categoriesYamlList`, `language`, `seriesName`, `seriesNumber`,
`source`, `cover`, `date` (note creation date, `YYYY-MM-DD`), `datetime`
(`YYYY-MM-DD HH:mm:ss`).

Reading status, rating, dates, tags, etc. are **not** built in by design; add
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

Built with the standard Obsidian + esbuild toolchain.

## License

MIT
