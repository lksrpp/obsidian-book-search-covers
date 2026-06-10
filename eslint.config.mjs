import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{
		ignores: ["main.js", "node_modules/", "**/*.mjs", "**/*.json"],
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
