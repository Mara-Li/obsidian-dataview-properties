import type { TextOptions } from "./interfaces";

/**
 * Verify if a value is a number, even if it's a "number" string
 * @param value {unknown}
 * @returns {boolean}
 */
export function isNumber(value: unknown): boolean {
	return (
		value !== undefined &&
		(typeof value === "number" ||
			(!Number.isNaN(Number(value)) &&
				typeof value === "string" &&
				value.trim().length > 0))
	);
}

/**
 * Convert a number (string) to a number if it is a number
 * @param value {unknown}
 * @return {unknown|number}
 */
export function convertToNumber(value: unknown): number | unknown {
	if (isNumber(value)) {
		return Number(value);
	}
	return value;
}

export class Utils {
	options: TextOptions;

	constructor(options: TextOptions) {
		this.options = options;
	}

	private removeDuplicateFlag(input: string): string {
		return input.replace(/(.)\1+/g, "$1");
	}
	recognizeRegex(key: string) {
		const regRecognition = new RegExp(/\/(?<regex>.*)\/(?<flag>[gmiyuvsd]*)/);
		const match = key.match(regRecognition);
		if (match) {
			const { regex, flag } = match.groups!;
			//prevent flags to be multiple, aka only one of each
			const correctedFlag = this.removeDuplicateFlag(flag);
			return new RegExp(regex, correctedFlag);
		}
		return null;
	}
	keysMatch(frontmatterKey: string, inlineKey: string): boolean {
		const processedFmKey = this.processString(frontmatterKey);
		const processedInlineKey = this.processString(inlineKey);
		if (processedFmKey === processedInlineKey) return true;

		// Vérification par regex si la clé frontmatter est une regex
		const regex = this.recognizeRegex(frontmatterKey);
		if (regex && regex.test(inlineKey)) return true;

		return false;
	}

	processString(str: string): string {
		let result = str;
		if (this.options.lowerCase) result = result.toLowerCase();
		if (this.options.ignoreAccents) result = result.removeAccents();
		return result;
	}
	valuesEqual(val1: any, val2: any): boolean {
		if (val1 === val2) return true;
		if (typeof val1 === "string" && typeof val2 === "string") {
			return this.processString(val1) === this.processString(val2);
		}

		return false;
	}

	removeFromValue(value: string, fields: string[]): string | null {
		if (fields.length === 0) return value;
		for (let regex of fields) {
			let flags = "";
			if (this.options.lowerCase) flags += "i";
			if (this.options.ignoreAccents) regex = regex.removeAccents();
			const processedRegex = this.recognizeRegex(regex);
			if (processedRegex) {
				value = value.replace(processedRegex, "");
			} else {
				value = value.replace(new RegExp(regex, flags), "");
			}
		}
		value = value.trim();
		if (value.length === 0) return null;
		return value;
	}
}
