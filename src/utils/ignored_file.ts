import type { App, TFile } from "obsidian";
import type { Ignore } from "../interfaces";

function isExcludedByPath(excluded: Ignore, file: TFile): boolean {
	if (excluded.files.length === 0) return false;
	const filePath = file.path;
	return excluded.files.some((pattern) => {
		if (pattern.startsWith("/")) {
			// Regex pattern
			const splitted = pattern.split("/").filter((x) => x.length); //-> should be ['regex', 'flags']

			if (splitted.length < 1) {
				console.warn(
					`[Dataview Properties] Invalid regex pattern: ${pattern}. It should be in the format '/regex/flags'.`
				);
				return false;
			}
			const [regexPattern, flags] = splitted;
			//verify if flags are valid
			const regex = new RegExp(regexPattern, validateFlags(flags));
			return regex.test(filePath);
		} else {
			// String pattern
			return filePath.includes(pattern);
		}
	});
}

function isExcludedByFrontmatter(file: TFile, keyName: string, app: App) {
	if (!file) return false;
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!frontmatter) return false;
	return frontmatter[keyName] === true || frontmatter[keyName] === "true";
}

export function isExcluded(excluded: Ignore, file: TFile, app: App): boolean {
	if (isExcludedByPath(excluded, file)) {
		return true;
	}
	if (isExcludedByFrontmatter(file, excluded.keyName, app)) {
		return true;
	}
	return false;
}

function validateFlags(flags: string): string {
	if (!flags?.length || !flags) return "";
	const validFlags = /^[gmiyuvsd]*$/;
	//also we need to remove the duplicated flags
	const uniqueFlags = new Set(flags.split(""));
	if (!validFlags.test(flags)) {
		console.warn(
			`[Dataview Properties] Invalid flags: ${flags}. Valid flags are: g, m, i, y, u, v, s, d.`
		);
		return "";
	}
	return Array.from(uniqueFlags).join("");
}
