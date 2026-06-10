import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{
		// tests/ and vitest.config.ts are excluded: they are not part of
		// tsconfig, which the type-aware obsidianmd rules require.
		ignores: [
			"main.js",
			"node_modules/",
			"tests/",
			"vitest.config.ts",
			"**/*.mjs",
			"**/*.json",
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
			},
		},
		rules: {
			// Heuristic can't tell proper nouns/acronyms (Google, Apple, ISBN,
			// API, DE) from Title Case; our UI strings already follow the real
			// sentence-case guideline.
			"obsidianmd/ui/sentence-case": "off",
		},
	},
);
