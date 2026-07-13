# Release process

> Created: 2026-06-11

How to ship a new version of this plugin, and (one-time) how to get it into the Obsidian community directory. If something looks off, check the sources at the bottom; the process changed before (PR-based → portal).

## What a release is

Users install exactly three files, attached as assets to a GitHub release: `main.js`, `manifest.json`, `styles.css`. Everything else (README, docs, src) is read from the repo's default branch or not used at all. Consequence:

- **README/docs changes**: just commit and push. No release needed.
- **Code, manifest, or style changes**: need a new release to reach users.

## Cutting a release

1. Make sure `main` is green: `npm test && npm run build && npm run lint`.
2. Bump the version (updates `package.json`, `manifest.json`, `versions.json` via `version-bump.mjs`, and stages the latter two):

   ```bash
   npm version patch        # or minor / major / an explicit x.y.z
   git push origin main
   ```

3. Tag and push. The tag must equal the version in `manifest.json` exactly — semantic versioning, **no `v` prefix**:

   ```bash
   git tag -a 1.0.1 -m "1.0.1"
   git push origin 1.0.1
   ```

4. The `release.yml` GitHub Action triggers on the tag: it runs the tests, builds, and creates a **draft** release with the three assets attached.
5. Review the draft at GitHub → Releases, add release notes, and **publish**. Nothing is visible to users until this step.

If the workflow fails, fix the problem on `main`, then move the tag:

```bash
git tag -d 1.0.1
git push origin :refs/tags/1.0.1
git tag -a 1.0.1 -m "1.0.1"
git push origin 1.0.1
```

Once the plugin is listed in the directory, published releases are picked up automatically. No re-submission is needed for updates.

## One-time: submitting to the community directory

Since ~2026 this runs through the Obsidian Community portal, not pull requests against `obsidianmd/obsidian-releases`:

1. Have at least one published (non-draft) release.
2. Repo must contain `README.md`, `LICENSE`, and `manifest.json` at the root. The directory reads `manifest.json` from the HEAD of the default branch, so it must match the released version.
3. Sign in at <https://community.obsidian.md> with the Obsidian account and link the GitHub account.
4. Go to the plugins section at <https://community.obsidian.md/account/plugins> → New plugin → enter `lksrpp/obsidian-book-search-covers`, accept the developer policies, submit.
5. An automated review scans the code (security, API usage, guidelines). Address feedback by pushing fixes and publishing a new release with a bumped version; re-review happens against the new release.

Before submitting, re-check the [plugin guidelines] and [developer policies], and run `npm run lint`. It chains three checks that mirror the automated review: `eslint` (obsidianmd recommended rules: deprecated APIs, unsafe casts, sample-plugin leftovers, ...), `stylelint` (CSS browser-compat via `.stylelintrc.json`, targeting the Chromium version bundled with `minAppVersion` — bump the `browserslist` entry in `package.json` if `minAppVersion` changes), and `scripts/validate-manifest.mjs` (manifest/versions.json field and consistency checks). Not everything is covered — listener/interval cleanup, no views opened on `onload`, and mobile testing (`isDesktopOnly: false`) still need a manual look.

## Sources

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Release your plugin with GitHub Actions](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions)
- [Submission requirements for plugins](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)
- [The future of Obsidian plugins](https://obsidian.md/blog/future-of-plugins/) (portal + automated review announcement)

[plugin guidelines]: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
[developer policies]: https://docs.obsidian.md/Developer+policies
