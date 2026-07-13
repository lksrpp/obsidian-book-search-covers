import { readFileSync } from "fs";

// Mirrors the field/id/version-consistency checks the Obsidian community-plugin
// review bot runs on manifest.json/versions.json, so mistakes surface locally
// instead of at store review time.

const errors = [];

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const required = [
	"id",
	"name",
	"version",
	"minAppVersion",
	"description",
	"author",
	"isDesktopOnly",
];
for (const field of required) {
	if (manifest[field] === undefined || manifest[field] === "") {
		errors.push(`manifest.json is missing required field "${field}"`);
	}
}

if (manifest.id && !/^[a-z0-9-_]+$/.test(manifest.id)) {
	errors.push(
		`manifest.json "id" must be lowercase letters, digits, "-" or "_" (got "${manifest.id}")`,
	);
}
if (manifest.id && manifest.id.includes("obsidian")) {
	errors.push(`manifest.json "id" must not contain "obsidian" (got "${manifest.id}")`);
}

if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
	errors.push(`manifest.json "version" must look like x.y.z (got "${manifest.version}")`);
}
if (manifest.minAppVersion && !/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) {
	errors.push(
		`manifest.json "minAppVersion" must look like x.y.z (got "${manifest.minAppVersion}")`,
	);
}

if (manifest.authorUrl && /obsidian\.md/i.test(manifest.authorUrl)) {
	errors.push(`manifest.json "authorUrl" must not point to obsidian.md`);
}
if (manifest.fundingUrl && /obsidian\.md\/pricing/i.test(manifest.fundingUrl)) {
	errors.push(`manifest.json "fundingUrl" must not point to obsidian.md/pricing`);
}

if (manifest.version !== pkg.version) {
	errors.push(
		`manifest.json version ("${manifest.version}") does not match package.json version ("${pkg.version}")`,
	);
}

if (manifest.version && versions[manifest.version] === undefined) {
	errors.push(`versions.json has no entry for manifest version "${manifest.version}"`);
} else if (
	manifest.version &&
	versions[manifest.version] !== manifest.minAppVersion
) {
	errors.push(
		`versions.json["${manifest.version}"] ("${versions[manifest.version]}") does not match manifest.json minAppVersion ("${manifest.minAppVersion}")`,
	);
}

if (errors.length > 0) {
	console.error("manifest validation failed:");
	for (const error of errors) {
		console.error(`  - ${error}`);
	}
	process.exit(1);
}

console.log("manifest.json / versions.json OK");
