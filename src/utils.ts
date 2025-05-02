import { type TextOptions, UtilsConfig } from "./interfaces";

// Regex patterns compiled once for better performance
const NUMBER_REGEX = /^-?\d+e?\d*(\.\d+)?$/;
const REGEX_RECOGNITION = /\/(?<regex>.*)\/(?<flag>[gmiyuvsd]*)/;
const DUPLICATE_FLAG_REGEX = /(.)\1+/g;

/**
 * Verify if a value is a number, even if it's a "number" string
 * @param {unknown} value The value to verify
 * @return {boolean} True if the value is a number or a string that can be converted to a number
 */
export function isNumber(value: unknown): boolean {
	if (value == null) return false;
	if (typeof value === "number") return !Number.isNaN(value);
	if (typeof value !== "string" || !value.trim()) return false;

	return NUMBER_REGEX.test(value);
}

/**
 * Convert a value to number if possible
 * @param {unknown} value The value to convert
 * @return {number | unknown} The converted number or the original value
 */
export function convertToNumber(value: unknown): number | unknown {
	if (typeof value === "number") return value;
	if (isNumber(value)) return Number(value);
	return value;
}

export class Utils {
	private stringCache: Map<string, string> = new Map();
	private regexCache: Map<string, RegExp | null> = new Map();
	prefix: string = "[Dataview Properties]";
	private configs: Map<UtilsConfig, TextOptions> = new Map();
	private activeConfig: UtilsConfig = UtilsConfig.Default;

	constructor(options: TextOptions) {
		this.configs.set(UtilsConfig.Default, options);
	}
	setConfig(name: UtilsConfig, options: TextOptions): void {
		this.configs.set(name, options);
	}
	useConfig(name: UtilsConfig): boolean {
		if (!this.configs.has(name)) return false;
		this.activeConfig = name;
		return true;
	}
	private getOptions(): TextOptions {
		return this.configs.get(this.activeConfig) || this.configs.get(UtilsConfig.Default)!;
	}

	/**
	 * Remove duplicate regex flags
	 */
	private removeDuplicateFlag(input: string): string {
		return input.replace(DUPLICATE_FLAG_REGEX, "$1");
	}

	/**
	 * Parse a string to extract regex pattern and flags
	 */
	recognizeRegex(key: string): RegExp | null {
		if (this.regexCache.has(key)) return this.regexCache.get(key) || null;

		const match = key.match(REGEX_RECOGNITION);
		if (!match || !match.groups) {
			this.regexCache.set(key, null);
			return null;
		}

		try {
			const { regex, flag } = match.groups;
			const correctedFlag = this.removeDuplicateFlag(flag);
			const compiledRegex = new RegExp(regex, correctedFlag);

			// Cache the compiled regex
			this.regexCache.set(key, compiledRegex);
			return compiledRegex;
		} catch (e) {
			console.error(`${this.prefix} Error creating regex:`, e);
			this.regexCache.set(key, null);
			return null;
		}
	}

	/**
	 * Check if two keys match, considering case and accent options
	 */
	keysMatch(frontmatterKey: string, inlineKey: string): boolean {
		if (frontmatterKey === inlineKey) return true;
		const processedFmKey = this.processString(frontmatterKey);
		const processedInlineKey = this.processString(inlineKey);
		if (processedFmKey === processedInlineKey) return true;
		if (frontmatterKey.includes("/")) {
			const regex = this.recognizeRegex(frontmatterKey);
			if (regex && regex.test(inlineKey)) return true;
		}
		return false;
	}

	/**
	 * Process string based on options (lowercase, accent removal)
	 */
	processString(str: string): string {
		const options = this.getOptions();
		const cacheKey = `${str}_${options.lowerCase}_${options.ignoreAccents}`;
		const cached = this.stringCache.get(cacheKey);
		if (cached !== undefined) return cached;
		let result = str;
		if (options.lowerCase) result = result.toLowerCase();
		if (options.ignoreAccents) result = result.removeAccents();
		this.stringCache.set(cacheKey, result);
		return result;
	}

	/**
	 * Check if two values are equal
	 */
	valuesEqual(val1: any, val2: any): boolean {
		if (val1 === val2) return true;
		if (typeof val1 === "string" && typeof val2 === "string")
			return this.processString(val1) === this.processString(val2);
		if (
			(typeof val1 === "number" || isNumber(val1)) &&
			(typeof val2 === "number" || isNumber(val2))
		)
			return Number(val1) === Number(val2);
		return false;
	}

	/**
	 * Remove specified text patterns from a value
	 * @param value The value to clean
	 * @param fields The fields to remove
	 * @returns The cleaned value or null if empty
	 */
	removeFromValue(value: string, fields: string[]): string | null {
		const options = this.getOptions();
		if (!fields.length) return value;
		let result = value;
		const flags = options.lowerCase ? "i" : "";
		for (const field of fields) {
			const regex = this.recognizeRegex(field);
			if (regex) result = result.replace(regex, "");
			else {
				let fieldPattern = field;
				if (options.ignoreAccents) fieldPattern = fieldPattern.removeAccents();
				fieldPattern = fieldPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const fieldRegex = new RegExp(fieldPattern, flags);
				result = result.replace(fieldRegex, "");
			}
		}
		result = result.trim();
		return result.length ? result : null;
	}
}
