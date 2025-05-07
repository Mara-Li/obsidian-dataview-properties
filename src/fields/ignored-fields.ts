import type Utils from "../utils/text_utils";

export function prepareIgnoredFields(
	ignoredFields: string[],
	utils: Utils
): { ignoredKeys: Set<string>; ignoredRegex: RegExp[] } {
	const ignoredKeys = new Set<string>();
	const ignoredRegex: RegExp[] = [];

	if (!ignoredFields.length) return { ignoredKeys, ignoredRegex };

	for (const key of ignoredFields) {
		const processedKey = utils.processString(key);
		const regex = utils.recognizeRegex(key);
		if (regex) ignoredRegex.push(regex);
		else ignoredKeys.add(processedKey);
	}

	return { ignoredKeys, ignoredRegex };
}

export function isIgnored(
	key: string,
	ignoredKeys: Set<string>,
	ignoredRegex: RegExp[],
	utils: Utils
): boolean {
	if (!ignoredKeys.size && !ignoredRegex.length) return false;

	const processedKey = utils.processString(key);

	if (ignoredKeys.has(processedKey)) return true;

	return ignoredRegex.some((regex) => {
		regex.lastIndex = 0;
		return regex.test(processedKey);
	});
}
