import type { PreparedFields } from "../interfaces";
import type Utils from "../utils/text_utils";

export function prepareFields(
	fields: string[],
	utils: Utils
): { keys: Set<string>; regex: RegExp[] } {
	const keys = new Set<string>();
	const regex: RegExp[] = [];

	if (!fields.length) return { keys: keys, regex: regex };

	for (const key of fields) {
		const processedKey = utils.processString(key);
		const regexr = utils.recognizeRegex(key);
		if (regexr) regex.push(regexr);
		else keys.add(processedKey);
	}

	return { keys: keys, regex: regex };
}

export function isRecognized(
	key: string,
	prepared: PreparedFields,
	utils: Utils
): boolean {
	const { keys, regex } = prepared;
	if (!keys.size && !regex.length) return false;

	const processedKey = utils.processString(key);

	if (keys.has(processedKey)) return true;

	return regex.some((regex) => {
		regex.lastIndex = 0;
		return regex.test(processedKey);
	});
}
