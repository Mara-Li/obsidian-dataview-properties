import { type PreparedFields, UtilsConfig } from "../interfaces";
import { convertToNumber, type Utils } from "../utils";
import { isRecognized } from "./fields_prepare";

export function cleanUpValue(
	value: string,
	cleanupFields: string[],
	recognizeRegexFn: (field: string) => RegExp | null,
	options: { lowerCase: boolean; ignoreAccents: boolean }
): string | null {
	if (!cleanupFields.length) return value;

	let result = value;
	const flags = options.lowerCase ? "i" : "";

	for (const field of cleanupFields) {
		const regex = recognizeRegexFn(field);
		if (regex) {
			result = result.replace(regex, "").trim();
			continue;
		}

		let targetField = field;
		let targetResult = result;

		if (options.ignoreAccents) {
			targetField = targetField.removeAccents();
			targetResult = targetResult.removeAccents();
		}

		const escaped = targetField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const searchRegExp = new RegExp(escaped, flags + (options.ignoreAccents ? "g" : ""));

		if (options.ignoreAccents) {
			// Supprime les occurrences en ignorant les accents
			let match: RegExpExecArray | null;
			let lastIndex = 0;
			let output = "";

			// biome-ignore lint/suspicious/noAssignInExpressions: useful for regex
			while ((match = searchRegExp.exec(targetResult)) !== null) {
				output += result.slice(lastIndex, match.index);
				lastIndex = match.index + field.length;
			}
			output += result.slice(lastIndex);
			result = output;
		} else {
			result = result.replace(searchRegExp, "");
		}
	}

	result = result.trim().replace(/\s+/g, " ");
	return result.length ? result : null;
}

export function correctValue(value: unknown, utils: Utils, fields: string[]) {
	const toClean = typeof value === "number" ? value.toString() : value;
	const result =
		typeof toClean === "string" ? utils.removeFromValue(toClean, fields) : toClean;
	return convertToNumber(result);
}

export function cleanList(
	utils: Utils,
	inline: Record<string, any>,
	fields: string[],
	ignored: PreparedFields,
	removedKey: Set<string>
) {
	const result: Record<string, any> = {};
	utils.useConfig(UtilsConfig.Cleanup);

	for (const [key, value] of Object.entries(inline || {})) {
		if (isRecognized(key, ignored, utils)) continue;

		const correctedValue = correctValue(value, utils, fields);

		if (correctedValue == null) {
			removedKey.add(key);
		} else {
			result[key] = correctedValue;
		}
	}

	return result;
}
